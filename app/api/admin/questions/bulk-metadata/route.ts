export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { z } from "zod"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import {
  CLUE_SOURCE_VALUES,
  MEDIA_TYPE_VALUES,
  METADATA_REVIEW_STATE_VALUES,
  PROMPT_TARGET_VALUES,
} from "@/lib/questionMetadata"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

const bulkMetadataSchema = z.object({
  questionIds: z.array(z.string().trim().min(1)).min(1),
  changes: z
    .object({
      mediaType: z.enum(MEDIA_TYPE_VALUES).nullable().optional(),
      promptTarget: z.enum(PROMPT_TARGET_VALUES).nullable().optional(),
      clueSource: z.enum(CLUE_SOURCE_VALUES).nullable().optional(),
      primaryShowKey: z.string().trim().nullable().optional(),
      metadataReviewState: z.enum(METADATA_REVIEW_STATE_VALUES).optional(),
    })
    .refine(
      (value) =>
        value.mediaType !== undefined ||
        value.promptTarget !== undefined ||
        value.clueSource !== undefined ||
        value.primaryShowKey !== undefined ||
        value.metadataReviewState !== undefined,
      { message: "At least one metadata change must be provided." }
    ),
})

function normaliseShowKey(value: string | null | undefined) {
  const cleaned = String(value ?? "").trim()
  return cleaned || null
}

export async function POST(req: Request) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  let body: unknown

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 })
  }

  const parsed = bulkMetadataSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid bulk metadata payload." }, { status: 400 })
  }

  const { questionIds, changes } = parsed.data

  const update: Record<string, unknown> = {
    metadata_updated_at: new Date().toISOString(),
  }

  if (changes.mediaType !== undefined) update.media_type = changes.mediaType
  if (changes.promptTarget !== undefined) update.prompt_target = changes.promptTarget
  if (changes.clueSource !== undefined) update.clue_source = changes.clueSource
  if (changes.primaryShowKey !== undefined) update.primary_show_key = normaliseShowKey(changes.primaryShowKey)
  if (changes.metadataReviewState !== undefined) update.metadata_review_state = changes.metadataReviewState

  const updateRes = await supabaseAdmin
    .from("questions")
    .update(update)
    .in("id", questionIds)
    .select("id")

  if (updateRes.error) {
    return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    updatedCount: updateRes.data?.length ?? 0,
    questionIds: updateRes.data?.map((row) => row.id) ?? [],
  })
}