export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000)
}

function stageFromTimes(
  phase: string,
  nowMs: number,
  openAt?: string | null,
  closeAt?: string | null,
  revealAt?: string | null,
  nextAt?: string | null
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

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const code = String(body.code ?? "").trim().toUpperCase()

  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 })

  const roomRes = await supabaseAdmin.from("rooms").select("*").eq("code", code).single()
  if (roomRes.error) return NextResponse.json({ error: "Room not found" }, { status: 404 })

  const room = roomRes.data
  if (room.phase !== "running") return NextResponse.json({ ok: true, forced: false, reason: "not_running" })

  const now = new Date()
  const stage = stageFromTimes(
    room.phase,
    now.getTime(),
    room.open_at,
    room.close_at,
    room.reveal_at,
    room.next_at
  )

  if (stage !== "open") {
    return NextResponse.json({ ok: true, forced: false, reason: "not_open", stage })
  }

  const revealAt = addSeconds(now, Number(room.reveal_delay_seconds ?? 0))
  const nextAt = addSeconds(revealAt, Number(room.reveal_seconds ?? 0))

  const { error } = await supabaseAdmin
    .from("rooms")
    .update({
      close_at: now.toISOString(),
      reveal_at: revealAt.toISOString(),
      next_at: nextAt.toISOString(),
    })
    .eq("id", room.id)

  if (error) return NextResponse.json({ error: "Could not close answers" }, { status: 500 })

  return NextResponse.json({ ok: true, forced: true })
}