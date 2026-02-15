export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"
import { getQuestionById } from "../../../../lib/questionBank"
import { shuffleMcqForRoom } from "../../../../lib/mcqShuffle"

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000)
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
  const kept = answerTokens.filter(t => t && !stop.has(t))
  return kept.map(t => t[0]).join("")
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

  const candidates = [answer, ...(accepted ?? [])].map(x => String(x ?? "")).filter(Boolean)
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

  const playerRes = await supabaseAdmin.from("players").select("id, room_id").eq("id", playerId).single()
  if (playerRes.error || playerRes.data.room_id !== room.id) {
    return NextResponse.json({ accepted: false, reason: "bad_player" })
  }

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

  const ansRes = await supabaseAdmin.from("answers").insert({
    room_id: room.id,
    player_id: playerId,
    question_id: questionId,
    option_index: q.answerType === "mcq" ? optionIndex : null,
    answer_text: q.answerType === "text" ? answerText : null,
    is_correct: isCorrect,
  })

  if (ansRes.error) {
    return NextResponse.json({ accepted: false, reason: "already_answered" })
  }

  if (isCorrect) {
    await supabaseAdmin.rpc("increment_player_score", { p_player_id: playerId })
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
    const revealAt = addSeconds(now, room.reveal_delay_seconds)
    const nextAt = addSeconds(revealAt, room.reveal_seconds)

    await supabaseAdmin
      .from("rooms")
      .update({
        close_at: now.toISOString(),
        reveal_at: revealAt.toISOString(),
        next_at: nextAt.toISOString(),
      })
      .eq("id", room.id)
  }

  return NextResponse.json({ accepted: true, isCorrect })
}
