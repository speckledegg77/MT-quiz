export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { createHeadsUpReadyState, serialiseHeadsUpState } from "@/lib/headsUpGameplay"
import { findRoundForQuestionIndex, getEffectiveRoomRoundPlan, materialiseRoundPlan } from "@/lib/roomRoundPlan"
import { buildQuestionTimesForRound } from "@/lib/roundFlow"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const code = String(body.code ?? "").trim().toUpperCase()

  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 })

  const roomRes = await supabaseAdmin.from("rooms").select("*").eq("code", code).single()
  if (roomRes.error) return NextResponse.json({ error: "Room not found" }, { status: 404 })

  const room = roomRes.data
  const gameMode = String(room.game_mode ?? "teams") === "solo" ? "solo" : "teams"

  const playersRes = await supabaseAdmin
    .from("players")
    .select("id, name, team_name, joined_at")
    .eq("room_id", room.id)
    .order("joined_at", { ascending: true })

  if (playersRes.error) return NextResponse.json({ error: playersRes.error.message }, { status: 500 })
  const players = playersRes.data ?? []

  if (players.length === 0) {
    return NextResponse.json({ error: "At least one player must join before you can start the game." }, { status: 409 })
  }

  let teamScoreMode: "total" | "average" = "total"
  if (gameMode === "teams") {
    const counts = new Map<string, number>()
    for (const player of players as any[]) {
      const team = String(player?.team_name ?? "").trim() || "No team"
      counts.set(team, (counts.get(team) ?? 0) + 1)
    }
    const sizes = Array.from(counts.values())
    if (sizes.length >= 2) {
      const min = Math.min(...sizes)
      const max = Math.max(...sizes)
      if (max !== min) teamScoreMode = "average"
    }
  }

  const roundPlan = materialiseRoundPlan(getEffectiveRoomRoundPlan(room))
  const firstRound = findRoundForQuestionIndex(0, roundPlan)
  const isHeadsUp = String(firstRound?.behaviourType ?? "").trim().toLowerCase() === "heads_up"

  const updatePayload: Record<string, unknown> = {
    phase: "running",
    question_index: 0,
    team_score_mode: teamScoreMode,
  }

  if (isHeadsUp) {
    updatePayload.countdown_start_at = null
    updatePayload.open_at = null
    updatePayload.close_at = null
    updatePayload.reveal_at = null
    updatePayload.next_at = null
    updatePayload.heads_up_state = serialiseHeadsUpState(
      createHeadsUpReadyState({
        roundIndex: firstRound.index,
        players,
        gameMode: room.game_mode,
        teamNames: room.team_names,
      })
    )
  } else {
    const roomTimes = buildQuestionTimesForRound({
      now: new Date(),
      room,
      round: firstRound,
    })
    updatePayload.countdown_start_at = roomTimes.openAt.toISOString()
    updatePayload.open_at = roomTimes.openAt.toISOString()
    updatePayload.close_at = roomTimes.closeAt.toISOString()
    updatePayload.reveal_at = roomTimes.revealAt.toISOString()
    updatePayload.next_at = roomTimes.nextAt.toISOString()
    updatePayload.heads_up_state = {}
  }

  const { error } = await supabaseAdmin.from("rooms").update(updatePayload).eq("id", room.id)

  if (error) return NextResponse.json({ error: "Could not start" }, { status: 500 })

  return NextResponse.json({ ok: true })
}
