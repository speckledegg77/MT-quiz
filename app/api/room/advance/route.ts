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

  if (room.phase !== "running") return NextResponse.json({ ok: true, advanced: false })

  const nextAtMs = room.next_at ? Date.parse(room.next_at) : 0
  if (Date.now() < nextAtMs) return NextResponse.json({ ok: true, advanced: false })

  const ids = Array.isArray(room.question_ids) ? room.question_ids : []
  const nextIndex = room.question_index + 1

  if (nextIndex >= ids.length) {
    await supabaseAdmin.from("rooms").update({ phase: "finished" }).eq("id", room.id)
    return NextResponse.json({ ok: true, advanced: true, finished: true })
  }

  const now = new Date()
  const openAt = addSeconds(now, room.countdown_seconds)
  const closeAt = addSeconds(openAt, room.answer_seconds)
  const revealAt = addSeconds(closeAt, room.reveal_delay_seconds)
  const nextAt = addSeconds(revealAt, room.reveal_seconds)

  await supabaseAdmin
    .from("rooms")
    .update({
      question_index: nextIndex,
      countdown_start_at: now.toISOString(),
      open_at: openAt.toISOString(),
      close_at: closeAt.toISOString(),
      reveal_at: revealAt.toISOString(),
      next_at: nextAt.toISOString()
    })
    .eq("id", room.id)

  return NextResponse.json({ ok: true, advanced: true, finished: false })
}
