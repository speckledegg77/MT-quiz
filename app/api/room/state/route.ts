export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"
import { getQuestionById } from "../../../../lib/questionBank"
import { shuffleMcqForRoom } from "../../../../lib/mcqShuffle"

type RoundPlanItem = {
  index: number
  number: number
  name: string
  startIndex: number
  endIndex: number
  size: number
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function normaliseRoundCount(raw: any, questionCount: number) {
  const qc = Math.max(1, Math.floor(Number(questionCount ?? 0)) || 1)
  const requested = Math.floor(Number(raw ?? 4))
  const safe = Number.isFinite(requested) ? requested : 4
  const capped = clampInt(safe, 1, 20)
  return Math.min(capped, qc)
}

function normaliseRoundNames(raw: any, count: number) {
  const arr = Array.isArray(raw) ? raw : []
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const name = String(arr[i] ?? "").trim()
    out.push(name || `Round ${i + 1}`)
  }
  return out
}

function buildRoundPlan(questionCount: number, roundCount: number, roundNames: string[]): RoundPlanItem[] {
  const qc = Math.max(1, Math.floor(Number(questionCount ?? 0)) || 1)
  const rc = normaliseRoundCount(roundCount, qc)
  const names = normaliseRoundNames(roundNames, rc)

  const base = Math.floor(qc / rc)
  const rem = qc % rc

  const plan: RoundPlanItem[] = []
  let start = 0

  for (let i = 0; i < rc; i++) {
    const size = base + (i < rem ? 1 : 0)
    const end = start + size - 1
    plan.push({
      index: i,
      number: i + 1,
      name: names[i] ?? `Round ${i + 1}`,
      startIndex: start,
      endIndex: end,
      size,
    })
    start = end + 1
  }

  return plan
}

function findRoundForQuestion(questionIndex: number, plan: RoundPlanItem[]) {
  const qi = Math.max(0, Math.floor(Number(questionIndex ?? 0)) || 0)
  for (const r of plan) {
    if (qi >= r.startIndex && qi <= r.endIndex) return r
  }
  return plan[0]
}

function stageFromTimes(
  phase: string,
  nowMs: number,
  openAt?: string,
  closeAt?: string,
  revealAt?: string,
  nextAt?: string
) {
  if (phase !== "running") return phase
  const open = openAt ? Date.parse(openAt) : 0
  const close = closeAt ? Date.parse(closeAt) : 0
  const reveal = revealAt ? Date.parse(revealAt) : 0
  const next = nextAt ? Date.parse(nextAt) : 0
  if (nowMs < open) return "countdown"
  if (nowMs < close) return "open"
  if (nowMs < reveal) return "wait"
  if (nowMs < next) return "reveal"
  return "needs_advance"
}

async function finaliseJokerNoAnswerPenalty(roomId: string, questionId: string, jokerRoundIndex: number) {
  if (!roomId || !questionId) return

  const ins = await supabaseAdmin
    .from("question_finalisations")
    .insert({ room_id: roomId, question_id: questionId })

  if (ins.error) {
    const code = String((ins.error as any).code ?? "")
    const msg = String((ins.error as any).message ?? "")
    if (code === "23505") return
    if (msg.toLowerCase().includes("does not exist")) return
    return
  }

  const jokerPlayersRes = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("room_id", roomId)
    .eq("joker_round_index", jokerRoundIndex)

  if (jokerPlayersRes.error) return

  const jokerIds = (jokerPlayersRes.data ?? []).map((p: any) => p.id).filter(Boolean)
  if (jokerIds.length === 0) return

  const answeredRes = await supabaseAdmin
    .from("answers")
    .select("player_id")
    .eq("room_id", roomId)
    .eq("question_id", questionId)
    .in("player_id", jokerIds)

  const answered = new Set<string>((answeredRes.data ?? []).map((r: any) => String(r.player_id ?? "")))

  const missing = jokerIds.filter((id: string) => id && !answered.has(String(id)))
  for (const pid of missing) {
    await supabaseAdmin.rpc("increment_player_score_by", { p_player_id: pid, p_delta: -1 })
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = String(searchParams.get("code") ?? "").trim().toUpperCase()
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 })

  const roomRes = await supabaseAdmin.from("rooms").select("*").eq("code", code).single()
  if (roomRes.error) return NextResponse.json({ error: "Room not found" }, { status: 404 })
  const room = roomRes.data

  const playersRes = await supabaseAdmin
    .from("players")
    .select("id, name, score, team_name, joker_round_index, joined_at")
    .eq("room_id", room.id)
    .order("joined_at", { ascending: true })

  const questionIds = Array.isArray(room.question_ids) ? room.question_ids : []
  const questionCount = questionIds.length
  const currentQuestionId = questionIds[room.question_index]

  const roundCount = normaliseRoundCount(room.round_count, questionCount)
  const roundNames = normaliseRoundNames(room.round_names, roundCount)
  const roundPlan = buildRoundPlan(questionCount || 1, roundCount, roundNames)

  const currentRound = findRoundForQuestion(Number(room.question_index ?? 0), roundPlan)
  const questionNumberInRound = Math.max(1, Number(room.question_index ?? 0) - currentRound.startIndex + 1)

  const now = new Date()
  const stage = stageFromTimes(room.phase, now.getTime(), room.open_at, room.close_at, room.reveal_at, room.next_at)

  if (
    room.phase === "running" &&
    currentQuestionId &&
    (stage === "wait" || stage === "reveal" || stage === "needs_advance")
  ) {
    await finaliseJokerNoAnswerPenalty(room.id, String(currentQuestionId), currentRound.index)
  }

  const canShowQuestion = room.phase === "running" || room.phase === "finished"
  const audioMode = String(room.audio_mode ?? "display")
  const selectedPacks = Array.isArray(room.selected_packs) ? room.selected_packs : []

  let questionPublic: any = null
  let revealData: any = null

  if (canShowQuestion && currentQuestionId) {
    const q = await getQuestionById(String(currentQuestionId))
    if (q) {
      let options = q.options
      let revealAnswerIndex = q.answerIndex

      if (q.answerType === "mcq" && q.answerIndex !== null && Array.isArray(q.options) && q.options.length > 1) {
        const shuffled = shuffleMcqForRoom(q.options, q.answerIndex, room.id, q.id)
        options = shuffled.options
        revealAnswerIndex = shuffled.answerIndex
      }

      const audioUrl = q.audioPath ? `/api/audio?path=${encodeURIComponent(q.audioPath)}` : null
      const imageUrl = q.imagePath ? `/api/image?path=${encodeURIComponent(q.imagePath)}` : null

      questionPublic = {
        id: q.id,
        roundType: q.roundType,
        answerType: q.answerType,
        text: q.text,
        options,
        audioUrl,
        imageUrl,
      }

      if (stage === "reveal" || room.phase === "finished") {
        revealData = {
          answerType: q.answerType,
          answerIndex: q.answerType === "mcq" ? revealAnswerIndex : null,
          answerText: q.answerType === "text" ? (q.answerText ?? "") : null,
          explanation: q.explanation,
        }
      }
    }
  }

  return NextResponse.json({
    serverNow: now.toISOString(),
    code: room.code,
    roomId: room.id,
    phase: room.phase,
    gameMode: String(room.game_mode ?? "teams") === "solo" ? "solo" : "teams",
    teamNames: Array.isArray(room.team_names) ? room.team_names : [],
    teamScoreMode: String(room.team_score_mode ?? "total") === "average" ? "average" : "total",
    stage,
    audioMode,
    selectedPacks,
    questionIndex: room.question_index,
    questionCount,
    rounds: {
      count: roundCount,
      names: roundNames,
      plan: roundPlan,
      current: {
        index: currentRound.index,
        number: currentRound.number,
        name: currentRound.name,
        startIndex: currentRound.startIndex,
        endIndex: currentRound.endIndex,
        questionsInRound: currentRound.size,
        questionNumberInRound,
      },
    },
    times: {
      openAt: room.open_at,
      closeAt: room.close_at,
      revealAt: room.reveal_at,
      nextAt: room.next_at,
    },
    question: questionPublic,
    reveal: revealData,
    players: playersRes.data ?? [],
  })
}