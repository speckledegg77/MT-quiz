export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"
import { getQuestionById } from "../../../../lib/questionBank"

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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = String(searchParams.get("code") ?? "").trim().toUpperCase()
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 })

  const roomRes = await supabaseAdmin
    .from("rooms")
    .select("*")
    .eq("code", code)
    .single()

  if (roomRes.error) return NextResponse.json({ error: "Room not found" }, { status: 404 })
  const room = roomRes.data

  const playersRes = await supabaseAdmin
    .from("players")
    .select("id, name, score, joined_at")
    .eq("room_id", room.id)
    .order("joined_at", { ascending: true })

  const questionIds = Array.isArray(room.question_ids) ? room.question_ids : []
  const currentQuestionId = questionIds[room.question_index]

  const now = new Date()
  const stage = stageFromTimes(room.phase, now.getTime(), room.open_at, room.close_at, room.reveal_at, room.next_at)

  const canShowQuestion = room.phase === "running" || room.phase === "finished"

  let questionPublic: any = null
  let revealData: any = null
  let winner: any = null

  if (canShowQuestion && currentQuestionId) {
    const q = getQuestionById(String(currentQuestionId))

    if (q) {
      const audioUrl = q.audioPath ? `/api/audio?path=${encodeURIComponent(q.audioPath)}` : null

      questionPublic = {
        id: q.id,
        roundType: q.roundType,
        text: q.text,
        options: q.options,
        audioUrl
      }

      if (stage === "reveal" || room.phase === "finished") {
        revealData = { answerIndex: q.answerIndex, explanation: q.explanation }
      }

      const resultRes = await supabaseAdmin
        .from("round_results")
        .select("winner_player_id, winner_received_at")
        .eq("room_id", room.id)
        .eq("question_id", q.id)
        .maybeSingle()

      if (!resultRes.error && resultRes.data?.winner_player_id) winner = resultRes.data
    }
  }

  return NextResponse.json({
    serverNow: now.toISOString(),
    code: room.code,
    roomId: room.id,
    phase: room.phase,
    stage,
    questionIndex: room.question_index,
    questionCount: questionIds.length,
    times: {
      openAt: room.open_at,
      closeAt: room.close_at,
      revealAt: room.reveal_at,
      nextAt: room.next_at
    },
    question: questionPublic,
    reveal: revealData,
    winner,
    players: playersRes.data ?? []
  })
}
