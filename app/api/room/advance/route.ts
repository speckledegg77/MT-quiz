export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { createHeadsUpReadyState, deriveHeadsUpStage, getHeadsUpTurnSeconds, normaliseHeadsUpRoomState, serialiseHeadsUpState } from "@/lib/headsUpGameplay"
import { findRoundForQuestionIndex, getEffectiveRoomRoundPlan, materialiseRoundPlan } from "@/lib/roomRoundPlan"
import { buildQuestionTimesForRound, getEffectiveRoundReviewSecondsForRound } from "@/lib/roundFlow"
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

function buildRoundSummaryEndsAt(nextAt: string | null | undefined, roundReviewSeconds: number) {
  const nextMs = nextAt ? Date.parse(nextAt) : NaN
  if (!Number.isFinite(nextMs)) return null

  const reviewMs = Math.max(0, Math.floor(Number(roundReviewSeconds ?? 0)) || 0) * 1000
  if (reviewMs <= 0) return null

  return new Date(nextMs + reviewMs).toISOString()
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const code = String(body.code ?? "").trim().toUpperCase()

  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 })

  const roomRes = await supabaseAdmin.from("rooms").select("*").eq("code", code).single()
  if (roomRes.error) return NextResponse.json({ error: "Room not found" }, { status: 404 })

  const room = roomRes.data
  if (room.phase !== "running") return NextResponse.json({ ok: true, advanced: false })

  const roomRoundPlan = getEffectiveRoomRoundPlan(room)
  const ids = materialiseRoundPlan(roomRoundPlan).flatMap((round) => round.questionIds)
  const currentIndex = Math.max(0, Math.floor(Number(room.question_index ?? 0)) || 0)
  const roundPlan = materialiseRoundPlan(roomRoundPlan)
  const currentRound = findRoundForQuestionIndex(currentIndex, roundPlan)
  const isHeadsUp = String(currentRound?.behaviourType ?? "").trim().toLowerCase() === "heads_up"

  const nowMs = Date.now()
  const baseStage = stageFromTimes(room.phase, nowMs, room.open_at, room.close_at, room.reveal_at, room.next_at)
  let stage = baseStage

  if (isHeadsUp) {
    stage =
      deriveHeadsUpStage({
        roomPhase: room.phase,
        round: currentRound,
        rawState: room.heads_up_state,
        nowMs,
        closeAt: room.close_at,
      }) ?? baseStage
  } else {
    const roundReviewSeconds = getEffectiveRoundReviewSecondsForRound(room, currentRound)
    const roundSummaryEndsAt = buildRoundSummaryEndsAt(room.next_at, roundReviewSeconds)
    if (baseStage === "needs_advance" && currentIndex >= currentRound.endIndex) {
      stage = roundSummaryEndsAt && nowMs < Date.parse(roundSummaryEndsAt) ? "round_summary" : "needs_advance"
    }
  }

  if (stage !== "needs_advance" && stage !== "round_summary") {
    return NextResponse.json({ ok: true, advanced: false, stage })
  }

  const nextIndex = isHeadsUp && stage === "round_summary" ? currentRound.endIndex + 1 : currentIndex + 1

  if (nextIndex >= ids.length) {
    const finishRes = await supabaseAdmin
      .from("rooms")
      .update({ phase: "finished", heads_up_state: {} })
      .eq("id", room.id)
      .eq("phase", "running")
      .select("id")

    if (finishRes.error) {
      return NextResponse.json({ error: "Could not finish game" }, { status: 500 })
    }

    return NextResponse.json({ ok: true, advanced: Array.isArray(finishRes.data) && finishRes.data.length > 0, finished: true })
  }

  const nextRound = findRoundForQuestionIndex(nextIndex, roundPlan)
  const nextIsHeadsUp = String(nextRound?.behaviourType ?? "").trim().toLowerCase() === "heads_up"

  const updatePayload: Record<string, unknown> = {
    question_index: nextIndex,
  }

  if (nextIsHeadsUp) {
    const playersRes = await supabaseAdmin
      .from("players")
      .select("id, name, team_name, joined_at")
      .eq("room_id", room.id)
      .order("joined_at", { ascending: true })
    if (playersRes.error) return NextResponse.json({ error: playersRes.error.message }, { status: 500 })

    updatePayload.countdown_start_at = null
    updatePayload.open_at = null
    updatePayload.close_at = null
    updatePayload.reveal_at = null
    updatePayload.next_at = null
    updatePayload.heads_up_state = serialiseHeadsUpState(
      createHeadsUpReadyState({
        roundIndex: nextRound.index,
        players: playersRes.data ?? [],
        gameMode: room.game_mode,
        teamNames: room.team_names,
      })
    )
  } else {
    const roomTimes = buildQuestionTimesForRound({ now: new Date(), room, round: nextRound })
    updatePayload.countdown_start_at = roomTimes.openAt.toISOString()
    updatePayload.open_at = roomTimes.openAt.toISOString()
    updatePayload.close_at = roomTimes.closeAt.toISOString()
    updatePayload.reveal_at = roomTimes.revealAt.toISOString()
    updatePayload.next_at = roomTimes.nextAt.toISOString()
    updatePayload.heads_up_state = {}
  }

  const updateRes = await supabaseAdmin
    .from("rooms")
    .update(updatePayload)
    .eq("id", room.id)
    .eq("phase", "running")
    .eq("question_index", currentIndex)
    .select("id")

  if (updateRes.error) {
    return NextResponse.json({ error: "Could not advance room" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, advanced: Array.isArray(updateRes.data) && updateRes.data.length > 0, finished: false })
}
