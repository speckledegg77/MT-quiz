export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { parse } from "csv-parse/sync"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type CsvRow = {
  pack_id: string
  pack_name: string
  pack_round_type: string
  pack_sort_order: string
  question_id: string
  question_round_type: string
  answer_type?: string
  question_text: string
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

function dedupeBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []

  for (const item of items) {
    const key = keyFn(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }

  return out
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

function parseAcceptedAnswers(raw: string | undefined) {
  const value = String(raw ?? "").trim()
  if (!value) return null

  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        const parts = parsed.map((item) => String(item).trim()).filter(Boolean)
        return parts.length ? parts : null
      }
    } catch {
      // fall back to pipe-separated parsing
    }
  }

  const parts = value.split("|").map((item) => item.trim()).filter(Boolean)
  return parts.length ? parts : null
}

export async function GET(req: Request) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  return NextResponse.json({
    ok: true,
    message:
      "POST raw CSV (Content-Type: text/csv) or multipart form-data field 'file'. Header: x-admin-token. Optional header x-validate-only: true.",
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
        { error: "Could not parse CSV", detail: String(error?.message ?? "") },
        { status: 400 }
      )
    }

    if (!rows.length) {
      return NextResponse.json({ error: "CSV has no rows" }, { status: 400 })
    }

    const packUpserts: any[] = []
    const questionUpserts: any[] = []
    const links: Array<{ pack_id: string; question_id: string }> = []

    for (const row of rows) {
      const packId = String(row.pack_id ?? "").trim()
      const packName = String(row.pack_name ?? "").trim()
      const packRoundType = String(row.pack_round_type ?? "").trim()
      const packSortOrder = Number(row.pack_sort_order ?? 0)

      const questionId = String(row.question_id ?? "").trim()
      const questionRoundType = String(row.question_round_type ?? "").trim()

      const answerTypeRaw = String(row.answer_type ?? "").trim().toLowerCase()
      const answerType = answerTypeRaw === "text" || answerTypeRaw === "typed" ? "text" : "mcq"

      const text = String(row.question_text ?? "").trim()
      const explanation = String(row.explanation ?? "").trim() || null

      const audioPathRaw = String(row.audio_path ?? "").trim()
      const audioPath = audioPathRaw ? audioPathRaw : null

      const imagePathRaw = String(row.image_path ?? "").trim()
      const imagePath = imagePathRaw ? imagePathRaw : null

      const mediaDurationRaw = String(row.media_duration_ms ?? "").trim()
      const parsedMediaDuration = mediaDurationRaw ? Number(mediaDurationRaw) : null
      const mediaDurationMs =
        parsedMediaDuration !== null && Number.isFinite(parsedMediaDuration)
          ? Math.floor(parsedMediaDuration)
          : null

      const audioClipTypeRaw = String(row.audio_clip_type ?? "").trim().toLowerCase()
      const audioClipType = audioClipTypeRaw || null

      if (!packId || !packName) {
        return NextResponse.json({ error: "Each row must include pack_id and pack_name" }, { status: 400 })
      }

      if (!["general", "audio", "picture", "mixed"].includes(packRoundType)) {
        return NextResponse.json({ error: `Invalid pack_round_type for pack ${packId}` }, { status: 400 })
      }

      if (!questionId || !text) {
        return NextResponse.json({ error: `Missing question_id or question_text in pack ${packId}` }, { status: 400 })
      }

      if (!["general", "audio", "picture", "mixed"].includes(questionRoundType)) {
        return NextResponse.json({ error: `Invalid question_round_type for question ${questionId}` }, { status: 400 })
      }

      if (questionRoundType === "audio" && !audioPath) {
        return NextResponse.json({ error: `Audio question ${questionId} needs audio_path` }, { status: 400 })
      }

      if (questionRoundType === "picture" && !imagePath) {
        return NextResponse.json({ error: `Picture question ${questionId} needs image_path` }, { status: 400 })
      }

      if (
        mediaDurationRaw &&
        (parsedMediaDuration === null ||
          !Number.isFinite(parsedMediaDuration) ||
          mediaDurationMs === null ||
          mediaDurationMs < 0)
      ) {
        return NextResponse.json({ error: `Invalid media_duration_ms for question ${questionId}` }, { status: 400 })
      }

      if (
        audioClipType &&
        ![
          "song_intro",
          "song_clip",
          "instrumental_section",
          "vocal_section",
          "dialogue_quote",
          "character_voice",
          "sound_effect",
          "other",
        ].includes(audioClipType)
      ) {
        return NextResponse.json({ error: `Invalid audio_clip_type for question ${questionId}` }, { status: 400 })
      }

      let options: string[] | null = null
      let answerIndex: number | null = null
      let answerText: string | null = null
      let acceptedAnswers: string[] | null = null

      if (answerType === "mcq") {
        const optionA = String(row.option_a ?? "").trim()
        const optionB = String(row.option_b ?? "").trim()
        const optionC = String(row.option_c ?? "").trim()
        const optionD = String(row.option_d ?? "").trim()

        const idx = Number(String(row.answer_index ?? "").trim())
        if (![0, 1, 2, 3].includes(idx)) {
          return NextResponse.json({ error: `Invalid answer_index for question ${questionId}` }, { status: 400 })
        }

        options = [optionA, optionB, optionC, optionD]
        if (options.some((option) => !option)) {
          return NextResponse.json({ error: `All four options must be set for question ${questionId}` }, { status: 400 })
        }

        answerIndex = idx
      } else {
        const typedAnswerText = String(row.answer_text ?? "").trim()
        if (!typedAnswerText) {
          return NextResponse.json({ error: `Missing answer_text for typed question ${questionId}` }, { status: 400 })
        }

        answerText = typedAnswerText
        acceptedAnswers = parseAcceptedAnswers(row.accepted_answers)
      }

      packUpserts.push({
        id: packId,
        display_name: packName,
        round_type: packRoundType,
        sort_order: Number.isFinite(packSortOrder) ? packSortOrder : 0,
        is_active: true,
        updated_at: new Date().toISOString(),
      })

      questionUpserts.push({
        id: questionId,
        round_type: questionRoundType,
        answer_type: answerType,
        text,
        options,
        answer_index: answerIndex,
        answer_text: answerText,
        accepted_answers: acceptedAnswers,
        explanation,
        audio_path: audioPath,
        image_path: imagePath,
        media_duration_ms: mediaDurationMs,
        audio_clip_type: audioClipType,
        updated_at: new Date().toISOString(),
      })

      links.push({ pack_id: packId, question_id: questionId })
    }

    const uniquePacks = dedupeBy(packUpserts, (item) => item.id)
    const uniqueQuestions = dedupeBy(questionUpserts, (item) => item.id)
    const uniqueLinks = dedupeBy(links, (item) => `${item.pack_id}::${item.question_id}`)

    if (validateOnly) {
      return NextResponse.json({
        ok: true,
        validateOnly: true,
        packsUpserted: uniquePacks.length,
        questionsUpserted: uniqueQuestions.length,
        linksUpserted: uniqueLinks.length,
      })
    }

    const packsRes = await supabaseAdmin.from("packs").upsert(uniquePacks, { onConflict: "id" })
    if (packsRes.error) return NextResponse.json({ error: packsRes.error.message }, { status: 500 })

    const questionsRes = await supabaseAdmin
      .from("questions")
      .upsert(uniqueQuestions, { onConflict: "id" })
    if (questionsRes.error) return NextResponse.json({ error: questionsRes.error.message }, { status: 500 })

    const linksRes = await supabaseAdmin
      .from("pack_questions")
      .upsert(uniqueLinks, { onConflict: "pack_id,question_id" })
    if (linksRes.error) return NextResponse.json({ error: linksRes.error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      validateOnly: false,
      packsUpserted: uniquePacks.length,
      questionsUpserted: uniqueQuestions.length,
      linksUpserted: uniqueLinks.length,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Internal error" }, { status: 500 })
  }
}
