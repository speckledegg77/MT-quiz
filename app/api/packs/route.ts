export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../lib/supabaseAdmin"

type PackInfo = { id: string; label: string; questionCount: number; audioCount: number }

export async function GET() {
  const packsRes = await supabaseAdmin
    .from("packs_with_counts")
    .select("id, display_name, sort_order, is_active, question_count")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("display_name", { ascending: true })

  if (packsRes.error) {
    return NextResponse.json({ error: packsRes.error.message }, { status: 500 })
  }

  const rows = packsRes.data ?? []
  const packIds = rows.map(r => String((r as any).id ?? "")).filter(Boolean)

  const audioMap = new Map<string, number>()

  if (packIds.length > 0) {
    const linksRes = await supabaseAdmin
      .from("pack_questions")
      .select("pack_id, questions(round_type)")
      .in("pack_id", packIds)

    if (!linksRes.error && Array.isArray(linksRes.data)) {
      for (const row of linksRes.data as any[]) {
        const pid = String(row.pack_id ?? "")
        const rt = row.questions?.round_type
        if (!pid) continue
        if (rt === "audio") {
          audioMap.set(pid, (audioMap.get(pid) ?? 0) + 1)
        }
      }
    }
  }

  const packs: PackInfo[] = rows.map((r: any) => {
    const id = String(r.id ?? "")
    return {
      id,
      label: String(r.display_name ?? id),
      questionCount: Number(r.question_count ?? 0),
      audioCount: audioMap.get(id) ?? 0,
    }
  })

  return NextResponse.json({ packs })
}
