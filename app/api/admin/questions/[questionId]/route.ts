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

type PackRow = PackRowForMetadata & {
  is_active?: boolean | null
}

const ARCHIVED_PACK_ID = "archived_questions"
const ARCHIVED_PACK_NAME = "Archived Questions"

async function loadQuestionDetailPayload(questionId: string) {
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
    return { error: questionRes.error.message, status: 500 as const }
  }

  if (!questionRes.data) {
    return { error: "Question not found.", status: 404 as const }
  }

  if (showsRes.error) {
    return { error: showsRes.error.message, status: 500 as const }
  }

  if (packLinksRes.error) {
    return { error: packLinksRes.error.message, status: 500 as const }
  }

  const packIds = ((packLinksRes.data ?? []) as PackQuestionRow[]).map((row) => row.pack_id)
  const packsRes = packIds.length
    ? await supabaseAdmin
        .from("packs")
        .select("id, display_name, round_type, is_active")
        .in("id", packIds)
    : { data: [] as PackRow[], error: null }

  if (packsRes.error) {
    return { error: packsRes.error.message, status: 500 as const }
  }

  const question = questionRes.data as QuestionRow
  const shows = (showsRes.data ?? []) as ShowRow[]
  const packs = ((packsRes.data ?? []) as PackRow[]).sort((a, b) => a.display_name.localeCompare(b.display_name))
  const analysis = analyseQuestionMetadata(question, shows, packs)

  return {
    ok: true as const,
    payload: {
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
    },
  }
}

async function ensureArchivedPack() {
  const existingRes = await supabaseAdmin
    .from("packs")
    .select("id, display_name, round_type, is_active")
    .eq("id", ARCHIVED_PACK_ID)
    .maybeSingle()

  if (existingRes.error) {
    return { error: existingRes.error.message, status: 500 as const }
  }

  if (existingRes.data) {
    return { ok: true as const, packId: ARCHIVED_PACK_ID }
  }

  const insertRes = await supabaseAdmin
    .from("packs")
    .insert({
      id: ARCHIVED_PACK_ID,
      display_name: ARCHIVED_PACK_NAME,
      round_type: "mixed",
      sort_order: 9999,
      is_active: false,
    })
    .select("id")
    .single()

  if (insertRes.error) {
    return { error: insertRes.error.message, status: 500 as const }
  }

  return { ok: true as const, packId: insertRes.data.id as string }
}

async function archiveQuestionIntoPack(questionId: string) {
  const archivedPack = await ensureArchivedPack()
  if (!("ok" in archivedPack)) return archivedPack

  const removeLinksRes = await supabaseAdmin.from("pack_questions").delete().eq("question_id", questionId)

  if (removeLinksRes.error) {
    return { error: removeLinksRes.error.message, status: 500 as const }
  }

  const addArchivedLinkRes = await supabaseAdmin
    .from("pack_questions")
    .insert({
      pack_id: archivedPack.packId,
      question_id: questionId,
    })

  if (addArchivedLinkRes.error) {
    return { error: addArchivedLinkRes.error.message, status: 500 as const }
  }

  return { ok: true as const }
}

async function tableHasQuestionUsage(tableName: string, questionId: string) {
  const res = await supabaseAdmin
    .from(tableName)
    .select("question_id", { count: "exact", head: true })
    .eq("question_id", questionId)

  if (res.error) {
    return { ok: false as const, error: res.error.message }
  }

  return { ok: true as const, used: (res.count ?? 0) > 0 }
}

export async function GET(req: Request, context: RouteContext) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  const { questionId } = await context.params
  const result = await loadQuestionDetailPayload(questionId)

  if (!("ok" in result)) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result.payload)
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

  const nextText = String((body as { text?: unknown } | null)?.text ?? "")
  if (!nextText.trim()) {
    return NextResponse.json({ error: "Question text cannot be blank." }, { status: 400 })
  }

  const updateRes = await supabaseAdmin
    .from("questions")
    .update({ text: nextText })
    .eq("id", questionId)
    .select("id, text")
    .maybeSingle()

  if (updateRes.error) {
    return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
  }

  if (!updateRes.data) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 })
  }

  return NextResponse.json({ ok: true, question: updateRes.data })
}

export async function POST(req: Request, context: RouteContext) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  const { questionId } = await context.params
  const body = (await req.json().catch(() => null)) as { action?: string } | null
  const action = String(body?.action ?? "").trim().toLowerCase()

  if (action !== "archive") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 })
  }

  const questionRes = await supabaseAdmin
    .from("questions")
    .select("id")
    .eq("id", questionId)
    .maybeSingle()

  if (questionRes.error) {
    return NextResponse.json({ error: questionRes.error.message }, { status: 500 })
  }

  if (!questionRes.data) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 })
  }

  const archived = await archiveQuestionIntoPack(questionId)

  if (!("ok" in archived)) {
    return NextResponse.json({ error: archived.error }, { status: archived.status })
  }

  return NextResponse.json({
    ok: true,
    message: "Archived. The question has been moved into Archived Questions.",
  })
}

export async function DELETE(req: Request, context: RouteContext) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  const { questionId } = await context.params

  const questionRes = await supabaseAdmin
    .from("questions")
    .select("id")
    .eq("id", questionId)
    .maybeSingle()

  if (questionRes.error) {
    return NextResponse.json({ error: questionRes.error.message }, { status: 500 })
  }

  if (!questionRes.data) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 })
  }

  const usageChecks = await Promise.all([
    tableHasQuestionUsage("answers", questionId),
    tableHasQuestionUsage("round_results", questionId),
    tableHasQuestionUsage("question_finalisations", questionId),
  ])

  for (const check of usageChecks) {
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 500 })
    }
    if (check.used) {
      return NextResponse.json(
        {
          error:
            "This question has already been used in game data, so it cannot be deleted. Archive it instead.",
        },
        { status: 409 }
      )
    }
  }

  const currentRoomRes = await supabaseAdmin
    .from("rooms")
    .select("id", { count: "exact", head: true })
    .eq("current_question_id", questionId)

  if (currentRoomRes.error) {
    return NextResponse.json({ error: currentRoomRes.error.message }, { status: 500 })
  }

  if ((currentRoomRes.count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: "This question is currently referenced by a live room, so it cannot be deleted right now.",
      },
      { status: 409 }
    )
  }

  const historyDeleteRes = await supabaseAdmin
    .from("question_selection_history")
    .delete()
    .eq("question_id", questionId)

  if (historyDeleteRes.error && !historyDeleteRes.error.message.toLowerCase().includes("does not exist")) {
    return NextResponse.json({ error: historyDeleteRes.error.message }, { status: 500 })
  }

  const packLinkDeleteRes = await supabaseAdmin.from("pack_questions").delete().eq("question_id", questionId)

  if (packLinkDeleteRes.error) {
    return NextResponse.json({ error: packLinkDeleteRes.error.message }, { status: 500 })
  }

  const deleteRes = await supabaseAdmin.from("questions").delete().eq("id", questionId)

  if (deleteRes.error) {
    return NextResponse.json({ error: deleteRes.error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    message: "Deleted.",
  })
}
