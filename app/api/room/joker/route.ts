export const runtime = "nodejs"

import { NextResponse } from "next/server"

import {
  getEffectiveRoomRoundPlan,
  isInfiniteRoundPlan,
  isJokerEnabledForRoundPlan,
  materialiseRoundPlan,
} from "../../../../lib/roomRoundPlan"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  const code = String(body.code ?? "").trim().toUpperCase()
  const playerId = String(body.playerId ?? "").trim()
  const jokerRoundIndex = Number(body.jokerRoundIndex)

  if (!code || !playerId || !Number.isFinite(jokerRoundIndex)) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  const roomRes = await supabaseAdmin
    .from("rooms")
    .select("id, code, phase, round_plan, round_count, round_names, question_ids, question_index")
    .eq("code", code)
    .single()

  if (roomRes.error) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 })
  }

  const room = roomRes.data

  if (room.phase !== "lobby") {
    return NextResponse.json(
      { error: "Joker selection is only available before the game starts." },
      { status: 400 }
    )
  }

  const effectivePlan = getEffectiveRoomRoundPlan(room)
  const roundPlan = materialiseRoundPlan(effectivePlan)

  if (isInfiniteRoundPlan(effectivePlan)) {
    return NextResponse.json(
      { error: "Joker is not available in Infinite mode." },
      { status: 400 }
    )
  }

  if (!isJokerEnabledForRoundPlan(roundPlan)) {
    return NextResponse.json(
      { error: "Joker is not available for this game." },
      { status: 400 }
    )
  }

  const chosenRound = roundPlan.find((round) => round.index === jokerRoundIndex) ?? null

  if (!chosenRound) {
    return NextResponse.json({ error: "Invalid joker round." }, { status: 400 })
  }

  if (!chosenRound.jokerEligible) {
    return NextResponse.json(
      { error: "That round is not Joker eligible." },
      { status: 400 }
    )
  }

  const playerRes = await supabaseAdmin
    .from("players")
    .select("id, room_id")
    .eq("id", playerId)
    .single()

  if (playerRes.error) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 })
  }

  if (playerRes.data.room_id !== room.id) {
    return NextResponse.json({ error: "Player not in this room" }, { status: 400 })
  }

  const updateRes = await supabaseAdmin
    .from("players")
    .update({ joker_round_index: jokerRoundIndex })
    .eq("id", playerId)

  if (updateRes.error) {
    return NextResponse.json({ error: "Could not save joker selection" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    jokerRoundIndex,
    jokerEligible: true,
  })
}