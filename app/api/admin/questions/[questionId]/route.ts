export const runtime = "nodejs"

import { NextResponse } from "next/server"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
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
}

type PackQuestionRow = {
  question_id: string
  pack_id: string
}

type PackRow = PackRowForMetadata

export async function GET(req: Request, context: RouteContext) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  const { questionId } = await context.params

  const [questionRes, showsRes, packLinksRes] = await Promise.all([
    supabaseAdmin
      .from("questions")
      .select(
        "id, text, round_type, answer_type, answer_text, explanation, audio_path, image_path, accepted_answers, media_type, prompt_target, clue_source, primary_show_key, metadata_review_state, media_duration_ms, audio_clip_type, created_at, updated_at"
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
  const analysis = analyseQuestionMetadata(question, shows, packs)

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
        suggested: analysis.suggested,
        reasons: analysis.reasons,
        warnings: analysis.warnings,
      },
    },
  })
}