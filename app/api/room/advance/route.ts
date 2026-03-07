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

  const baseStage = stageFromTimes(
    room.phase,
    Date.now(),
    room.open_at,
    room.close_at,
    room.reveal_at,
    room.next_at
  )

  const stage = baseStage === "needs_advance" && currentIndex >= currentRound.endIndex ? "round_summary" : baseStage

  if (stage !== "needs_advance" && stage !== "round_summary") {
    return NextResponse.json({ ok: true, advanced: false, stage })
  }

  const nextIndex = currentIndex + 1

  if (nextIndex >= ids.length) {
    await supabaseAdmin.from("rooms").update({ phase: "finished" }).eq("id", room.id)
    return NextResponse.json({ ok: true, advanced: true, finished: true })
  }

  const now = new Date()
  const openAt = now

  const rawAnswerSeconds = Number(room.answer_seconds ?? 0)
  const effectiveAnswerSeconds =
    Number.isFinite(rawAnswerSeconds) && rawAnswerSeconds > 0 ? rawAnswerSeconds : UNTIMED_SECONDS

  const closeAt = addSeconds(openAt, effectiveAnswerSeconds)
  const revealAt = addSeconds(closeAt, Number(room.reveal_delay_seconds ?? 0))
  const nextAt = addSeconds(revealAt, Number(room.reveal_seconds ?? 0))

  await supabaseAdmin
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

  return NextResponse.json({ ok: true, advanced: true, finished: false })
}