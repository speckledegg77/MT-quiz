export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../lib/supabaseAdmin"

type PackInfo = { id: string; label: string; questionCount: number; audioCount: number }

type PackRow = {
  id: string
  display_name: string | null
  sort_order: number | null
  is_active: boolean | null
}

type PackQuestionWithQuestion = {
  pack_id: string
  questions: { round_type: string | null } | Array<{ round_type: string | null }> | null
}

export async function GET() {
  const packsRes = await supabaseAdmin
    .from("packs")
    .select("id, display_name, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("display_name", { ascending: true })

  if (packsRes.error) {
    return NextResponse.json({ error: packsRes.error.message }, { status: 500 })
  }

  const rows = (packsRes.data ?? []) as PackRow[]
  const packIds = rows.map((row) => String(row.id ?? "")).filter(Boolean)

  const questionCountMap = new Map<string, number>()
  const audioCountMap = new Map<string, number>()

  if (packIds.length > 0) {
    const linksRes = await supabaseAdmin
      .from("pack_questions")
      .select("pack_id, questions(round_type)")
      .in("pack_id", packIds)

    if (linksRes.error) {
      return NextResponse.json({ error: linksRes.error.message }, { status: 500 })
    }

    for (const row of (linksRes.data ?? []) as PackQuestionWithQuestion[]) {
      const packId = String(row.pack_id ?? "")
      if (!packId) continue

      questionCountMap.set(packId, (questionCountMap.get(packId) ?? 0) + 1)

      const questionValue = Array.isArray(row.questions) ? row.questions[0] : row.questions
      const roundType = String(questionValue?.round_type ?? "")
      if (roundType === "audio") {
        audioCountMap.set(packId, (audioCountMap.get(packId) ?? 0) + 1)
      }
    }
  }

  const packs: PackInfo[] = rows.map((row) => {
    const id = String(row.id ?? "")
    return {
      id,
      label: String(row.display_name ?? id),
      questionCount: questionCountMap.get(id) ?? 0,
      audioCount: audioCountMap.get(id) ?? 0,
    }
  })

  return NextResponse.json({ packs })
}
