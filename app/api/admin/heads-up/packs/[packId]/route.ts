export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { z } from "zod"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type RouteContext = {
  params: Promise<{
    packId: string
  }>
}

const updateHeadsUpPackSchema = z
  .object({
    name: z.string().trim().min(1, "Pack name is required.").optional(),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.description !== undefined || value.isActive !== undefined,
    { message: "At least one field must be provided." }
  )

export async function PATCH(req: Request, context: RouteContext) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  const { packId } = await context.params

  let body: unknown

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 })
  }

  const parsed = updateHeadsUpPackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 }
    )
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (parsed.data.name !== undefined) update.name = parsed.data.name.trim()
  if (parsed.data.description !== undefined) update.description = String(parsed.data.description).trim()
  if (parsed.data.isActive !== undefined) update.is_active = parsed.data.isActive

  const updateRes = await supabaseAdmin
    .from("heads_up_packs")
    .update(update)
    .eq("id", packId)
    .select("id, name, description, is_active, created_at, updated_at")
    .maybeSingle()

  if (updateRes.error) {
    return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
  }

  if (!updateRes.data) {
    return NextResponse.json({ error: "Spotlight pack not found." }, { status: 404 })
  }

  const countRes = await supabaseAdmin
    .from("heads_up_pack_items")
    .select("item_id", { count: "exact", head: true })
    .eq("pack_id", packId)

  if (countRes.error) {
    return NextResponse.json({ ok: true, pack: { ...updateRes.data, item_count: 0 } })
  }

  return NextResponse.json({ ok: true, pack: { ...updateRes.data, item_count: countRes.count ?? 0 } })
}
