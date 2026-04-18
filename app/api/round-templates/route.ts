export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"

import { normaliseRoundTemplateRow } from "@/lib/roundTemplates"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function GET() {
  const templatesRes = await supabaseAdmin
    .from("round_templates")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true })

  if (templatesRes.error) {
    return NextResponse.json({ error: templatesRes.error.message }, { status: 500 })
  }

  return NextResponse.json(
    { ok: true, templates: (templatesRes.data ?? []).map(normaliseRoundTemplateRow) },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  )
}
