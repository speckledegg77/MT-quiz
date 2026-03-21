export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { z } from "zod"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import {
  buildHeadsUpNaturalKey,
  cleanHeadsUpDifficulty,
  cleanHeadsUpItemType,
  cleanHeadsUpPersonRoles,
  HEADS_UP_DIFFICULTY_VALUES,
  HEADS_UP_ITEM_TYPE_VALUES,
  HEADS_UP_PERSON_ROLE_VALUES,
} from "@/lib/headsUp"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

const createHeadsUpItemSchema = z.object({
  answerText: z.string().trim().min(1, "Answer text is required."),
  itemType: z.enum(HEADS_UP_ITEM_TYPE_VALUES),
  personRoles: z.array(z.enum(HEADS_UP_PERSON_ROLE_VALUES)).optional(),
  difficulty: z.enum(HEADS_UP_DIFFICULTY_VALUES).default("medium"),
  primaryShowKey: z.string().trim().nullable().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
  packIds: z.array(z.string().uuid()).optional(),
})

function cleanPackIds(value: string[] | undefined) {
  return [...new Set((value ?? []).map((item) => item.trim()).filter(Boolean))]
}

async function loadHeadsUpItems() {
  const itemsRes = await supabaseAdmin
    .from("heads_up_items")
    .select(
      "id, answer_text, item_type, person_roles, difficulty, primary_show_key, notes, is_active, created_at, updated_at"
    )
    .order("answer_text", { ascending: true })

  if (itemsRes.error) {
    return { error: itemsRes.error.message }
  }

  const linksRes = await supabaseAdmin
    .from("heads_up_pack_items")
    .select("item_id, pack_id, heads_up_packs(id, name, is_active)")

  if (linksRes.error) {
    return { error: linksRes.error.message }
  }

  const packsByItemId = new Map<string, Array<{ id: string; name: string; is_active: boolean }>>()

  for (const link of linksRes.data ?? []) {
    const pack = Array.isArray(link.heads_up_packs)
      ? link.heads_up_packs[0]
      : link.heads_up_packs

    if (!pack || !link.item_id) continue

    const current = packsByItemId.get(link.item_id) ?? []
    current.push({
      id: String(pack.id),
      name: String(pack.name),
      is_active: !!pack.is_active,
    })
    packsByItemId.set(link.item_id, current)
  }

  const items = (itemsRes.data ?? []).map((item) => ({
    ...item,
    packs: (packsByItemId.get(item.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  }))

  return { items }
}

async function findDuplicateHeadsUpItem(params: {
  answerText: string
  itemType: string
  primaryShowKey: string | null
  excludeId?: string
}) {
  let query = supabaseAdmin
    .from("heads_up_items")
    .select("id, answer_text, item_type, primary_show_key")
    .eq("item_type", cleanHeadsUpItemType(params.itemType))

  if (params.primaryShowKey) {
    query = query.eq("primary_show_key", params.primaryShowKey)
  } else {
    query = query.is("primary_show_key", null)
  }

  const result = await query

  if (result.error) {
    return { error: result.error.message, duplicateId: null as string | null }
  }

  const targetKey = buildHeadsUpNaturalKey({
    answerText: params.answerText,
    itemType: params.itemType,
    primaryShowKey: params.primaryShowKey,
  })

  const match = (result.data ?? []).find((item) => {
    if (params.excludeId && item.id === params.excludeId) return false
    return (
      buildHeadsUpNaturalKey({
        answerText: item.answer_text,
        itemType: item.item_type,
        primaryShowKey: item.primary_show_key,
      }) === targetKey
    )
  })

  return { error: null as string | null, duplicateId: match?.id ?? null }
}

export async function GET(req: Request) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  const result = await loadHeadsUpItems()

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, items: result.items })
}

export async function POST(req: Request) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  let body: unknown

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 })
  }

  const parsed = createHeadsUpItemSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 }
    )
  }

  const itemType = cleanHeadsUpItemType(parsed.data.itemType)
  const primaryShowKey = parsed.data.primaryShowKey?.trim() || null
  const personRoles = cleanHeadsUpPersonRoles(parsed.data.personRoles, itemType)
  const packIds = cleanPackIds(parsed.data.packIds)

  const duplicateCheck = await findDuplicateHeadsUpItem({
    answerText: parsed.data.answerText.trim(),
    itemType,
    primaryShowKey,
  })

  if (duplicateCheck.error) {
    return NextResponse.json({ error: duplicateCheck.error }, { status: 500 })
  }

  if (duplicateCheck.duplicateId) {
    return NextResponse.json(
      {
        error:
          "A Heads Up item with the same answer text, item type, and primary show already exists.",
      },
      { status: 409 }
    )
  }

  const insertRes = await supabaseAdmin
    .from("heads_up_items")
    .insert({
      answer_text: parsed.data.answerText.trim(),
      item_type: itemType,
      person_roles: personRoles,
      difficulty: cleanHeadsUpDifficulty(parsed.data.difficulty),
      primary_show_key: primaryShowKey,
      notes: String(parsed.data.notes ?? "").trim(),
      is_active: parsed.data.isActive ?? true,
    })
    .select(
      "id, answer_text, item_type, person_roles, difficulty, primary_show_key, notes, is_active, created_at, updated_at"
    )
    .single()

  if (insertRes.error) {
    return NextResponse.json({ error: insertRes.error.message }, { status: 500 })
  }

  if (packIds.length) {
    const linkRows = packIds.map((packId) => ({
      pack_id: packId,
      item_id: insertRes.data.id,
    }))

    const linksInsertRes = await supabaseAdmin.from("heads_up_pack_items").insert(linkRows)

    if (linksInsertRes.error) {
      await supabaseAdmin.from("heads_up_items").delete().eq("id", insertRes.data.id)
      return NextResponse.json({ error: linksInsertRes.error.message }, { status: 500 })
    }
  }

  const result = await loadHeadsUpItems()

  if ("error" in result) {
    return NextResponse.json({ ok: true, item: insertRes.data })
  }

  const createdItem = result.items.find((item) => item.id === insertRes.data.id)

  return NextResponse.json({ ok: true, item: createdItem ?? insertRes.data })
}
