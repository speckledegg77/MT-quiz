export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { z } from "zod"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

const createSpotlightPackSchema = z.object({
  name: z.string().trim().min(1, "Pack name is required."),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
})

async function loadSpotlightPacks() {
  const packsRes = await supabaseAdmin
    .from("spotlight_packs")
    .select("id, name, description, is_active, created_at, updated_at")
    .order("name", { ascending: true })

  if (packsRes.error) {
    return { error: packsRes.error.message }
  }

  const linksRes = await supabaseAdmin.from("spotlight_pack_items").select("pack_id")

  if (linksRes.error) {
    return { error: linksRes.error.message }
  }

  const counts = new Map<string, number>()
  for (const link of linksRes.data ?? []) {
    counts.set(link.pack_id, (counts.get(link.pack_id) ?? 0) + 1)
  }

  return {
    packs: (packsRes.data ?? []).map((pack) => ({
      ...pack,
      item_count: counts.get(pack.id) ?? 0,
    })),
  }
}

export async function GET(req: Request) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  const result = await loadSpotlightPacks()

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, packs: result.packs })
}

export async function POST(req: Request) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  let body: unknown

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 })
  }

  const parsed = createSpotlightPackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 }
    )
  }

  const insertRes = await supabaseAdmin
    .from("spotlight_packs")
    .insert({
      name: parsed.data.name.trim(),
      description: String(parsed.data.description ?? "").trim(),
      is_active: parsed.data.isActive ?? true,
    })
    .select("id, name, description, is_active, created_at, updated_at")
    .single()

  if (insertRes.error) {
    return NextResponse.json({ error: insertRes.error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, pack: { ...insertRes.data, item_count: 0 } })
}
