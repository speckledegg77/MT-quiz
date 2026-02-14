export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"
import { pickQuestionIds } from "../../../../lib/questionBank"

function makeCode(length = 8) {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
  let out = ""
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  const questionCount = Number(body.questionCount ?? 20)
  const countdownSeconds = Number(body.countdownSeconds ?? 3)
  const answerSeconds = Number(body.answerSeconds ?? 12)
  const revealDelaySeconds = Number(body.revealDelaySeconds ?? 2)
  const revealSeconds = Number(body.revealSeconds ?? 5)
  const pack = (body.pack === "all" ? "all" : "general") as "all" | "general"

  const ids = pickQuestionIds(questionCount, pack)
  if (ids.length === 0) return NextResponse.json({ error: "No questions available" }, { status: 400 })

  let code = makeCode()

  for (let attempt = 0; attempt < 8; attempt++) {
    const { error } = await supabaseAdmin.from("rooms").insert({
      code,
      phase: "lobby",
      question_ids: ids,
      question_index: 0,
      countdown_seconds: countdownSeconds,
      answer_seconds: answerSeconds,
      reveal_delay_seconds: revealDelaySeconds,
      reveal_seconds: revealSeconds
    })

    if (!error) return NextResponse.json({ code })
    code = makeCode()
  }

  return NextResponse.json({ error: "Could not create room" }, { status: 500 })
}
