export const runtime = "nodejs"

import { NextResponse } from "next/server"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function GET(req: Request) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  const showsRes = await supabaseAdmin
    .from("shows")
    .select("show_key, display_name, alt_names, is_active, created_at, updated_at")
    .order("display_name")

  if (showsRes.error) {
    return NextResponse.json({ error: showsRes.error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, shows: showsRes.data ?? [] })
}