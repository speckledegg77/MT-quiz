export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { z } from "zod"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import {
  cleanHeadsUpDifficulty,
  cleanHeadsUpItemType,
  cleanHeadsUpPersonRoles,
  HEADS_UP_DIFFICULTY_VALUES,
  HEADS_UP_ITEM_TYPE_VALUES,
  HEADS_UP_PERSON_ROLE_VALUES,
} from "@/lib/headsUp"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type RouteContext = {
  params: Promise<{
    itemId: string
  }>
}

const updateHeadsUpItemSchema = z
  .object({
    answerText: z.string().trim().min(1, "Answer text is required.").optional(),
    itemType: z.enum(HEADS_UP_ITEM_TYPE_VALUES).optional(),
    personRoles: z.array(z.enum(HEADS_UP_PERSON_ROLE_VALUES)).optional(),
    difficulty: z.enum(HEADS_UP_DIFFICULTY_VALUES).optional(),
    primaryShowKey: z.string().trim().nullable().optional(),
    notes: z.string().optional(),
    isActive: z.boolean().optional(),
    packIds: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (value) =>
      value.answerText !== undefined ||
      value.itemType !== undefined ||
      value.personRoles !== undefined ||
      value.difficulty !== undefined ||
      value.primaryShowKey !== undefined ||
      value.notes !== undefined ||
      value.isActive !== undefined ||
      value.packIds !== undefined,
    { message: "At least one field must be provided." }
  )

function cleanPackIds(value: string[] | undefined) {
  return [...new Set((value ?? []).map((item) => item.trim()).filter(Boolean))]
}

export async function PATCH(req: Request, context: RouteContext) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  const { itemId } = await context.params

  let body: unknown

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 })
  }

  const parsed = updateHeadsUpItemSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 }
    )
  }

  const existingRes = await supabaseAdmin
    .from("heads_up_items")
    .select("id, item_type, person_roles")
    .eq("id", itemId)
    .maybeSingle()

  if (existingRes.error) {
    return NextResponse.json({ error: existingRes.error.message }, { status: 500 })
  }

  if (!existingRes.data) {
    return NextResponse.json({ error: "Heads Up item not found." }, { status: 404 })
  }

  const nextItemType = cleanHeadsUpItemType(parsed.data.itemType ?? existingRes.data.item_type)
  const nextPersonRoles = cleanHeadsUpPersonRoles(
    parsed.data.personRoles ?? (Array.isArray(existingRes.data.person_roles) ? existingRes.data.person_roles : undefined),
    nextItemType
  )

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (parsed.data.answerText !== undefined) update.answer_text = parsed.data.answerText.trim()
  if (parsed.data.itemType !== undefined) update.item_type = nextItemType
  if (parsed.data.personRoles !== undefined || parsed.data.itemType !== undefined) update.person_roles = nextPersonRoles
  if (parsed.data.difficulty !== undefined) update.difficulty = cleanHeadsUpDifficulty(parsed.data.difficulty)
  if (parsed.data.primaryShowKey !== undefined) update.primary_show_key = parsed.data.primaryShowKey?.trim() || null
  if (parsed.data.notes !== undefined) update.notes = String(parsed.data.notes).trim()
  if (parsed.data.isActive !== undefined) update.is_active = parsed.data.isActive

  const updateRes = await supabaseAdmin
    .from("heads_up_items")
    .update(update)
    .eq("id", itemId)
    .select(
      "id, answer_text, item_type, person_roles, difficulty, primary_show_key, notes, is_active, created_at, updated_at"
    )
    .maybeSingle()

  if (updateRes.error) {
    return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
  }

  if (!updateRes.data) {
    return NextResponse.json({ error: "Heads Up item not found." }, { status: 404 })
  }

  if (parsed.data.packIds !== undefined) {
    const deleteRes = await supabaseAdmin.from("heads_up_pack_items").delete().eq("item_id", itemId)

    if (deleteRes.error) {
      return NextResponse.json({ error: deleteRes.error.message }, { status: 500 })
    }

    const packIds = cleanPackIds(parsed.data.packIds)
    if (packIds.length) {
      const insertRes = await supabaseAdmin.from("heads_up_pack_items").insert(
        packIds.map((packId) => ({
          pack_id: packId,
          item_id: itemId,
        }))
      )

      if (insertRes.error) {
        return NextResponse.json({ error: insertRes.error.message }, { status: 500 })
      }
    }
  }

  const linksRes = await supabaseAdmin
    .from("heads_up_pack_items")
    .select("pack_id, heads_up_packs(id, name, is_active)")
    .eq("item_id", itemId)

  if (linksRes.error) {
    return NextResponse.json({ ok: true, item: updateRes.data })
  }

  const packs = (linksRes.data ?? [])
    .map((link) => {
      const pack = Array.isArray(link.heads_up_packs) ? link.heads_up_packs[0] : link.heads_up_packs
      if (!pack) return null
      return {
        id: String(pack.id),
        name: String(pack.name),
        is_active: !!pack.is_active,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a!.name.localeCompare(b!.name))

  return NextResponse.json({ ok: true, item: { ...updateRes.data, packs } })
}
