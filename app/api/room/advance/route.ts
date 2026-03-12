export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { findRoundForQuestionIndex, getEffectiveRoomRoundPlan, materialiseRoundPlan } from "@/lib/roomRoundPlan"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

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

const UNTIMED_SECONDS = 60 * 60 * 24 * 365 // 1 year
const ANSWER_AUTO_SUBMIT_GRACE_SECONDS = 2

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

  const nowMs = Date.now()
  const baseStage = stageFromTimes(
    room.phase,
    nowMs,
    room.open_at,
    room.close_at,
    room.reveal_at,
    room.next_at
  )

  const roundReviewSeconds = Math.min(120, Math.max(0, Math.floor(Number(room.countdown_seconds ?? 0)) || 0))
  const roundSummaryEndsAt = buildRoundSummaryEndsAt(room.next_at, roundReviewSeconds)

  let stage = baseStage
  if (baseStage === "needs_advance" && currentIndex >= currentRound.endIndex) {
    if (roundSummaryEndsAt && nowMs < Date.parse(roundSummaryEndsAt)) {
      stage = "round_summary"
    } else {
      stage = "needs_advance"
    }
  }

  if (stage !== "needs_advance" && stage !== "round_summary") {
    return NextResponse.json({ ok: true, advanced: false, stage })
  }

  const nextIndex = currentIndex + 1

  if (nextIndex >= ids.length) {
    const finishRes = await supabaseAdmin
      .from("rooms")
      .update({ phase: "finished" })
      .eq("id", room.id)
      .eq("phase", "running")
      .eq("question_index", currentIndex)
      .select("id")

    if (finishRes.error) {
      return NextResponse.json({ error: "Could not finish game" }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      advanced: Array.isArray(finishRes.data) && finishRes.data.length > 0,
      finished: true,
    })
  }

  const now = new Date()
  const openAt = now

  const rawAnswerSeconds = Number(room.answer_seconds ?? 0)
  const effectiveAnswerSeconds =
    Number.isFinite(rawAnswerSeconds) && rawAnswerSeconds > 0 ? rawAnswerSeconds : UNTIMED_SECONDS

  const closeAt = addSeconds(openAt, effectiveAnswerSeconds + ANSWER_AUTO_SUBMIT_GRACE_SECONDS)
  const revealAt = addSeconds(closeAt, Number(room.reveal_delay_seconds ?? 0))
  const nextAt = addSeconds(revealAt, Number(room.reveal_seconds ?? 0))

  const updateRes = await supabaseAdmin
    .from("rooms")
    .update({
      question_index: nextIndex,
      countdown_start_at: now.toISOString(),
      open_at: openAt.toISOString(),
      close_at: closeAt.toISOString(),
      reveal_at: revealAt.toISOString(),
      next_at: nextAt.toISOString(),
    })
    .eq("id", room.id)
    .eq("phase", "running")
    .eq("question_index", currentIndex)
    .select("id")

  if (updateRes.error) {
    return NextResponse.json({ error: "Could not advance room" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    advanced: Array.isArray(updateRes.data) && updateRes.data.length > 0,
    finished: false,
  })
}
