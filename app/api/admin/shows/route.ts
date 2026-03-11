export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { z } from "zod"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

function normaliseShowKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
}

function cleanAltNames(values: string[] | undefined) {
  return (values ?? []).map((value) => value.trim()).filter(Boolean)
}

const createShowSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required."),
  showKey: z.string().trim().optional().nullable(),
  altNames: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
})

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

export async function POST(req: Request) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  let body: unknown

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 })
  }

  const parsed = createShowSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload." }, { status: 400 })
  }

  const displayName = parsed.data.displayName.trim()
  const showKey = normaliseShowKey(parsed.data.showKey?.trim() || displayName)
  const altNames = cleanAltNames(parsed.data.altNames)
  const isActive = parsed.data.isActive ?? true

  if (!showKey) {
    return NextResponse.json({ error: "Could not generate a valid show key." }, { status: 400 })
  }

  const insertRes = await supabaseAdmin
    .from("shows")
    .insert({
      show_key: showKey,
      display_name: displayName,
      alt_names: altNames,
      is_active: isActive,
    })
    .select("show_key, display_name, alt_names, is_active, created_at, updated_at")
    .single()

  if (insertRes.error) {
    return NextResponse.json({ error: insertRes.error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, show: insertRes.data })
}