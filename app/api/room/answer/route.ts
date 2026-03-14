export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"
import { getQuestionById } from "../../../../lib/questionBank"
import { shuffleMcqForRoom } from "../../../../lib/mcqShuffle"
import { findRoundForQuestionIndex, getEffectiveRoomRoundPlan, materialiseRoundPlan } from "../../../../lib/roomRoundPlan"
import { applyQuickfireFastestBonus } from "../../../../lib/quickfire"
import { buildPostCloseTimes, getScoreDeltaForRound, isJokerActiveForRound, isQuickfireRound } from "../../../../lib/roundFlow"

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

function normalise(s: string) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenise(s: string) {
  const n = normalise(s)
  return n ? n.split(" ").filter(Boolean) : []
}

function initialsForAnswer(answerTokens: string[]) {
  const stop = new Set(["the", "a", "an", "and", "of", "to", "in", "for", "on", "at", "with", "from", "by"])
  const kept = answerTokens.filter((t) => t && !stop.has(t))
  return kept.map((t) => t[0]).join("")
}

function levenshtein(a: string, b: string) {
  const s = a
  const t = b
  const n = s.length
  const m = t.length
  if (n === 0) return m
  if (m === 0) return n

  const dp: number[] = new Array((n + 1) * (m + 1))
  for (let i = 0; i <= n; i++) dp[i * (m + 1) + 0] = i
  for (let j = 0; j <= m; j++) dp[0 * (m + 1) + j] = j

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1
      const del = dp[(i - 1) * (m + 1) + j] + 1
      const ins = dp[i * (m + 1) + (j - 1)] + 1
      const sub = dp[(i - 1) * (m + 1) + (j - 1)] + cost
      dp[i * (m + 1) + j] = Math.min(del, ins, sub)
    }
  }

  return dp[n * (m + 1) + m]
}

function tokenPrefixMatch(inputTokens: string[], answerTokens: string[]) {
  if (inputTokens.length < 2) return false
  if (answerTokens.length < 2) return false

  let ai = 0
  for (const it of inputTokens) {
    if (it.length < 2) continue
    let found = false
    while (ai < answerTokens.length) {
      const at = answerTokens[ai]
      ai++
      if (at.startsWith(it)) {
        found = true
        break
      }
    }
    if (!found) return false
  }

  const ratio = inputTokens.length / answerTokens.length
  return ratio >= 0.6 || inputTokens.length >= 3
}

function isTextCorrect(input: string, answer: string, accepted?: string[]) {
  const inputNorm = normalise(input)
  if (!inputNorm) return false

  const candidates = [answer, ...(accepted ?? [])].map((x) => String(x ?? "")).filter(Boolean)
  if (candidates.length === 0) return false

  const candNorms = candidates.map(normalise).filter(Boolean)
  if (candNorms.includes(inputNorm)) return true

  const inputCompact = inputNorm.replace(/\s+/g, "")
  if (/^[a-z0-9]{2,6}$/.test(inputCompact)) {
    const ansTokens = tokenise(answer)
    const init = initialsForAnswer(ansTokens)
    if (init && inputCompact === init) return true
  }

  const inTokens = tokenise(inputNorm)
  for (const c of candidates) {
    const aTokens = tokenise(c)
    if (tokenPrefixMatch(inTokens, aTokens)) return true
  }

  for (const c of candNorms) {
    const maxLen = Math.max(inputNorm.length, c.length)
    if (maxLen <= 4) continue

    const dist = levenshtein(inputNorm, c)

    let maxEdits = 1
    if (maxLen >= 8) maxEdits = 2
    if (maxLen >= 13) maxEdits = 3
    if (maxLen >= 19) maxEdits = 4

    const similarity = 1 - dist / maxLen
    if (dist <= maxEdits && similarity >= 0.82) return true
  }

  return false
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