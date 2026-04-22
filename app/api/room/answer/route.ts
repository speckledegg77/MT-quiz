export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"
import { getQuestionById } from "../../../../lib/questionBank"
import { shuffleMcqForRoom } from "../../../../lib/mcqShuffle"
import { findRoundForQuestionIndex, getEffectiveRoomRoundPlan, materialiseRoundPlan } from "../../../../lib/roomRoundPlan"
import { applyQuickfireFastestBonus } from "../../../../lib/quickfire"
import { buildPostCloseTimes, getScoreDeltaForRound, isHeadsUpRound, isJokerActiveForRound, isQuickfireRound } from "../../../../lib/roundFlow"
import { isTextCorrect } from "../../../../lib/textAnswers"

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000)
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

function roundIndexForQuestion(questionIndex: number, questionCount: number, roundCountRaw: any) {
  const qc = Math.max(1, Math.floor(Number(questionCount ?? 0)) || 1)
  const rc = normaliseRoundCount(roundCountRaw, qc)
  const qi = Math.max(0, Math.floor(Number(questionIndex ?? 0)) || 0)

  const base = Math.floor(qc / rc)
  const rem = qc % rc

  let start = 0
  for (let i = 0; i < rc; i++) {
    const size = base + (i < rem ? 1 : 0)
    const end = start + size - 1
    if (qi >= start && qi <= end) return i
    start = end + 1
  }

  return rc - 1
}

async function buildQuestionStats(roomId: string, questionId: string, players: any[]) {
  const answersRes = await supabaseAdmin
    .from("answers")
    .select("player_id, is_correct, joker_active")
    .eq("room_id", roomId)
    .eq("question_id", questionId)

  const answers = answersRes.data ?? []

  const byTeam = new Map<string, { answered: number; correct: number }>()
  let answered = 0
  let correct = 0

  for (const answer of answers) {
    answered += 1
    const player = players.find((row: any) => row.id === answer.player_id)
    const team = String(player?.team_name ?? "").trim() || "No team"
    const entry = byTeam.get(team) ?? { answered: 0, correct: 0 }
    entry.answered += 1
    if (answer.is_correct) {
      correct += 1
      entry.correct += 1
    }
    byTeam.set(team, entry)
  }

  return {
    answered,
    correct,
    byTeam: Array.from(byTeam.entries()).map(([team, row]) => ({
      team,
      answered: row.answered,
      correct: row.correct,
    })),
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  const code = String(body.code ?? "").trim().toUpperCase()
  const playerId = String(body.playerId ?? "").trim()
  const questionId = String(body.questionId ?? "").trim()

  const optionIndexRaw = body.optionIndex
  const optionIndex = Number(optionIndexRaw)
  const answerText = String(body.answerText ?? "").trim()

  if (!code || !playerId || !questionId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  const roomRes = await supabaseAdmin.from("rooms").select("*").eq("code", code).single()
  if (roomRes.error) return NextResponse.json({ error: "Room not found" }, { status: 404 })
  const room = roomRes.data

  if (room.phase !== "running") return NextResponse.json({ accepted: false, reason: "not_running" })

  const ids = Array.isArray(room.question_ids) ? room.question_ids : []
  const currentQuestionId = String(ids[room.question_index] ?? "")
  if (!currentQuestionId || currentQuestionId !== questionId) {
    return NextResponse.json({ accepted: false, reason: "not_current_question" })
  }

  const nowMs = Date.now()
  const openMs = room.open_at ? Date.parse(room.open_at) : 0
  const closeMs = room.close_at ? Date.parse(room.close_at) : 0
  if (!(nowMs >= openMs && nowMs < closeMs)) {
    return NextResponse.json({ accepted: false, reason: "not_open" })
  }

  const playerRes = await supabaseAdmin
    .from("players")
    .select("id, room_id, joker_round_index")
    .eq("id", playerId)
    .single()

  if (playerRes.error || playerRes.data.room_id !== room.id) {
    return NextResponse.json({ accepted: false, reason: "bad_player" })
  }

  const playersRes = await supabaseAdmin
    .from("players")
    .select("id, name, score, team_name")
    .eq("room_id", room.id)

  const players = playersRes.data ?? []

  const q = await getQuestionById(questionId)
  if (!q) return NextResponse.json({ accepted: false, reason: "bad_question" })

  let isCorrect = false

  if (q.answerType === "mcq") {
    if (!Number.isFinite(optionIndex)) return NextResponse.json({ error: "Missing optionIndex" }, { status: 400 })
    if (q.answerIndex === null) return NextResponse.json({ accepted: false, reason: "bad_question" })

    const shuffled = shuffleMcqForRoom(q.options, q.answerIndex, room.id, q.id)
    isCorrect = optionIndex === shuffled.answerIndex
  } else {
    if (!answerText) return NextResponse.json({ error: "Missing answerText" }, { status: 400 })
    isCorrect = isTextCorrect(answerText, q.answerText ?? "", q.acceptedAnswers)
  }

  const effectiveRoundPlan = materialiseRoundPlan(getEffectiveRoomRoundPlan(room))
  const currentRound = findRoundForQuestionIndex(Number(room.question_index ?? 0), effectiveRoundPlan)
  if (isHeadsUpRound(currentRound) || q.answerType === "none") {
    return NextResponse.json({ accepted: false, reason: "spotlight_round" })
  }
  const roundIdx = currentRound.index
  const jokerActive = isJokerActiveForRound({
    playerJokerRoundIndex: playerRes.data.joker_round_index,
    round: currentRound,
  })
  const scoreDelta = getScoreDeltaForRound({
    isCorrect,
    jokerActive,
    countsTowardsScore: currentRound.countsTowardsScore !== false,
  })

  const ansRes = await supabaseAdmin.from("answers").insert({
    room_id: room.id,
    player_id: playerId,
    question_id: questionId,
    option_index: q.answerType === "mcq" ? optionIndex : null,
    answer_text: q.answerType === "text" ? answerText : null,
    is_correct: isCorrect,

    joker_active: jokerActive,
    score_delta: scoreDelta,
    round_index: roundIdx,
  })

  if (ansRes.error) {
    const pgCode = String((ansRes.error as any).code ?? "")
    if (pgCode === "23505") {
      return NextResponse.json({ accepted: false, reason: "already_answered" })
    }
    return NextResponse.json({ error: ansRes.error.message }, { status: 500 })
  }

  if (scoreDelta !== 0) {
    await supabaseAdmin.rpc("increment_player_score_by", { p_player_id: playerId, p_delta: scoreDelta })
  }

  const playersCountRes = await supabaseAdmin
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room.id)

  const answersCountRes = await supabaseAdmin
    .from("answers")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room.id)
    .eq("question_id", questionId)

  const playerCount = playersCountRes.count ?? 0
  const answerCount = answersCountRes.count ?? 0

  if (playerCount > 0 && answerCount >= playerCount) {
    const now = new Date()
    const roomTimes = buildPostCloseTimes({
      closedAt: now,
      room,
      round: currentRound,
    })

    await supabaseAdmin
      .from("rooms")
      .update({
        close_at: roomTimes.closeAt.toISOString(),
        reveal_at: roomTimes.revealAt.toISOString(),
        next_at: roomTimes.nextAt.toISOString(),
      })
      .eq("id", room.id)

    if (isQuickfireRound(currentRound)) {
      await applyQuickfireFastestBonus({
        roomId: room.id,
        questionId,
        countsTowardsScore: currentRound.countsTowardsScore !== false,
      })
    }

    let revealAnswerIndex: number | null = q.answerIndex ?? null
    if (q.answerType === "mcq" && q.answerIndex !== null && Array.isArray(q.options) && q.options.length > 1) {
      const shuffled = shuffleMcqForRoom(q.options, q.answerIndex, room.id, q.id)
      revealAnswerIndex = shuffled.answerIndex
    }

    const questionStats = await buildQuestionStats(room.id, questionId, players)
    const nextStage = isQuickfireRound(currentRound) ? "needs_advance" : "reveal"

    return NextResponse.json({
      accepted: true,
      isCorrect,
      jokerActive,
      scoreDelta,
      questionClosed: true,
      nextStage,
      serverNow: now.toISOString(),
      roomTimes: {
        closeAt: roomTimes.closeAt.toISOString(),
        revealAt: roomTimes.revealAt.toISOString(),
        nextAt: roomTimes.nextAt.toISOString(),
      },
      reveal: isQuickfireRound(currentRound)
        ? null
        : {
            answerType: q.answerType,
            answerIndex: q.answerType === "mcq" ? revealAnswerIndex : null,
            answerText: q.answerType === "text" ? q.answerText ?? "" : null,
            explanation: q.explanation ?? null,
          },
      questionStats,
    })
  }

  return NextResponse.json({ accepted: true, isCorrect, jokerActive, scoreDelta, questionClosed: false })
}