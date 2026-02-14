export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"
import { questions } from "../../../../data/questions"

function randomCode(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let out = ""
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

function shuffle<T>(arr: T[]) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
  return a
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  const questionCount = Number(body.questionCount ?? 20)
  const countdownSeconds = Number(body.countdownSeconds ?? 3)
  const answerSeconds = Number(body.answerSeconds ?? 60)
  const revealDelaySeconds = Number(body.revealDelaySeconds ?? 2)
  const revealSeconds = Number(body.revealSeconds ?? 5)

  const audioModeRaw = String(body.audioMode ?? "display").toLowerCase()
  const audioMode = audioModeRaw === "phones" || audioModeRaw === "both" ? audioModeRaw : "display"

  const selectedPacksInput = Array.isArray(body.selectedPacks) ? body.selectedPacks : ["general"]
  const selectedPacks = selectedPacksInput
    .map((x: any) => String(x ?? "").trim())
    .filter((x: string) => x.length > 0)

  const packs = selectedPacks.length ? selectedPacks : ["general"]

  const pool = questions.filter(q => (q.packs ?? []).some(p => packs.includes(p)))
  if (pool.length === 0) {
    return NextResponse.json(
      { error: `No questions found for packs: ${packs.join(", ")}` },
      { status: 400 }
    )
  }

  if (pool.length < questionCount) {
    return NextResponse.json(
      { error: `Not enough questions. You asked for ${questionCount} but only ${pool.length} match those rounds.` },
      { status: 400 }
    )
  }

  const picked = shuffle(pool).slice(0, questionCount)
  const questionIds = picked.map(q => q.id)

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode(8)

    const ins = await supabaseAdmin
      .from("rooms")
      .insert({
        code,
        phase: "lobby",
        question_ids: questionIds,
        question_index: 0,
        countdown_seconds: countdownSeconds,
        answer_seconds: answerSeconds,
        reveal_delay_seconds: revealDelaySeconds,
        reveal_seconds: revealSeconds,
        audio_mode: audioMode,
        selected_packs: packs
      })
      .select("code")
      .single()

    if (!ins.error) return NextResponse.json({ code: ins.data.code })
  }

  return NextResponse.json({ error: "Could not create room" }, { status: 500 })
}
