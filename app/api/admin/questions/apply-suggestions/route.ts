export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { z } from "zod"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import {
  analyseQuestionMetadata,
  type PackRowForMetadata,
  type QuestionRowForMetadata,
  type ShowRow,
} from "@/lib/questionMetadata"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

const applySuggestionsSchema = z.object({
  questionIds: z.array(z.string().trim().min(1)).min(1),
})

type QuestionRow = QuestionRowForMetadata & {
  created_at: string
  updated_at: string
}

type PackQuestionRow = {
  question_id: string
  pack_id: string
}

type PackRow = PackRowForMetadata

export async function POST(req: Request) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  let body: unknown

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 })
  }

  const parsed = applySuggestionsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload." }, { status: 400 })
  }

  const questionIds = [...new Set(parsed.data.questionIds)]

  const [questionsRes, showsRes, packLinksRes] = await Promise.all([
    supabaseAdmin
      .from("questions")
      .select(
        "id, text, round_type, answer_type, answer_text, explanation, audio_path, image_path, accepted_answers, media_type, prompt_target, clue_source, primary_show_key, metadata_review_state, media_duration_ms, created_at, updated_at"
      )
      .in("id", questionIds),
    supabaseAdmin
      .from("shows")
      .select("show_key, display_name, alt_names, is_active")
      .eq("is_active", true)
      .order("display_name"),
    supabaseAdmin
      .from("pack_questions")
      .select("question_id, pack_id")
      .in("question_id", questionIds),
  ])

  if (questionsRes.error) {
    return NextResponse.json({ error: questionsRes.error.message }, { status: 500 })
  }

  if (showsRes.error) {
    return NextResponse.json({ error: showsRes.error.message }, { status: 500 })
  }

  if (packLinksRes.error) {
    return NextResponse.json({ error: packLinksRes.error.message }, { status: 500 })
  }

  const questions = (questionsRes.data ?? []) as QuestionRow[]
  const shows = (showsRes.data ?? []) as ShowRow[]
  const packLinks = (packLinksRes.data ?? []) as PackQuestionRow[]
  const packIds = [...new Set(packLinks.map((row) => row.pack_id))]

  const packsRes = packIds.length
    ? await supabaseAdmin.from("packs").select("id, display_name, round_type").in("id", packIds)
    : { data: [] as PackRow[], error: null }

  if (packsRes.error) {
    return NextResponse.json({ error: packsRes.error.message }, { status: 500 })
  }

  const packsById = new Map<string, PackRow>()
  for (const pack of ((packsRes.data ?? []) as PackRow[])) {
    packsById.set(pack.id, pack)
  }

  const packRowsByQuestionId = new Map<string, PackRow[]>()
  for (const link of packLinks) {
    const pack = packsById.get(link.pack_id)
    if (!pack) continue
    const current = packRowsByQuestionId.get(link.question_id) ?? []
    current.push(pack)
    packRowsByQuestionId.set(link.question_id, current)
  }

  const nowIso = new Date().toISOString()
  let updatedCount = 0
  let skippedCount = 0

  for (const question of questions) {
    const packs = packRowsByQuestionId.get(question.id) ?? []
    const analysis = analyseQuestionMetadata(question, shows, packs)

    const update: Record<string, unknown> = {
      metadata_review_state: "suggested",
      metadata_updated_at: nowIso,
    }

    let hasMeaningfulChange = false

    if (analysis.suggested.mediaType !== null) {
      update.media_type = analysis.suggested.mediaType
      hasMeaningfulChange = true
    }

    if (analysis.suggested.promptTarget !== null) {
      update.prompt_target = analysis.suggested.promptTarget
      hasMeaningfulChange = true
    }

    if (analysis.suggested.clueSource !== null) {
      update.clue_source = analysis.suggested.clueSource
      hasMeaningfulChange = true
    }

    if (analysis.suggested.primaryShowKey !== null) {
      update.primary_show_key = analysis.suggested.primaryShowKey
      hasMeaningfulChange = true
    }

    if (!hasMeaningfulChange) {
      skippedCount += 1
      continue
    }

    const updateRes = await supabaseAdmin
      .from("questions")
      .update(update)
      .eq("id", question.id)

    if (updateRes.error) {
      return NextResponse.json(
        { error: `Could not update question ${question.id}: ${updateRes.error.message}` },
        { status: 500 }
      )
    }

    updatedCount += 1
  }

  return NextResponse.json({
    ok: true,
    updatedCount,
    skippedCount,
  })
}