export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { getEffectiveRoomRoundPlan, isInfiniteRoundPlan } from "@/lib/roomRoundPlan"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const code = String(body.code ?? "").trim().toUpperCase()

  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 })

  const roomRes = await supabaseAdmin
    .from("rooms")
    .select("id, phase, round_plan, round_count, round_names, question_ids")
    .eq("code", code)
    .single()

  if (roomRes.error) return NextResponse.json({ error: "Room not found" }, { status: 404 })

  const room = roomRes.data
  const effectivePlan = getEffectiveRoomRoundPlan(room)

  if (!isInfiniteRoundPlan(effectivePlan)) {
    return NextResponse.json({ error: "End game is only available in Infinite mode." }, { status: 400 })
  }

  if (room.phase !== "running") {
    return NextResponse.json({ ok: true, ended: false, reason: "not_running" })
  }

  const endRes = await supabaseAdmin
    .from("rooms")
    .update({ phase: "finished" })
    .eq("id", room.id)
    .eq("phase", "running")
    .select("id")

  if (endRes.error) {
    return NextResponse.json({ error: "Could not end game" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    ended: Array.isArray(endRes.data) && endRes.data.length > 0,
  })
}
