export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0


import { NextResponse } from "next/server"

import { cleanSourceMode, normalisePackIds, normaliseSelectionRules } from "@/lib/roundTemplates"
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

  return NextResponse.json({ ok: true, templates: (templatesRes.data ?? []).map((template: any) => ({
    ...template,
    source_mode: cleanSourceMode(template?.source_mode),
    default_pack_ids: normalisePackIds(template?.default_pack_ids),
    selection_rules: normaliseSelectionRules(template?.selection_rules),
  })) }, { headers: { "Cache-Control": "no-store" } })
}