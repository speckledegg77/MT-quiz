export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { advanceRoomIfReady } from "@/lib/roomProgress"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const code = String(body.code ?? "").trim().toUpperCase()

  const result = await advanceRoomIfReady({
    code,
    allowRoundSummaryAdvance: true,
    allowHeadsUpReviewAutoConfirm: false,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Could not advance room" }, { status: result.status ?? 500 })
  }

  return NextResponse.json({
    ok: true,
    advanced: result.advanced,
    finished: Boolean(result.finished),
    stage: result.stage ?? null,
  })
}
