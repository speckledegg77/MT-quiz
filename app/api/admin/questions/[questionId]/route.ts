export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { z } from "zod"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import { analyseQuestionAnswerAudit } from "@/lib/questionAudit"
import {
  analyseQuestionMetadata,
  type PackRowForMetadata,
  type QuestionRowForMetadata,
  type ShowRow,
} from "@/lib/questionMetadata"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type RouteContext = {
  params: Promise<{
    questionId: string
  }>
}

type QuestionRow = QuestionRowForMetadata & {
  created_at: string
  updated_at: string
  options: unknown
  answer_index: number | null
}

type PackQuestionRow = {
  question_id: string
  pack_id: string
}

type PackRow = PackRowForMetadata

const questionPatchSchema = z
  .object({
    text: z.string().trim().min(1, "Question text is required.").optional(),
    explanation: z.string().optional(),
  })
  .refine((value) => value.text !== undefined || value.explanation !== undefined, {
    message: "At least one editable question field must be provided.",
  })

export async function GET(req: Request, context: RouteContext) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  const { questionId } = await context.params

  const [questionRes, showsRes, packLinksRes] = await Promise.all([
    supabaseAdmin
      .from("questions")
      .select(
        "id, text, round_type, answer_type, options, answer_index, answer_text, explanation, audio_path, image_path, accepted_answers, media_type, prompt_target, clue_source, primary_show_key, metadata_review_state, media_duration_ms, audio_clip_type, created_at, updated_at"
      )
      .eq("id", questionId)
      .maybeSingle(),
    supabaseAdmin
      .from("shows")
      .select("show_key, display_name, alt_names, is_active")
      .eq("is_active", true)
      .order("display_name"),
    supabaseAdmin.from("pack_questions").select("question_id, pack_id").eq("question_id", questionId),
  ])

  if (questionRes.error) {
    return NextResponse.json({ error: questionRes.error.message }, { status: 500 })
  }

  if (!questionRes.data) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 })
  }

  if (showsRes.error) {
    return NextResponse.json({ error: showsRes.error.message }, { status: 500 })
  }

  if (packLinksRes.error) {
    return NextResponse.json({ error: packLinksRes.error.message }, { status: 500 })
  }

  const packIds = ((packLinksRes.data ?? []) as PackQuestionRow[]).map((row) => row.pack_id)
  const packsRes = packIds.length
    ? await supabaseAdmin.from("packs").select("id, display_name, round_type").in("id", packIds)
    : { data: [] as PackRow[], error: null }

  if (packsRes.error) {
    return NextResponse.json({ error: packsRes.error.message }, { status: 500 })
  }

  const question = questionRes.data as QuestionRow
  const shows = (showsRes.data ?? []) as ShowRow[]
  const packs = ((packsRes.data ?? []) as PackRow[]).sort((a, b) => a.display_name.localeCompare(b.display_name))
  const metadataAnalysis = analyseQuestionMetadata(question, shows, packs)
  const audit = analyseQuestionAnswerAudit(question)

  return NextResponse.json({
    ok: true,
    item: {
      question,
      packs,
      metadata: {
        saved: {
          mediaType: question.media_type ?? null,
          promptTarget: question.prompt_target ?? null,
          clueSource: question.clue_source ?? null,
          primaryShowKey: question.primary_show_key ?? null,
          metadataReviewState: question.metadata_review_state ?? "unreviewed",
          mediaDurationMs: question.media_duration_ms ?? null,
          audioClipType: question.audio_clip_type ?? null,
        },
        suggested: metadataAnalysis.suggested,
        reasons: metadataAnalysis.reasons,
        warnings: metadataAnalysis.warnings,
      },
      audit,
    },
  })
}

export async function PATCH(req: Request, context: RouteContext) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  const { questionId } = await context.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 })
  }

  const parsed = questionPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid question payload." }, { status: 400 })
  }

  const update: Record<string, unknown> = {}

  if (parsed.data.text !== undefined) {
    update.text = parsed.data.text.trim()
  }

  if (parsed.data.explanation !== undefined) {
    const trimmedExplanation = parsed.data.explanation.trim()
    update.explanation = trimmedExplanation || null
  }

  const updateRes = await supabaseAdmin
    .from("questions")
    .update(update)
    .eq("id", questionId)
    .select(
      "id, text, round_type, answer_type, options, answer_index, answer_text, explanation, audio_path, image_path, accepted_answers, media_type, prompt_target, clue_source, primary_show_key, metadata_review_state, media_duration_ms, audio_clip_type, created_at, updated_at"
    )
    .maybeSingle()

  if (updateRes.error) {
    return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
  }

  if (!updateRes.data) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 })
  }

  return NextResponse.json({ ok: true, question: updateRes.data })
}
