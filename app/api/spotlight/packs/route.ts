export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function GET() {
  const res = await supabaseAdmin
    .from("spotlight_packs")
    .select("id, name, description, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true })

  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    packs: (res.data ?? []).map((pack: any) => ({
      id: String(pack?.id ?? ""),
      name: String(pack?.name ?? "").trim(),
      description: String(pack?.description ?? "").trim(),
      is_active: Boolean(pack?.is_active ?? true),
    })),
  })
}
