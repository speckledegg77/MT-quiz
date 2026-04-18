export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"

import { getVisibleHostTemplates } from "@/lib/hostCatalog"
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
    { ok: true, templates: getVisibleHostTemplates(templatesRes.data ?? []) },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  )
}
