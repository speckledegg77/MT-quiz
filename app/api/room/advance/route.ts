export const runtime = "nodejs"

import { NextResponse } from "next/server"
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

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function buildRoundSummaryEndsAt(nextAt: string | null | undefined, roundReviewSeconds: number) {
  if (!nextAt || roundReviewSeconds <= 0) return null
  const startMs = Date.parse(nextAt)
  if (!Number.isFinite(startMs)) return null
  return new Date(startMs + roundReviewSeconds * 1000).toISOString()
}

function normaliseRoundCount(raw: any, questionCount: number) {
  const qc = Math.max(1, Math.floor(Number(questionCount ?? 0)) || 1)
  const requested = Math.floor(Number(raw ?? 4))
  const safe = Number.isFinite(requested) ? requested : 4
  const capped = clampInt(safe, 1, 20)
  return Math.min(capped, qc)
}

function buildRoundPlan(questionCount: number, roundCountRaw: any) {
  const qc = Math.max(1, Math.floor(Number(questionCount ?? 0)) || 1)
  const rc = normaliseRoundCount(roundCountRaw, qc)
  const base = Math.floor(qc / rc)
  const rem = qc % rc

  const plan: Array<{ index: number; startIndex: number; endIndex: number }> = []
  let start = 0

  for (let i = 0; i < rc; i++) {
    const size = base + (i < rem ? 1 : 0)
    const end = start + size - 1
    plan.push({ index: i, startIndex: start, endIndex: end })
    start = end + 1
  }

  return plan
}

function findRoundForQuestion(questionIndex: number, plan: Array<{ index: number; startIndex: number; endIndex: number }>) {
  const qi = Math.max(0, Math.floor(Number(questionIndex ?? 0)) || 0)
  for (const round of plan) {
    if (qi >= round.startIndex && qi <= round.endIndex) return round
  }
  return plan[0]
}

const UNTIMED_SECONDS = 60 * 60 * 24 * 365 // 1 year
const ANSWER_AUTO_SUBMIT_GRACE_SECONDS = 2

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const code = String(body.code ?? "").trim().toUpperCase()

  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 })

  const roomRes = await supabaseAdmin.from("rooms").select("*").eq("code", code).single()
  if (roomRes.error) return NextResponse.json({ error: "Room not found" }, { status: 404 })

  const room = roomRes.data
  if (room.phase !== "running") return NextResponse.json({ ok: true, advanced: false })

  const ids = Array.isArray(room.question_ids) ? room.question_ids : []
  const currentIndex = Math.max(0, Math.floor(Number(room.question_index ?? 0)) || 0)
  const roundPlan = buildRoundPlan(ids.length || 1, room.round_count)
  const currentRound = findRoundForQuestion(currentIndex, roundPlan)

  const nowMs = Date.now()
  const baseStage = stageFromTimes(
    room.phase,
    nowMs,
    room.open_at,
    room.close_at,
    room.reveal_at,
    room.next_at
  )

  const roundReviewSeconds = clampInt(Number(room.countdown_seconds ?? 0), 0, 120)
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
