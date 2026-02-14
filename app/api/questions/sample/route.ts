export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"

type RoundRequest = {
  packId: string
  count: number
}

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  const rounds: RoundRequest[] = Array.isArray(body.rounds) ? body.rounds : []
  if (!rounds.length) return NextResponse.json({ error: "Missing rounds" }, { status: 400 })

  const out: string[] = []

  for (const r of rounds) {
    const packId = String(r.packId ?? "").trim()
    const count = Math.max(0, Math.floor(Number(r.count)))

    if (!packId || count <= 0) {
      return NextResponse.json({ error: "Each round needs packId and count > 0" }, { status: 400 })
    }

    const linksRes = await supabaseAdmin
      .from("pack_questions")
      .select("question_id")
      .eq("pack_id", packId)

    if (linksRes.error) return NextResponse.json({ error: linksRes.error.message }, { status: 500 })

    const ids = (linksRes.data ?? [])
      .map(row => String((row as any).question_id ?? ""))
      .filter(Boolean)

    if (ids.length < count) {
      return NextResponse.json(
        { error: `Pack ${packId} only has ${ids.length} questions (asked for ${count})` },
        { status: 400 }
      )
    }

    shuffleInPlace(ids)
    out.push(...ids.slice(0, count))
  }

  return NextResponse.json({ questionIds: out })
}
