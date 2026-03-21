export const runtime = "nodejs"

import { NextResponse } from "next/server"

import { normaliseAudioClipType } from "@/lib/audioClipTypes"
import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import { parseCsvRows, parsePipeList, readCsvText, uniqueStrings } from "@/lib/csvImport"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type CsvRow = {
  pack_id?: string
  pack_name?: string
  pack_round_type?: string
  pack_sort_order?: string
  question_id?: string
  question_round_type?: string
  answer_type?: string
  question_text?: string
  option_a?: string
  option_b?: string
  option_c?: string
  option_d?: string
  answer_index?: string
  answer_text?: string
  accepted_answers?: string
  explanation?: string
  audio_path?: string
  image_path?: string
  media_duration_ms?: string
  audio_clip_type?: string
}

type NormalisedQuestionImport = {
  packs: Array<{
    id: string
    display_name: string
    round_type: "general" | "audio" | "picture"
    is_active: true
    updated_at: string
  }>
  questions: Array<{
    id: string
    round_type: "general" | "audio" | "picture"
    answer_type: "mcq" | "text"
    text: string
    options: string[] | null
    answer_index: number | null
    answer_text: string | null
    accepted_answers: string[] | null
    explanation: string | null
    audio_path: string | null
    image_path: string | null
    media_duration_ms: number | null
    audio_clip_type: string | null
    updated_at: string
  }>
  links: Array<{ pack_id: string; question_id: string }>
  warnings: string[]
}

const ROUND_TYPE_VALUES = ["general", "audio", "picture"] as const
const ANSWER_TYPE_VALUES = ["mcq", "text"] as const

function cleanRoundType(raw: unknown, fieldName: string, rowNumber: number) {
  const value = String(raw ?? "").trim().toLowerCase()
  if (ROUND_TYPE_VALUES.includes(value as (typeof ROUND_TYPE_VALUES)[number])) {
    return value as (typeof ROUND_TYPE_VALUES)[number]
  }
  throw new Error(`${fieldName} must be general, audio, or picture on row ${rowNumber}`)
}

function cleanAnswerType(raw: unknown, rowNumber: number) {
  const value = String(raw ?? "").trim().toLowerCase()
  if (ANSWER_TYPE_VALUES.includes(value as (typeof ANSWER_TYPE_VALUES)[number])) {
    return value as (typeof ANSWER_TYPE_VALUES)[number]
  }
  throw new Error(`answer_type must be mcq or text on row ${rowNumber}`)
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

function cleanMediaDurationMs(raw: unknown, rowNumber: number) {
  const value = String(raw ?? "").trim()
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`media_duration_ms must be a whole number of milliseconds on row ${rowNumber}`)
  }
  return parsed
}

function parseAcceptedAnswers(raw: unknown, rowNumber: number, warnings: string[]) {
  const value = String(raw ?? "").trim()
  if (!value) return null

  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value)
      if (!Array.isArray(parsed)) {
        throw new Error("accepted_answers JSON must be an array")
      }
      const normalised = [...new Set(parsed.map((item) => String(item ?? "").trim()).filter(Boolean))]
      if (!normalised.length) return null
      warnings.push(
        `Row ${rowNumber}: accepted_answers JSON array is still accepted, but pipe-separated values are now the documented format.`
      )
      return normalised
    } catch (error) {
      throw new Error(
        `accepted_answers must be a pipe-separated list or a valid JSON array on row ${rowNumber}: ${error instanceof Error ? error.message : "Invalid JSON"}`
      )
    }
  }

  const values = [...new Set(parsePipeList(value))]
  return values.length ? values : null
}

function compareNormalised(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function prepareQuestionImport(rows: CsvRow[]): NormalisedQuestionImport {
  if (!rows.length) throw new Error("CSV has no rows")

  const nowIso = new Date().toISOString()
  const warnings: string[] = []
  const packsById = new Map<string, NormalisedQuestionImport["packs"][number]>()
  const questionsById = new Map<string, NormalisedQuestionImport["questions"][number]>()
  const linkKeys = new Set<string>()
  const links: NormalisedQuestionImport["links"] = []
  let sawLegacyPackSortOrder = false

  rows.forEach((row, index) => {
    const rowNumber = index + 2

    const packId = requiredString(row.pack_id, "pack_id", rowNumber)
    const packName = requiredString(row.pack_name, "pack_name", rowNumber)
    const packRoundType = cleanRoundType(row.pack_round_type, "pack_round_type", rowNumber)
    const questionId = requiredString(row.question_id, "question_id", rowNumber)
    const questionRoundType = cleanRoundType(row.question_round_type, "question_round_type", rowNumber)
    const answerType = cleanAnswerType(row.answer_type, rowNumber)
    const text = requiredString(row.question_text, "question_text", rowNumber)

    if (String(row.pack_sort_order ?? "").trim()) {
      sawLegacyPackSortOrder = true
    }

    let options: string[] | null = null
    let answerIndex: number | null = null
    let answerText: string | null = null
    let acceptedAnswers: string[] | null = null

    if (answerType === "mcq") {
      options = [
        requiredString(row.option_a, "option_a", rowNumber),
        requiredString(row.option_b, "option_b", rowNumber),
        requiredString(row.option_c, "option_c", rowNumber),
        requiredString(row.option_d, "option_d", rowNumber),
      ]

      const parsedIndex = Number(String(row.answer_index ?? "").trim())
      if (![0, 1, 2, 3].includes(parsedIndex)) {
        throw new Error(`answer_index must be 0, 1, 2, or 3 on row ${rowNumber}`)
      }
      answerIndex = parsedIndex
    } else {
      answerText = requiredString(row.answer_text, "answer_text", rowNumber)
      acceptedAnswers = parseAcceptedAnswers(row.accepted_answers, rowNumber, warnings)
    }

    const audioClipType = cleanOptionalString(row.audio_clip_type)
    const normalisedAudioClipType = audioClipType == null ? null : normaliseAudioClipType(audioClipType)
    if (audioClipType != null && normalisedAudioClipType == null) {
      throw new Error(`audio_clip_type is invalid on row ${rowNumber}`)
    }

    const packRecord: NormalisedQuestionImport["packs"][number] = {
      id: packId,
      display_name: packName,
      round_type: packRoundType,
      is_active: true,
      updated_at: nowIso,
    }

    const existingPack = packsById.get(packId)
    if (existingPack && !compareNormalised(existingPack, packRecord)) {
      throw new Error(`Pack ${packId} has conflicting values across CSV rows. Check row ${rowNumber}.`)
    }
    packsById.set(packId, packRecord)

    const questionRecord: NormalisedQuestionImport["questions"][number] = {
      id: questionId,
      round_type: questionRoundType,
      answer_type: answerType,
      text,
      options,
      answer_index: answerIndex,
      answer_text: answerText,
      accepted_answers: acceptedAnswers,
      explanation: cleanOptionalString(row.explanation),
      audio_path: cleanOptionalString(row.audio_path),
      image_path: cleanOptionalString(row.image_path),
      media_duration_ms: cleanMediaDurationMs(row.media_duration_ms, rowNumber),
      audio_clip_type: normalisedAudioClipType,
      updated_at: nowIso,
    }

    const existingQuestion = questionsById.get(questionId)
    if (existingQuestion && !compareNormalised(existingQuestion, questionRecord)) {
      throw new Error(`Question ${questionId} has conflicting values across CSV rows. Check row ${rowNumber}.`)
    }
    questionsById.set(questionId, questionRecord)

    const linkKey = `${packId}::${questionId}`
    if (!linkKeys.has(linkKey)) {
      linkKeys.add(linkKey)
      links.push({ pack_id: packId, question_id: questionId })
    }
  })

  if (sawLegacyPackSortOrder) {
    warnings.push("Legacy pack_sort_order values were supplied. They are ignored by the current importer and are no longer part of the official CSV format.")
  }

  return {
    packs: [...packsById.values()],
    questions: [...questionsById.values()],
    links,
    warnings,
  }
}

async function getExistingIdSets(packIds: string[], questionIds: string[]) {
  let existingPackIds = new Set<string>()
  let existingQuestionIds = new Set<string>()

  if (packIds.length) {
    const packsRes = await supabaseAdmin.from("packs").select("id").in("id", packIds)
    if (packsRes.error) throw new Error(packsRes.error.message)
    existingPackIds = new Set((packsRes.data ?? []).map((item) => item.id))
  }

  if (questionIds.length) {
    const questionsRes = await supabaseAdmin.from("questions").select("id").in("id", questionIds)
    if (questionsRes.error) throw new Error(questionsRes.error.message)
    existingQuestionIds = new Set((questionsRes.data ?? []).map((item) => item.id))
  }

  return {
    existingPackIds,
    existingQuestionIds,
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      "Admin question import route is live. POST raw CSV or multipart form-data field 'file'. Add ?validateOnly=true to preview the import without writing.",
  })
}

export async function POST(req: Request) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  try {
    const validateOnly = new URL(req.url).searchParams.get("validateOnly") === "true"
    const csvText = await readCsvText(req)
    const rows = parseCsvRows<CsvRow>(csvText)
    const prepared = prepareQuestionImport(rows)
    const { existingPackIds, existingQuestionIds } = await getExistingIdSets(
      prepared.packs.map((pack) => pack.id),
      prepared.questions.map((question) => question.id)
    )

    const summary = {
      validateOnly,
      packsCreate: prepared.packs.filter((pack) => !existingPackIds.has(pack.id)).length,
      packsUpdate: prepared.packs.filter((pack) => existingPackIds.has(pack.id)).length,
      questionsCreate: prepared.questions.filter((question) => !existingQuestionIds.has(question.id)).length,
      questionsUpdate: prepared.questions.filter((question) => existingQuestionIds.has(question.id)).length,
      linksUpsert: prepared.links.length,
      warnings: prepared.warnings,
    }

    if (validateOnly) {
      return NextResponse.json({ ok: true, ...summary })
    }

    const packsRes = await supabaseAdmin.from("packs").upsert(prepared.packs, { onConflict: "id" })
    if (packsRes.error) {
      return NextResponse.json({ error: packsRes.error.message }, { status: 500 })
    }

    const questionsRes = await supabaseAdmin.from("questions").upsert(prepared.questions, { onConflict: "id" })
    if (questionsRes.error) {
      return NextResponse.json({ error: questionsRes.error.message }, { status: 500 })
    }

    const linksRes = await supabaseAdmin.from("pack_questions").upsert(prepared.links, { onConflict: "pack_id,question_id" })
    if (linksRes.error) {
      return NextResponse.json({ error: linksRes.error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      ...summary,
      packsUpserted: prepared.packs.length,
      questionsUpserted: prepared.questions.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 400 }
    )
  }
}
