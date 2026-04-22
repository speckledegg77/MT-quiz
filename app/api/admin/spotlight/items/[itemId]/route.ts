export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { z } from "zod"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import {
  buildSpotlightNaturalKey,
  cleanSpotlightDifficulty,
  cleanSpotlightItemType,
  cleanSpotlightPersonRoles,
  SPOTLIGHT_DIFFICULTY_VALUES,
  SPOTLIGHT_ITEM_TYPE_VALUES,
  SPOTLIGHT_PERSON_ROLE_VALUES,
} from "@/lib/spotlight"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type RouteContext = {
  params: Promise<{
    itemId: string
  }>
}

const updateSpotlightItemSchema = z
  .object({
    answerText: z.string().trim().min(1, "Answer text is required.").optional(),
    itemType: z.enum(SPOTLIGHT_ITEM_TYPE_VALUES).optional(),
    personRoles: z.array(z.enum(SPOTLIGHT_PERSON_ROLE_VALUES)).optional(),
    difficulty: z.enum(SPOTLIGHT_DIFFICULTY_VALUES).optional(),
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

async function findDuplicateSpotlightItem(params: {
  answerText: string
  itemType: string
  primaryShowKey: string | null
  excludeId?: string
}) {
  let query = supabaseAdmin
    .from("spotlight_items")
    .select("id, answer_text, item_type, primary_show_key")
    .eq("item_type", cleanSpotlightItemType(params.itemType))

  if (params.primaryShowKey) {
    query = query.eq("primary_show_key", params.primaryShowKey)
  } else {
    query = query.is("primary_show_key", null)
  }

  const result = await query

  if (result.error) {
    return { error: result.error.message, duplicateId: null as string | null }
  }

  const targetKey = buildSpotlightNaturalKey({
    answerText: params.answerText,
    itemType: params.itemType,
    primaryShowKey: params.primaryShowKey,
  })

  const match = (result.data ?? []).find((item) => {
    if (params.excludeId && item.id === params.excludeId) return false
    return (
      buildSpotlightNaturalKey({
        answerText: item.answer_text,
        itemType: item.item_type,
        primaryShowKey: item.primary_show_key,
      }) === targetKey
    )
  })

  return { error: null as string | null, duplicateId: match?.id ?? null }
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

  const parsed = updateSpotlightItemSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 }
    )
  }

  const existingRes = await supabaseAdmin
    .from("spotlight_items")
    .select("id, answer_text, item_type, person_roles, primary_show_key")
    .eq("id", itemId)
    .maybeSingle()

  if (existingRes.error) {
    return NextResponse.json({ error: existingRes.error.message }, { status: 500 })
  }

  if (!existingRes.data) {
    return NextResponse.json({ error: "Spotlight item not found." }, { status: 404 })
  }

  const nextAnswerText = parsed.data.answerText?.trim() || existingRes.data.answer_text
  const nextItemType = cleanSpotlightItemType(parsed.data.itemType ?? existingRes.data.item_type)
  const nextPrimaryShowKey =
    parsed.data.primaryShowKey !== undefined
      ? parsed.data.primaryShowKey?.trim() || null
      : existingRes.data.primary_show_key
  const nextPersonRoles = cleanSpotlightPersonRoles(
    parsed.data.personRoles ?? (Array.isArray(existingRes.data.person_roles) ? existingRes.data.person_roles : undefined),
    nextItemType
  )

  const duplicateCheck = await findDuplicateSpotlightItem({
    answerText: nextAnswerText,
    itemType: nextItemType,
    primaryShowKey: nextPrimaryShowKey,
    excludeId: itemId,
  })

  if (duplicateCheck.error) {
    return NextResponse.json({ error: duplicateCheck.error }, { status: 500 })
  }

  if (duplicateCheck.duplicateId) {
    return NextResponse.json(
      {
        error:
          "A Spotlight item with the same answer text, item type, and primary show already exists.",
      },
      { status: 409 }
    )
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (parsed.data.answerText !== undefined) update.answer_text = nextAnswerText
  if (parsed.data.itemType !== undefined) update.item_type = nextItemType
  if (parsed.data.personRoles !== undefined || parsed.data.itemType !== undefined) update.person_roles = nextPersonRoles
  if (parsed.data.difficulty !== undefined) update.difficulty = cleanSpotlightDifficulty(parsed.data.difficulty)
  if (parsed.data.primaryShowKey !== undefined) update.primary_show_key = nextPrimaryShowKey
  if (parsed.data.notes !== undefined) update.notes = String(parsed.data.notes).trim()
  if (parsed.data.isActive !== undefined) update.is_active = parsed.data.isActive

  const updateRes = await supabaseAdmin
    .from("spotlight_items")
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
    return NextResponse.json({ error: "Spotlight item not found." }, { status: 404 })
  }

  if (parsed.data.packIds !== undefined) {
    const deleteRes = await supabaseAdmin.from("spotlight_pack_items").delete().eq("item_id", itemId)

    if (deleteRes.error) {
      return NextResponse.json({ error: deleteRes.error.message }, { status: 500 })
    }

    const packIds = cleanPackIds(parsed.data.packIds)
    if (packIds.length) {
      const insertRes = await supabaseAdmin.from("spotlight_pack_items").insert(
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
    .from("spotlight_pack_items")
    .select("pack_id, spotlight_packs(id, name, is_active)")
    .eq("item_id", itemId)

  if (linksRes.error) {
    return NextResponse.json({ ok: true, item: updateRes.data })
  }

  const packs = (linksRes.data ?? [])
    .map((link) => {
      const pack = Array.isArray(link.spotlight_packs) ? link.spotlight_packs[0] : link.spotlight_packs
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
