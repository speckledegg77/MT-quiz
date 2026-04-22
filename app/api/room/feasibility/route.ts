export const runtime = "nodejs"

import { NextResponse } from "next/server"

import {
  buildQuestionCandidatesFromPackRows,
  evaluateRoundsFeasibility,
  type RoundFeasibilityInput,
} from "@/lib/roundFeasibility"
import type { QuestionCandidate } from "@/lib/manualRoundPlanBuilder"
import type { RoundSelectionRules } from "@/lib/roomRoundPlan"
import { buildSpotlightSyntheticQuestionId, cleanSpotlightDifficulty } from "@/lib/spotlight"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

function cleanStringArray(raw: unknown) {
  if (!Array.isArray(raw)) return [] as string[]
  return raw.map((value) => String(value ?? "").trim()).filter(Boolean)
}

function cleanMediaTypeArray(raw: unknown): Array<"text" | "audio" | "image"> {
  return cleanStringArray(raw).filter((value): value is "text" | "audio" | "image" => {
    return value === "text" || value === "audio" || value === "image"
  })
}

function cleanSelectionRules(raw: unknown): RoundSelectionRules {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    mediaTypes: cleanMediaTypeArray(value.mediaTypes),
    answerTypes: cleanStringArray(value.answerTypes).filter(
      (item): item is "mcq" | "text" => item === "mcq" || item === "text"
    ),
    promptTargets: cleanStringArray(value.promptTargets),
    clueSources: cleanStringArray(value.clueSources),
    primaryShowKeys: cleanStringArray(value.primaryShowKeys),
    audioClipTypes: cleanStringArray(value.audioClipTypes),
    spotlightDifficulties: cleanStringArray(value.spotlightDifficulties ?? value.headsUpDifficulties),
  }
}

function cleanRounds(raw: unknown): RoundFeasibilityInput[] {
  if (!Array.isArray(raw)) return []
  return raw.map((value, index) => {
    const item = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
    const behaviourRaw = String(item.behaviourType ?? "standard").trim().toLowerCase()
    return {
      id: String(item.id ?? `round_${index + 1}`).trim() || `round_${index + 1}`,
      name: String(item.name ?? "").trim(),
      questionCount: Math.max(0, Math.floor(Number(item.questionCount ?? 0)) || 0),
      behaviourType: behaviourRaw === "quickfire" ? "quickfire" : behaviourRaw === "spotlight" || behaviourRaw === "heads_up" ? "spotlight" : "standard",
      sourceMode:
        String(item.sourceMode ?? "selected_packs").trim().toLowerCase() === "specific_packs"
          ? "specific_packs"
          : String(item.sourceMode ?? "selected_packs").trim().toLowerCase() === "all_questions"
            ? "all_questions"
            : "selected_packs",
      packIds: cleanStringArray(item.packIds),
      selectionRules: cleanSelectionRules(item.selectionRules),
    } satisfies RoundFeasibilityInput
  })
}

function buildHeadsUpCandidatesFromPackRows(rows: Array<Record<string, unknown>>): QuestionCandidate[] {
  const candidatesById = new Map<string, QuestionCandidate>()
  for (const row of rows) {
    const packId = String(row?.pack_id ?? "").trim()
    const itemId = String(row?.item_id ?? "").trim()
    if (!packId || !itemId) continue
    const item = (row?.spotlight_items ?? {}) as Record<string, unknown>
    const existing = candidatesById.get(itemId)
    if (existing) {
      if (!existing.packIds.includes(packId)) existing.packIds.push(packId)
      continue
    }
    candidatesById.set(itemId, {
      id: buildSpotlightSyntheticQuestionId(itemId),
      kind: "spotlight",
      legacyRoundType: "general",
      answerType: "text",
      mediaType: "text",
      promptTarget: null,
      clueSource: null,
      primaryShowKey: item.primary_show_key ? String(item.primary_show_key) : null,
      mediaDurationMs: null,
      audioClipType: null,
      packIds: [packId],
      spotlightDifficulty: cleanSpotlightDifficulty(String(item.difficulty ?? "medium")),
    })
  }
  return [...candidatesById.values()]
}

async function fetchAllPackQuestionRows(packIds: string[]) {
  const cleanedPackIds = [...new Set(cleanStringArray(packIds))]
  if (cleanedPackIds.length === 0) return [] as Array<Record<string, unknown>>

  const pageSize = 1000
  const rows: Array<Record<string, unknown>> = []

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const res = await supabaseAdmin
      .from("pack_questions")
      .select(
        "pack_id, question_id, questions(round_type, answer_type, media_type, prompt_target, clue_source, primary_show_key, media_duration_ms, audio_clip_type)"
      )
      .in("pack_id", cleanedPackIds)
      .range(from, to)

    if (res.error) throw new Error(res.error.message)

    const batch = (res.data ?? []) as Array<Record<string, unknown>>
    rows.push(...batch)

    if (batch.length < pageSize) break
  }

  return rows
}

async function fetchAllHeadsUpPackItemRows(packIds: string[]) {
  const cleanedPackIds = [...new Set(cleanStringArray(packIds))]
  if (cleanedPackIds.length === 0) return [] as Array<Record<string, unknown>>

  const pageSize = 1000
  const rows: Array<Record<string, unknown>> = []

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const res = await supabaseAdmin
      .from("spotlight_pack_items")
      .select("pack_id, item_id, spotlight_items(id, difficulty, primary_show_key, is_active)")
      .in("pack_id", cleanedPackIds)
      .range(from, to)

    if (res.error) throw new Error(res.error.message)

    const batch = (res.data ?? []) as Array<Record<string, unknown>>
    rows.push(...batch)

    if (batch.length < pageSize) break
  }

  return rows
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))

    const selectedPackIds = [...new Set(cleanStringArray(body.selectedPackIds))]
    const manualRounds = cleanRounds(body.manualRounds)
    const templateRounds = cleanRounds(body.templateRounds)
    const allRounds = [...manualRounds, ...templateRounds]

    const questionRounds = allRounds.filter((round) => round.behaviourType !== "spotlight")
    const headsUpRounds = allRounds.filter((round) => round.behaviourType === "spotlight")

    const needsAllQuestions = questionRounds.some((round) => round.sourceMode === "all_questions")
    let allActivePackIds: string[] = []

    if (needsAllQuestions) {
      const packsRes = await supabaseAdmin.from("packs").select("id").eq("is_active", true)
      if (packsRes.error) return NextResponse.json({ error: packsRes.error.message }, { status: 500 })
      allActivePackIds = cleanStringArray((packsRes.data ?? []).map((row: { id?: string | null }) => row.id))
    }

    const specificQuestionPackIds = [...new Set(questionRounds.flatMap((round) => cleanStringArray(round.packIds)))]
    const scopeQuestionPackIds = [...new Set([...selectedPackIds, ...specificQuestionPackIds, ...allActivePackIds])]

    const specificHeadsUpPackIds = [...new Set(headsUpRounds.flatMap((round) => cleanStringArray(round.packIds)))]

    let candidates: QuestionCandidate[] = []
    let selectedCandidates: QuestionCandidate[] = []

    if (selectedPackIds.length > 0) {
      const selectedLinks = await fetchAllPackQuestionRows(selectedPackIds)
      selectedCandidates = buildQuestionCandidatesFromPackRows(selectedLinks)
    }

    if (scopeQuestionPackIds.length > 0) {
      const links = await fetchAllPackQuestionRows(scopeQuestionPackIds)
      candidates = candidates.concat(buildQuestionCandidatesFromPackRows(links))
    }

    if (specificHeadsUpPackIds.length > 0) {
      const headsUpLinks = await fetchAllHeadsUpPackItemRows(specificHeadsUpPackIds)

      const activeRows = (headsUpLinks as Array<Record<string, unknown>>).filter((row) => {
        const item = row?.spotlight_items
        const value = Array.isArray(item) ? item[0] : item
        return Boolean(value && (value as Record<string, unknown>).is_active !== false)
      }).map((row) => {
        const item = row?.spotlight_items
        const value = Array.isArray(item) ? item[0] : item
        return { ...row, spotlight_items: value } as Record<string, unknown>
      })

      candidates = candidates.concat(buildHeadsUpCandidatesFromPackRows(activeRows))
    }

    const manual = manualRounds.length
      ? evaluateRoundsFeasibility({ roundsInput: manualRounds, selectedPackIds, allPackIds: allActivePackIds, candidates })
      : null

    const templates = templateRounds.length
      ? evaluateRoundsFeasibility({ roundsInput: templateRounds, selectedPackIds, allPackIds: allActivePackIds, candidates })
      : null

    return NextResponse.json({
      ok: true,
      candidateCount: selectedCandidates.length,
      scopePackCount: scopeQuestionPackIds.length + specificHeadsUpPackIds.length,
      manual,
      templates,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to check round feasibility."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
