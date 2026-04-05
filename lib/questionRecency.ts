import { randomUUID } from "crypto"

import type { RoomRoundPlan } from "@/lib/roomRoundPlan"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export type QuestionUsageInfo = {
  recentUseCount: number
  mostRecentGameOffset: number | null
  lastSelectedAt: string | null
}

const DEFAULT_RECENT_GAME_LIMIT = 8
const DEFAULT_RECENT_ROW_SCAN_LIMIT = 1000

type HistoryRow = {
  selection_group_id: string | null
  question_id: string | null
  selected_at: string | null
}

type HistoryInsertRow = {
  selection_group_id: string
  room_id: string
  question_id: string
  round_index: number
  round_name: string
  behaviour_type: string
}

function cleanIds(values: string[]) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))]
}

function shuffleInPlace<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = items[i]
    items[i] = items[j]
    items[j] = tmp
  }
}

export async function loadRecentQuestionUsage(params: {
  questionIds: string[]
  recentGameLimit?: number
  rowScanLimit?: number
}): Promise<Record<string, QuestionUsageInfo>> {
  const questionIds = cleanIds(params.questionIds)
  if (!questionIds.length) return {}

  try {
    const recentGameLimit = Math.max(1, Math.floor(Number(params.recentGameLimit ?? DEFAULT_RECENT_GAME_LIMIT)) || DEFAULT_RECENT_GAME_LIMIT)
    const rowScanLimit = Math.max(recentGameLimit * 25, Math.floor(Number(params.rowScanLimit ?? DEFAULT_RECENT_ROW_SCAN_LIMIT)) || DEFAULT_RECENT_ROW_SCAN_LIMIT)

    const res = await supabaseAdmin
      .from("question_selection_history")
      .select("selection_group_id, question_id, selected_at")
      .order("selected_at", { ascending: false })
      .limit(rowScanLimit)

    if (res.error) {
      console.error("loadRecentQuestionUsage failed", res.error)
      return {}
    }

    const rows = ((res.data ?? []) as HistoryRow[])
      .map((row) => ({
        selectionGroupId: String(row.selection_group_id ?? "").trim(),
        questionId: String(row.question_id ?? "").trim(),
        selectedAt: row.selected_at ? String(row.selected_at) : null,
      }))
      .filter((row) => row.selectionGroupId)

    if (!rows.length) return {}

    const recentGroupIds: string[] = []
    const seenGroupIds = new Set<string>()
    for (const row of rows) {
      if (seenGroupIds.has(row.selectionGroupId)) continue
      seenGroupIds.add(row.selectionGroupId)
      recentGroupIds.push(row.selectionGroupId)
      if (recentGroupIds.length >= recentGameLimit) break
    }

    if (!recentGroupIds.length) return {}

    const groupOffsetById = new Map<string, number>()
    recentGroupIds.forEach((groupId, index) => {
      groupOffsetById.set(groupId, index)
    })

    const candidateIds = new Set(questionIds)
    const seenQuestionGroup = new Set<string>()
    const usageByQuestionId: Record<string, QuestionUsageInfo> = {}

    for (const row of rows) {
      if (!candidateIds.has(row.questionId)) continue
      const groupOffset = groupOffsetById.get(row.selectionGroupId)
      if (groupOffset == null) continue

      const dedupeKey = `${row.questionId}::${row.selectionGroupId}`
      if (seenQuestionGroup.has(dedupeKey)) continue
      seenQuestionGroup.add(dedupeKey)

      const existing = usageByQuestionId[row.questionId] ?? {
        recentUseCount: 0,
        mostRecentGameOffset: null,
        lastSelectedAt: null,
      }

      existing.recentUseCount += 1
      existing.mostRecentGameOffset =
        existing.mostRecentGameOffset == null ? groupOffset : Math.min(existing.mostRecentGameOffset, groupOffset)
      if (!existing.lastSelectedAt && row.selectedAt) {
        existing.lastSelectedAt = row.selectedAt
      }

      usageByQuestionId[row.questionId] = existing
    }

    return usageByQuestionId
  } catch (error) {
    console.error("loadRecentQuestionUsage crashed", error)
    return {}
  }
}

export function prioritiseItemsByRecentUsage<T extends { id: string }>(
  items: T[],
  usageById: Record<string, QuestionUsageInfo>
) {
  const shuffled = [...items]
  shuffleInPlace(shuffled)

  shuffled.sort((a, b) => {
    const usageA = usageById[a.id]
    const usageB = usageById[b.id]

    const recentUseCountA = usageA?.recentUseCount ?? 0
    const recentUseCountB = usageB?.recentUseCount ?? 0
    if (recentUseCountA !== recentUseCountB) return recentUseCountA - recentUseCountB

    const gameOffsetA = usageA?.mostRecentGameOffset
    const gameOffsetB = usageB?.mostRecentGameOffset
    const recencyRankA = gameOffsetA == null ? Number.POSITIVE_INFINITY : gameOffsetA
    const recencyRankB = gameOffsetB == null ? Number.POSITIVE_INFINITY : gameOffsetB
    if (recencyRankA !== recencyRankB) return recencyRankB - recencyRankA

    const lastSelectedAtA = usageA?.lastSelectedAt ? Date.parse(usageA.lastSelectedAt) : 0
    const lastSelectedAtB = usageB?.lastSelectedAt ? Date.parse(usageB.lastSelectedAt) : 0
    return lastSelectedAtA - lastSelectedAtB
  })

  return shuffled
}

export function createQuestionSelectionGroupId() {
  return randomUUID()
}

function buildHistoryRows(params: {
  roomId: string
  selectionGroupId: string
  roundPlan: RoomRoundPlan
}) {
  const roomId = String(params.roomId ?? "").trim()
  const selectionGroupId = String(params.selectionGroupId ?? "").trim()
  if (!roomId || !selectionGroupId) return [] as HistoryInsertRow[]

  const rows: HistoryInsertRow[] = []
  params.roundPlan.rounds.forEach((round, roundIndex) => {
    round.questionIds.map(String).filter(Boolean).forEach((questionId) => {
      rows.push({
        selection_group_id: selectionGroupId,
        room_id: roomId,
        question_id: questionId,
        round_index: roundIndex,
        round_name: round.name,
        behaviour_type: round.behaviourType,
      })
    })
  })

  return rows
}

export async function logQuestionSelectionHistory(params: {
  roomId: string
  selectionGroupId: string
  roundPlan: RoomRoundPlan
}) {
  const rows = buildHistoryRows(params)
  if (!rows.length) return

  try {
    const res = await supabaseAdmin.from("question_selection_history").insert(rows)
    if (res.error) {
      console.error("logQuestionSelectionHistory failed", res.error)
    }
  } catch (error) {
    console.error("logQuestionSelectionHistory crashed", error)
  }
}
