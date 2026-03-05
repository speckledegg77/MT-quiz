export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000)
}

const UNTIMED_SECONDS = 60 * 60 * 24 * 365 // 1 year

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const code = String(body.code ?? "").trim().toUpperCase()

  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 })

  const roomRes = await supabaseAdmin.from("rooms").select("*").eq("code", code).single()
  if (roomRes.error) return NextResponse.json({ error: "Room not found" }, { status: 404 })

  const room = roomRes.data

  const gameMode = String(room.game_mode ?? "teams") === "solo" ? "solo" : "teams"

  let teamScoreMode: "total" | "average" = "total"

  if (gameMode === "teams") {
    const playersRes = await supabaseAdmin
      .from("players")
      .select("team_name")
      .eq("room_id", room.id)

    if (!playersRes.error) {
      const counts = new Map<string, number>()

      for (const p of (playersRes.data ?? []) as any[]) {
        const team = String(p?.team_name ?? "").trim() || "No team"
        counts.set(team, (counts.get(team) ?? 0) + 1)
      }

      const sizes = Array.from(counts.values())
      if (sizes.length >= 2) {
        const min = Math.min(...sizes)
        const max = Math.max(...sizes)
        if (max !== min) teamScoreMode = "average"
      }
    }
  }

  const now = new Date()
  const openAt = addSeconds(now, Number(room.countdown_seconds ?? 0))

  const rawAnswerSeconds = Number(room.answer_seconds ?? 0)
  const effectiveAnswerSeconds =
    Number.isFinite(rawAnswerSeconds) && rawAnswerSeconds > 0 ? rawAnswerSeconds : UNTIMED_SECONDS

  const closeAt = addSeconds(openAt, effectiveAnswerSeconds)
  const revealAt = addSeconds(closeAt, Number(room.reveal_delay_seconds ?? 0))
  const nextAt = addSeconds(revealAt, Number(room.reveal_seconds ?? 0))

  const { error } = await supabaseAdmin
    .from("rooms")
    .update({
      phase: "running",
      question_index: 0,
      countdown_start_at: now.toISOString(),
      open_at: openAt.toISOString(),
      close_at: closeAt.toISOString(),
      reveal_at: revealAt.toISOString(),
      next_at: nextAt.toISOString(),
      team_score_mode: teamScoreMode,
    })
    .eq("id", room.id)

  if (error) return NextResponse.json({ error: "Could not start" }, { status: 500 })

  return NextResponse.json({ ok: true })
}