export const runtime = "nodejs"

import { NextResponse } from "next/server"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import { parseBooleanLike, parseCsvRows, parsePipeList, readCsvText, uniqueStrings } from "@/lib/csvImport"
import {
  cleanHeadsUpDifficulty,
  cleanHeadsUpItemType,
  cleanHeadsUpPersonRoles,
  HEADS_UP_DIFFICULTY_VALUES,
  HEADS_UP_ITEM_TYPE_VALUES,
  HEADS_UP_PERSON_ROLE_VALUES,
} from "@/lib/headsUp"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type CsvRow = {
  item_id?: string
  answer_text?: string
  item_type?: string
  person_roles?: string
  difficulty?: string
  primary_show_key?: string
  notes?: string
  is_active?: string
  pack_names?: string
}

type PreparedHeadsUpRow = {
  rowNumber: number
  itemId: string | null
  answerText: string
  itemType: (typeof HEADS_UP_ITEM_TYPE_VALUES)[number]
  personRoles: (typeof HEADS_UP_PERSON_ROLE_VALUES)[number][] | null
  difficulty: (typeof HEADS_UP_DIFFICULTY_VALUES)[number]
  primaryShowKey: string | null
  notes: string
  isActive: boolean
  packNames: string[]
}

function requiredString(raw: unknown, fieldName: string, rowNumber: number) {
  const value = String(raw ?? "").trim()
  if (!value) throw new Error(`Missing ${fieldName} on row ${rowNumber}`)
  return value
}

function cleanOptionalString(raw: unknown) {
  const value = String(raw ?? "").trim()
  return value || null
}

function dedupeCaseInsensitive(values: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}


function validateUuid(raw: string, fieldName: string, rowNumber: number) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
    throw new Error(`${fieldName} must be a valid UUID on row ${rowNumber}`)
  }
  return raw
}

function prepareRows(rows: CsvRow[]) {
  if (!rows.length) throw new Error("CSV has no rows")

  const prepared: PreparedHeadsUpRow[] = []
  const seenItemIds = new Set<string>()

  rows.forEach((row, index) => {
    const rowNumber = index + 2
    const rawItemId = String(row.item_id ?? "").trim()
    const itemId = rawItemId ? validateUuid(rawItemId, "item_id", rowNumber) : null
    if (itemId) {
      if (seenItemIds.has(itemId)) {
        throw new Error(`item_id ${itemId} appears more than once. Use one CSV row per Heads Up item.`)
      }
      seenItemIds.add(itemId)
    }

    const answerText = requiredString(row.answer_text, "answer_text", rowNumber)
    const rawItemType = requiredString(row.item_type, "item_type", rowNumber).toLowerCase()
    if (!HEADS_UP_ITEM_TYPE_VALUES.includes(rawItemType as (typeof HEADS_UP_ITEM_TYPE_VALUES)[number])) {
      throw new Error(`item_type is invalid on row ${rowNumber}`)
    }
    const itemType = cleanHeadsUpItemType(rawItemType)

    const rawRoles = uniqueStrings(parsePipeList(row.person_roles))
    const invalidRoles = rawRoles.filter(
      (role) => !HEADS_UP_PERSON_ROLE_VALUES.includes(role as (typeof HEADS_UP_PERSON_ROLE_VALUES)[number])
    )
    if (invalidRoles.length) {
      throw new Error(`person_roles contains invalid values on row ${rowNumber}: ${invalidRoles.join(", ")}`)
    }

    if (itemType !== "person" && rawRoles.length) {
      throw new Error(`person_roles can only be used when item_type is person on row ${rowNumber}`)
    }

    const personRoles = cleanHeadsUpPersonRoles(rawRoles, itemType)
    if (itemType === "person" && (!personRoles || !personRoles.length)) {
      throw new Error(`person_roles is required when item_type is person on row ${rowNumber}`)
    }

    const rawDifficulty = String(row.difficulty ?? "").trim().toLowerCase()
    if (rawDifficulty && !HEADS_UP_DIFFICULTY_VALUES.includes(rawDifficulty as (typeof HEADS_UP_DIFFICULTY_VALUES)[number])) {
      throw new Error(`difficulty is invalid on row ${rowNumber}`)
    }

    prepared.push({
      rowNumber,
      itemId,
      answerText,
      itemType,
      personRoles,
      difficulty: cleanHeadsUpDifficulty(rawDifficulty || "medium"),
      primaryShowKey: cleanOptionalString(row.primary_show_key),
      notes: String(row.notes ?? "").trim(),
      isActive: parseBooleanLike(row.is_active, true),
      packNames: dedupeCaseInsensitive(uniqueStrings(parsePipeList(row.pack_names))),
    })
  })

  return prepared
}

async function getShowKeysMap(showKeys: string[]) {
  if (!showKeys.length) return new Set<string>()
  const res = await supabaseAdmin.from("shows").select("show_key").in("show_key", showKeys)
  if (res.error) throw new Error(res.error.message)
  return new Set((res.data ?? []).map((row) => row.show_key))
}

async function getPacksByNameMap(packNames: string[]) {
  const res = await supabaseAdmin.from("heads_up_packs").select("id, name")
  if (res.error) throw new Error(res.error.message)

  const byLowerName = new Map<string, { id: string; name: string }>()
  for (const pack of res.data ?? []) {
    byLowerName.set(String(pack.name).trim().toLowerCase(), {
      id: String(pack.id),
      name: String(pack.name),
    })
  }

  const missing = packNames.filter((name) => !byLowerName.has(name.toLowerCase()))
  if (missing.length) {
    const insertRes = await supabaseAdmin
      .from("heads_up_packs")
      .insert(missing.map((name) => ({ name, description: "", is_active: true })))
      .select("id, name")

    if (insertRes.error) throw new Error(insertRes.error.message)

    for (const pack of insertRes.data ?? []) {
      byLowerName.set(String(pack.name).trim().toLowerCase(), {
        id: String(pack.id),
        name: String(pack.name),
      })
    }
  }

  return byLowerName
}

async function getExistingItemIds(itemIds: string[]) {
  if (!itemIds.length) return new Set<string>()
  const res = await supabaseAdmin.from("heads_up_items").select("id").in("id", itemIds)
  if (res.error) throw new Error(res.error.message)
  return new Set((res.data ?? []).map((row) => row.id))
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      "Admin Heads Up import route is live. POST raw CSV or multipart form-data field 'file'. Add ?validateOnly=true to preview the import without writing.",
  })
}

export async function POST(req: Request) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  try {
    const validateOnly = new URL(req.url).searchParams.get("validateOnly") === "true"
    const csvText = await readCsvText(req)
    const rows = parseCsvRows<CsvRow>(csvText)
    const preparedRows = prepareRows(rows)

    const showKeys = uniqueStrings(preparedRows.map((row) => row.primaryShowKey))
    const existingShowKeys = await getShowKeysMap(showKeys)
    const missingShowKeys = showKeys.filter((key) => !existingShowKeys.has(key))
    if (missingShowKeys.length) {
      throw new Error(`Unknown primary_show_key value(s): ${missingShowKeys.join(", ")}`)
    }

    const allPackNames = uniqueStrings(preparedRows.flatMap((row) => row.packNames))
    const existingPackMapBeforeCreate = await (async () => {
      const res = await supabaseAdmin.from("heads_up_packs").select("id, name")
      if (res.error) throw new Error(res.error.message)
      return new Map(
        (res.data ?? []).map((pack) => [String(pack.name).trim().toLowerCase(), { id: String(pack.id), name: String(pack.name) }])
      )
    })()
    const missingPackNames = allPackNames.filter((name) => !existingPackMapBeforeCreate.has(name.toLowerCase()))

    const existingItemIds = await getExistingItemIds(uniqueStrings(preparedRows.map((row) => row.itemId)))

    if (validateOnly) {
      return NextResponse.json({
        ok: true,
        validateOnly: true,
        packsCreate: missingPackNames.length,
        itemsCreate: preparedRows.filter((row) => !row.itemId || !existingItemIds.has(row.itemId)).length,
        itemsUpdate: preparedRows.filter((row) => !!row.itemId && existingItemIds.has(row.itemId)).length,
        packLinksReplace: preparedRows.length,
      })
    }

    const packMap = await getPacksByNameMap(allPackNames)

    let itemsCreate = 0
    let itemsUpdate = 0

    for (const row of preparedRows) {
      const payload = {
        answer_text: row.answerText,
        item_type: row.itemType,
        person_roles: row.personRoles,
        difficulty: row.difficulty,
        primary_show_key: row.primaryShowKey,
        notes: row.notes,
        is_active: row.isActive,
      }

      let finalItemId: string

      if (row.itemId) {
        if (existingItemIds.has(row.itemId)) itemsUpdate += 1
        else itemsCreate += 1

        const writeRes = await supabaseAdmin
          .from("heads_up_items")
          .upsert({ id: row.itemId, ...payload }, { onConflict: "id" })
          .select("id")
          .single()

        if (writeRes.error) throw new Error(writeRes.error.message)
        finalItemId = writeRes.data.id
      } else {
        itemsCreate += 1
        const writeRes = await supabaseAdmin.from("heads_up_items").insert(payload).select("id").single()
        if (writeRes.error) throw new Error(writeRes.error.message)
        finalItemId = writeRes.data.id
      }

      const deleteLinksRes = await supabaseAdmin.from("heads_up_pack_items").delete().eq("item_id", finalItemId)
      if (deleteLinksRes.error) throw new Error(deleteLinksRes.error.message)

      const packIds = row.packNames
        .map((packName) => packMap.get(packName.toLowerCase())?.id)
        .filter(Boolean) as string[]

      if (packIds.length) {
        const insertLinksRes = await supabaseAdmin.from("heads_up_pack_items").insert(
          packIds.map((packId) => ({
            pack_id: packId,
            item_id: finalItemId,
          }))
        )
        if (insertLinksRes.error) throw new Error(insertLinksRes.error.message)
      }
    }

    return NextResponse.json({
      ok: true,
      validateOnly: false,
      packsCreate: missingPackNames.length,
      itemsCreate,
      itemsUpdate,
      packLinksReplace: preparedRows.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 400 }
    )
  }
}
