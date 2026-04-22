export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { parse } from "csv-parse/sync"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import {
  buildSpotlightNaturalKey,
  cleanSpotlightDifficulty,
  cleanSpotlightItemType,
  SPOTLIGHT_DIFFICULTY_VALUES,
  SPOTLIGHT_ITEM_TYPE_VALUES,
  SPOTLIGHT_PERSON_ROLE_VALUES,
  type SpotlightDifficulty,
  type SpotlightItemType,
  type SpotlightPersonRole,
} from "@/lib/spotlight"
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

type ExistingItem = {
  id: string
  answer_text: string
  item_type: string
  primary_show_key: string | null
}

type PlannedOperation = {
  rowNumber: number
  resolvedItemId: string | null
  action: "create" | "update"
  answerText: string
  itemType: SpotlightItemType
  personRoles: SpotlightPersonRole[] | null
  difficulty: SpotlightDifficulty
  primaryShowKey: string | null
  notes: string
  isActive: boolean
  packNames: string[]
  naturalKey: string
}

function parsePipeList(raw: string | undefined) {
  return [...new Set(String(raw ?? "").split("|").map((item) => item.trim()).filter(Boolean))]
}

function parseBoolean(raw: string | undefined) {
  const value = String(raw ?? "").trim().toLowerCase()
  if (!value) return true
  if (["true", "1", "yes", "y"].includes(value)) return true
  if (["false", "0", "no", "n"].includes(value)) return false
  return null
}

function lowerKey(value: string) {
  return value.trim().toLowerCase()
}

function formatRowError(rowNumber: number, message: string) {
  return `Row ${rowNumber}: ${message}`
}

function buildExistingNaturalKeyMap(items: ExistingItem[]) {
  const map = new Map<string, ExistingItem[]>()

  for (const item of items) {
    const key = buildSpotlightNaturalKey({
      answerText: item.answer_text,
      itemType: item.item_type,
      primaryShowKey: item.primary_show_key,
    })
    const current = map.get(key) ?? []
    current.push(item)
    map.set(key, current)
  }

  return map
}

async function readCsvText(req: Request): Promise<string> {
  const contentType = String(req.headers.get("content-type") ?? "").toLowerCase()

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData()
    const file = form.get("file")
    if (!file || typeof (file as File).text !== "function") {
      throw new Error("Missing file field in form data.")
    }
    return await (file as File).text()
  }

  const text = await req.text()
  if (!text || !text.trim()) throw new Error("Empty request body")
  return text
}

export async function GET(req: Request) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  return NextResponse.json({
    ok: true,
    message:
      "POST raw CSV or multipart form-data field 'file'. Header: x-admin-token. Optional header x-validate-only: true. Columns: item_id,answer_text,item_type,person_roles,difficulty,primary_show_key,notes,is_active,pack_names",
  })
}

export async function POST(req: Request) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  try {
    const validateOnly = String(req.headers.get("x-validate-only") ?? "").toLowerCase() === "true"
    const csvText = await readCsvText(req)

    let rows: CsvRow[] = []
    try {
      rows = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_quotes: true,
        relax_column_count: true,
      }) as CsvRow[]
    } catch (error: any) {
      return NextResponse.json(
        { error: "Could not parse CSV.", detail: String(error?.message ?? "") },
        { status: 400 }
      )
    }

    if (!rows.length) {
      return NextResponse.json({ error: "CSV has no rows." }, { status: 400 })
    }

    const existingItemsRes = await supabaseAdmin
      .from("heads_up_items")
      .select("id, answer_text, item_type, primary_show_key")
      .order("created_at", { ascending: true })

    if (existingItemsRes.error) {
      return NextResponse.json({ error: existingItemsRes.error.message }, { status: 500 })
    }

    const existingItems = (existingItemsRes.data ?? []) as ExistingItem[]
    const existingItemsById = new Map(existingItems.map((item) => [item.id, item]))
    const existingNaturalKeyMap = buildExistingNaturalKeyMap(existingItems)

    const showKeys = [...new Set(rows.map((row) => String(row.primary_show_key ?? "").trim()).filter(Boolean))]
    const showKeySet = new Set<string>()

    if (showKeys.length) {
      const showsRes = await supabaseAdmin
        .from("shows")
        .select("show_key")
        .in("show_key", showKeys)

      if (showsRes.error) {
        return NextResponse.json({ error: showsRes.error.message }, { status: 500 })
      }

      for (const show of showsRes.data ?? []) {
        showKeySet.add(String(show.show_key))
      }
    }

    const packNamesByLower = new Map<string, string>()
    for (const packName of rows.flatMap((row) => parsePipeList(row.pack_names))) {
      const key = lowerKey(packName)
      if (!packNamesByLower.has(key)) packNamesByLower.set(key, packName)
    }
    const packNamesInFile = [...packNamesByLower.values()]
    const existingPackIdsByLowerName = new Map<string, string>()

    if (packNamesInFile.length) {
      const packsRes = await supabaseAdmin
        .from("heads_up_packs")
        .select("id, name")
        .order("name", { ascending: true })

      if (packsRes.error) {
        return NextResponse.json({ error: packsRes.error.message }, { status: 500 })
      }

      for (const pack of packsRes.data ?? []) {
        existingPackIdsByLowerName.set(lowerKey(String(pack.name)), String(pack.id))
      }
    }

    const plannedOperations: PlannedOperation[] = []
    const rowErrors: string[] = []
    const csvNaturalKeys = new Map<string, string>()

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      const rowNumber = index + 2

      const itemId = String(row.item_id ?? "").trim()
      const answerText = String(row.answer_text ?? "").trim()
      const itemTypeRaw = String(row.item_type ?? "").trim().toLowerCase()
      const itemType = cleanSpotlightItemType(itemTypeRaw)
      const personRolesRaw = parsePipeList(row.person_roles)
      const difficultyRaw = String(row.difficulty ?? "").trim().toLowerCase()
      const difficulty = cleanSpotlightDifficulty(difficultyRaw)
      const primaryShowKey = String(row.primary_show_key ?? "").trim() || null
      const notes = String(row.notes ?? "").trim()
      const isActive = parseBoolean(row.is_active)
      const packNames = parsePipeList(row.pack_names)

      if (!answerText) {
        rowErrors.push(formatRowError(rowNumber, "answer_text is required."))
        continue
      }

      if (!SPOTLIGHT_ITEM_TYPE_VALUES.includes(itemTypeRaw as SpotlightItemType)) {
        rowErrors.push(
          formatRowError(
            rowNumber,
            `item_type must be one of: ${SPOTLIGHT_ITEM_TYPE_VALUES.join(", ")}.`
          )
        )
        continue
      }

      if (!SPOTLIGHT_DIFFICULTY_VALUES.includes(difficultyRaw as SpotlightDifficulty)) {
        rowErrors.push(
          formatRowError(
            rowNumber,
            `difficulty must be one of: ${SPOTLIGHT_DIFFICULTY_VALUES.join(", ")}.`
          )
        )
        continue
      }

      if (isActive === null) {
        rowErrors.push(formatRowError(rowNumber, "is_active must be true or false if provided."))
        continue
      }

      if (primaryShowKey && !showKeySet.has(primaryShowKey)) {
        rowErrors.push(formatRowError(rowNumber, `primary_show_key "${primaryShowKey}" does not exist.`))
        continue
      }

      let personRoles: SpotlightPersonRole[] | null = null

      if (itemType === "person") {
        if (!personRolesRaw.length) {
          rowErrors.push(formatRowError(rowNumber, "person items must include at least one person_roles value."))
          continue
        }

        const invalidRoles = personRolesRaw.filter(
          (role) => !SPOTLIGHT_PERSON_ROLE_VALUES.includes(role as SpotlightPersonRole)
        )

        if (invalidRoles.length) {
          rowErrors.push(
            formatRowError(
              rowNumber,
              `person_roles contains invalid values: ${invalidRoles.join(", ")}.`
            )
          )
          continue
        }

        personRoles = personRolesRaw as SpotlightPersonRole[]
      } else if (personRolesRaw.length) {
        rowErrors.push(formatRowError(rowNumber, "person_roles can only be used when item_type is person."))
        continue
      }

      const naturalKey = buildSpotlightNaturalKey({
        answerText,
        itemType,
        primaryShowKey,
      })

      const existingMatches = existingNaturalKeyMap.get(naturalKey) ?? []

      let resolvedItemId: string | null = null
      let action: "create" | "update" = "create"

      if (itemId) {
        const existingItem = existingItemsById.get(itemId)

        if (!existingItem) {
          rowErrors.push(formatRowError(rowNumber, `item_id "${itemId}" does not exist.`))
          continue
        }

        const conflictingMatch = existingMatches.find((item) => item.id !== itemId)
        if (conflictingMatch) {
          rowErrors.push(
            formatRowError(
              rowNumber,
              "This row would duplicate another existing Spotlight item with the same answer text, item type, and primary show."
            )
          )
          continue
        }

        resolvedItemId = itemId
        action = "update"
      } else if (existingMatches.length > 1) {
        rowErrors.push(
          formatRowError(
            rowNumber,
            "More than one existing Spotlight item already matches this answer text, item type, and primary show. Clean those duplicates first."
          )
        )
        continue
      } else if (existingMatches.length === 1) {
        resolvedItemId = existingMatches[0].id
        action = "update"
      }

      if (csvNaturalKeys.has(naturalKey)) {
        rowErrors.push(
          formatRowError(
            rowNumber,
            "This CSV contains another row with the same answer text, item type, and primary show."
          )
        )
        continue
      }

      csvNaturalKeys.set(naturalKey, resolvedItemId ?? `new:${rowNumber}`)

      plannedOperations.push({
        rowNumber,
        resolvedItemId,
        action,
        answerText,
        itemType,
        personRoles,
        difficulty,
        primaryShowKey,
        notes,
        isActive,
        packNames,
        naturalKey,
      })
    }

    if (rowErrors.length) {
      return NextResponse.json(
        { error: "Spotlight CSV validation failed.", errors: rowErrors },
        { status: 400 }
      )
    }

    const missingPackNames = packNamesInFile.filter((packName) => !existingPackIdsByLowerName.has(lowerKey(packName)))

    if (validateOnly) {
      return NextResponse.json({
        ok: true,
        validateOnly: true,
        rowsChecked: rows.length,
        itemsCreate: plannedOperations.filter((operation) => operation.action === "create").length,
        itemsUpdate: plannedOperations.filter((operation) => operation.action === "update").length,
        packsCreate: missingPackNames.length,
      })
    }

    const createdPackIdsByLowerName = new Map<string, string>()

    for (const packName of missingPackNames) {
      const packInsertRes = await supabaseAdmin
        .from("heads_up_packs")
        .insert({
          name: packName,
          description: "",
          is_active: true,
        })
        .select("id, name")
        .single()

      if (packInsertRes.error) {
        return NextResponse.json({ error: packInsertRes.error.message }, { status: 500 })
      }

      createdPackIdsByLowerName.set(lowerKey(packName), String(packInsertRes.data.id))
    }

    let createdCount = 0
    let updatedCount = 0

    for (const operation of plannedOperations) {
      let itemId = operation.resolvedItemId

      if (operation.action === "create") {
        const insertRes = await supabaseAdmin
          .from("heads_up_items")
          .insert({
            answer_text: operation.answerText,
            item_type: operation.itemType,
            person_roles: operation.personRoles,
            difficulty: operation.difficulty,
            primary_show_key: operation.primaryShowKey,
            notes: operation.notes,
            is_active: operation.isActive,
          })
          .select("id")
          .single()

        if (insertRes.error) {
          return NextResponse.json(
            { error: `Row ${operation.rowNumber}: ${insertRes.error.message}` },
            { status: 500 }
          )
        }

        itemId = String(insertRes.data.id)
        createdCount += 1
      } else {
        const updateRes = await supabaseAdmin
          .from("heads_up_items")
          .update({
            answer_text: operation.answerText,
            item_type: operation.itemType,
            person_roles: operation.personRoles,
            difficulty: operation.difficulty,
            primary_show_key: operation.primaryShowKey,
            notes: operation.notes,
            is_active: operation.isActive,
            updated_at: new Date().toISOString(),
          })
          .eq("id", itemId!)
          .select("id")
          .single()

        if (updateRes.error) {
          return NextResponse.json(
            { error: `Row ${operation.rowNumber}: ${updateRes.error.message}` },
            { status: 500 }
          )
        }

        updatedCount += 1
      }

      const deleteLinksRes = await supabaseAdmin.from("heads_up_pack_items").delete().eq("item_id", itemId!)

      if (deleteLinksRes.error) {
        return NextResponse.json(
          { error: `Row ${operation.rowNumber}: ${deleteLinksRes.error.message}` },
          { status: 500 }
        )
      }

      const packIds = operation.packNames
        .map((packName) => existingPackIdsByLowerName.get(lowerKey(packName)) ?? createdPackIdsByLowerName.get(lowerKey(packName)) ?? null)
        .filter(Boolean) as string[]

      if (packIds.length) {
        const insertLinksRes = await supabaseAdmin
          .from("heads_up_pack_items")
          .insert(
            packIds.map((packId) => ({
              pack_id: packId,
              item_id: itemId!,
            }))
          )

        if (insertLinksRes.error) {
          return NextResponse.json(
            { error: `Row ${operation.rowNumber}: ${insertLinksRes.error.message}` },
            { status: 500 }
          )
        }
      }
    }

    return NextResponse.json({
      ok: true,
      validateOnly: false,
      rowsChecked: rows.length,
      itemsCreate: createdCount,
      itemsUpdate: updatedCount,
      packsCreate: missingPackNames.length,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Internal error." },
      { status: 500 }
    )
  }
}
