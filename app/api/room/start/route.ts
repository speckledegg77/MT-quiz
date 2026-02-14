export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000)
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const code = String(body.code ?? "").trim().toUpperCase()
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 })

  const roomRes = await supabaseAdmin
    .from("rooms")
    .select("*")
    .eq("code", code)
    .single()

  if (roomRes.error) return NextResponse.json({ error: "Room not found" }, { status: 404 })
  const room = roomRes.data

  const now = new Date()
  const openAt = addSeconds(now, room.countdown_seconds)
  const closeAt = addSeconds(openAt, room.answer_seconds)
  const revealAt = addSeconds(closeAt, room.reveal_delay_seconds)
  const nextAt = addSeconds(revealAt, room.reveal_seconds)

  const { error } = await supabaseAdmin
    .from("rooms")
    .update({
      phase: "running",
      question_index: 0,
      countdown_start_at: now.toISOString(),
      open_at: openAt.toISOString(),
      close_at: closeAt.toISOString(),
      reveal_at: revealAt.toISOString(),
      next_at: nextAt.toISOString()
    })
    .eq("id", room.id)

  if (error) return NextResponse.json({ error: "Could not start" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
