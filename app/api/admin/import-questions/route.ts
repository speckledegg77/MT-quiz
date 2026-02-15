export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { parse } from "csv-parse/sync"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"

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
}

function unauthorised() {
  return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
}

function dedupeBy<T>(items: T[], keyFn: (t: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const it of items) {
    const key = keyFn(it)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      "Admin import route is live. Use POST with either (a) raw CSV body Content-Type: text/csv or (b) multipart form-data field 'file'. Header: x-admin-token.",
  })
}

async function readCsvText(req: Request): Promise<string> {
  const contentType = String(req.headers.get("content-type") ?? "").toLowerCase()

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData()
    const file = form.get("file")
    if (!file || typeof (file as any).text !== "function") throw new Error("Missing file field in form data")
    return await (file as any).text()
  }

  const text = await req.text()
  if (!text || !text.trim()) throw new Error("Empty request body")
  return text
}

function parseAcceptedAnswers(raw: string) {
  const s = String(raw ?? "").trim()
  if (!s) return null
  const parts = s.split("|").map(x => x.trim()).filter(Boolean)
  return parts.length ? parts : null
}

export async function POST(req: Request) {
  try {
    const token = req.headers.get("x-admin-token")
    if (!token || token !== process.env.ADMIN_TOKEN) return unauthorised()

    const csvText = await readCsvText(req)

    let rows: CsvRow[] = []
    try {
      rows = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_quotes: true,
      }) as CsvRow[]
    } catch {
      return NextResponse.json({ error: "Could not parse CSV" }, { status: 400 })
    }

    if (!rows.length) return NextResponse.json({ error: "CSV has no rows" }, { status: 400 })

    const packUpserts: any[] = []
    const questionUpserts: any[] = []
    const links: any[] = []

    for (const r of rows) {
      const packId = String(r.pack_id ?? "").trim()
      const packName = String(r.pack_name ?? "").trim()
      const packRoundType = String(r.pack_round_type ?? "").trim()
      const packSortOrder = Number(r.pack_sort_order ?? 0)

      const questionId = String(r.question_id ?? "").trim()
      const questionRoundType = String(r.question_round_type ?? "").trim()

      const answerTypeRaw = String((r as any).answer_type ?? "").trim().toLowerCase()
      const answerType = answerTypeRaw === "text" || answerTypeRaw === "typed" ? "text" : "mcq"

      const text = String(r.question_text ?? "").trim()

      const explanation = String((r as any).explanation ?? "").trim()

      const audioPathRaw = String((r as any).audio_path ?? "").trim()
      const audioPath = audioPathRaw.length ? audioPathRaw : null

      const imagePathRaw = String((r as any).image_path ?? "").trim()
      const imagePath = imagePathRaw.length ? imagePathRaw : null

      if (!packId || !packName) {
        return NextResponse.json({ error: "Each row must include pack_id and pack_name" }, { status: 400 })
      }

      if (packRoundType !== "general" && packRoundType !== "audio" && packRoundType !== "picture") {
        return NextResponse.json({ error: `Invalid pack_round_type for pack ${packId}` }, { status: 400 })
      }

      if (!questionId || !text) {
        return NextResponse.json({ error: `Missing question_id or question_text in pack ${packId}` }, { status: 400 })
      }

      if (questionRoundType !== "general" && questionRoundType !== "audio" && questionRoundType !== "picture") {
        return NextResponse.json({ error: `Invalid question_round_type for question ${questionId}` }, { status: 400 })
      }

      let options: string[] | null = null
      let answerIndex: number | null = null
      let answerText: string | null = null
      let acceptedAnswers: string[] | null = null

      if (answerType === "mcq") {
        const optionA = String((r as any).option_a ?? "").trim()
        const optionB = String((r as any).option_b ?? "").trim()
        const optionC = String((r as any).option_c ?? "").trim()
        const optionD = String((r as any).option_d ?? "").trim()

        const idxRaw = String((r as any).answer_index ?? "").trim()
        const idx = Number(idxRaw)

        if (![0, 1, 2, 3].includes(idx)) {
          return NextResponse.json({ error: `Invalid answer_index for question ${questionId}` }, { status: 400 })
        }

        options = [optionA, optionB, optionC, optionD]
        if (options.some(o => !o)) {
          return NextResponse.json({ error: `All four options must be set for question ${questionId}` }, { status: 400 })
        }

        answerIndex = idx
      } else {
        const at = String((r as any).answer_text ?? "").trim()
        if (!at) {
          return NextResponse.json({ error: `Missing answer_text for typed question ${questionId}` }, { status: 400 })
        }
        answerText = at
        acceptedAnswers = parseAcceptedAnswers(String((r as any).accepted_answers ?? ""))
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
        explanation: explanation || null,
        audio_path: audioPath,
        image_path: imagePath,
        updated_at: new Date().toISOString(),
      })

      links.push({ pack_id: packId, question_id: questionId })
    }

    const uniquePacks = dedupeBy(packUpserts, (x: any) => x.id)
    const uniqueQuestions = dedupeBy(questionUpserts, (x: any) => x.id)
    const uniqueLinks = dedupeBy(links, (x: any) => `${x.pack_id}::${x.question_id}`)

    const packsRes = await supabaseAdmin.from("packs").upsert(uniquePacks, { onConflict: "id" })
    if (packsRes.error) return NextResponse.json({ error: packsRes.error.message }, { status: 500 })

    const qRes = await supabaseAdmin.from("questions").upsert(uniqueQuestions, { onConflict: "id" })
    if (qRes.error) return NextResponse.json({ error: qRes.error.message }, { status: 500 })

    const linkRes = await supabaseAdmin.from("pack_questions").upsert(uniqueLinks, { onConflict: "pack_id,question_id" })
    if (linkRes.error) return NextResponse.json({ error: linkRes.error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      packsUpserted: uniquePacks.length,
      questionsUpserted: uniqueQuestions.length,
      linksUpserted: uniqueLinks.length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 })
  }
}
