export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { z } from "zod"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import { AUDIO_CLIP_TYPE_VALUES } from "@/lib/audioClipTypes"
import {
  CLUE_SOURCE_VALUES,
  MEDIA_TYPE_VALUES,
  METADATA_REVIEW_STATE_VALUES,
  PROMPT_TARGET_VALUES,
} from "@/lib/questionMetadata"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type RouteContext = {
  params: Promise<{
    questionId: string
  }>
}

const metadataSchema = z
  .object({
    mediaType: z.enum(MEDIA_TYPE_VALUES).nullable().optional(),
    promptTarget: z.enum(PROMPT_TARGET_VALUES).nullable().optional(),
    clueSource: z.enum(CLUE_SOURCE_VALUES).nullable().optional(),
    primaryShowKey: z.string().trim().nullable().optional(),
    metadataReviewState: z.enum(METADATA_REVIEW_STATE_VALUES).optional(),
    mediaDurationMs: z.number().int().min(0).nullable().optional(),
    audioClipType: z.enum(AUDIO_CLIP_TYPE_VALUES).nullable().optional(),
  })
  .refine(
    (value) =>
      value.mediaType !== undefined ||
      value.promptTarget !== undefined ||
      value.clueSource !== undefined ||
      value.primaryShowKey !== undefined ||
      value.metadataReviewState !== undefined ||
      value.mediaDurationMs !== undefined ||
      value.audioClipType !== undefined,
    { message: "At least one metadata field must be provided." }
  )

function normaliseShowKey(value: string | null | undefined) {
  const cleaned = String(value ?? "").trim()
  return cleaned || null
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

  const parsed = metadataSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid metadata payload." }, { status: 400 })
  }

  const update: Record<string, unknown> = {
    metadata_updated_at: new Date().toISOString(),
  }

  if (parsed.data.mediaType !== undefined) update.media_type = parsed.data.mediaType
  if (parsed.data.promptTarget !== undefined) update.prompt_target = parsed.data.promptTarget
  if (parsed.data.clueSource !== undefined) update.clue_source = parsed.data.clueSource
  if (parsed.data.primaryShowKey !== undefined) update.primary_show_key = normaliseShowKey(parsed.data.primaryShowKey)
  if (parsed.data.metadataReviewState !== undefined) update.metadata_review_state = parsed.data.metadataReviewState
  if (parsed.data.mediaDurationMs !== undefined) update.media_duration_ms = parsed.data.mediaDurationMs
  if (parsed.data.audioClipType !== undefined) update.audio_clip_type = parsed.data.audioClipType

  const updateRes = await supabaseAdmin
    .from("questions")
    .update(update)
    .eq("id", questionId)
    .select(
      "id, media_type, prompt_target, clue_source, primary_show_key, metadata_review_state, media_duration_ms, audio_clip_type, metadata_updated_at"
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