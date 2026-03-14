export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { findRoundForQuestionIndex, getEffectiveRoomRoundPlan, materialiseRoundPlan } from "@/lib/roomRoundPlan"
import { applyQuickfireFastestBonus } from "@/lib/quickfire"
import { buildPostCloseTimes } from "@/lib/roundFlow"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

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

  const roundPlan = materialiseRoundPlan(getEffectiveRoomRoundPlan(room))
  const currentRound = findRoundForQuestionIndex(Number(room.question_index ?? 0), roundPlan)
  const roomTimes = buildPostCloseTimes({
    closedAt: now,
    room,
    round: currentRound,
  })

  const { error } = await supabaseAdmin
    .from("rooms")
    .update({
      close_at: roomTimes.closeAt.toISOString(),
      reveal_at: roomTimes.revealAt.toISOString(),
      next_at: roomTimes.nextAt.toISOString(),
    })
    .eq("id", room.id)

  if (error) return NextResponse.json({ error: "Could not close answers" }, { status: 500 })

  const questionIds = Array.isArray(room.question_ids) ? room.question_ids : []
  const currentQuestionId = String(questionIds[Number(room.question_index ?? 0)] ?? "")

  if (currentQuestionId && currentRound.behaviourType === "quickfire") {
    await applyQuickfireFastestBonus({
      roomId: room.id,
      questionId: currentQuestionId,
      countsTowardsScore: currentRound.countsTowardsScore !== false,
    })
  }

  return NextResponse.json({ ok: true, forced: true })
}