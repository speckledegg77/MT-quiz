export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"
import { getQuestionById } from "../../../../lib/questionBank"

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000)
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const code = String(body.code ?? "").trim().toUpperCase()
  const playerId = String(body.playerId ?? "").trim()
  const questionId = String(body.questionId ?? "").trim()
  const optionIndex = Number(body.optionIndex)

  if (!code || !playerId || !questionId || !Number.isFinite(optionIndex)) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  const roomRes = await supabaseAdmin
    .from("rooms")
    .select("*")
    .eq("code", code)
    .single()

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
    .select("id, room_id")
    .eq("id", playerId)
    .single()

  if (playerRes.error || playerRes.data.room_id !== room.id) {
    return NextResponse.json({ accepted: false, reason: "bad_player" })
  }

  const q = getQuestionById(questionId)
  if (!q) return NextResponse.json({ accepted: false, reason: "bad_question" })

  const isCorrect = optionIndex === q.answerIndex

  const ansRes = await supabaseAdmin.from("answers").insert({
    room_id: room.id,
    player_id: playerId,
    question_id: questionId,
    option_index: optionIndex,
    is_correct: isCorrect
  })

  if (ansRes.error) {
    return NextResponse.json({ accepted: false, reason: "already_answered" })
  }

  let wasFastestCorrect = false

  if (isCorrect) {
    const winRes = await supabaseAdmin.from("round_results").insert({
      room_id: room.id,
      question_id: questionId,
      winner_player_id: playerId,
      winner_received_at: new Date().toISOString()
    })

    if (!winRes.error) {
      wasFastestCorrect = true
      await supabaseAdmin.rpc("increment_player_score", { p_player_id: playerId })
    }
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
        next_at: nextAt.toISOString()
      })
      .eq("id", room.id)
  }

  return NextResponse.json({ accepted: true, isCorrect, wasFastestCorrect })
}
