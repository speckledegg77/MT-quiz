export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { z } from "zod"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import {
  cleanBehaviourType,
  cleanSourceMode,
  normaliseSelectionRules,
  ROUND_TEMPLATE_BEHAVIOUR_TYPE_VALUES,
  ROUND_TEMPLATE_SOURCE_MODE_VALUES,
} from "@/lib/roundTemplates"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type RouteContext = {
  params: Promise<{
    templateId: string
  }>
}

function cleanPackIds(values: string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
}

const selectionRulesSchema = z
  .object({
    mediaTypes: z.array(z.enum(["text", "audio", "image"])).optional(),
    promptTargets: z.array(z.string()).optional(),
    clueSources: z.array(z.string()).optional(),
    primaryShowKeys: z.array(z.string()).optional(),
  })
  .optional()

const updateRoundTemplateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    behaviourType: z.enum(ROUND_TEMPLATE_BEHAVIOUR_TYPE_VALUES).optional(),
    defaultQuestionCount: z.coerce.number().int().min(1).optional(),
    jokerEligible: z.boolean().optional(),
    countsTowardsScore: z.boolean().optional(),
    sourceMode: z.enum(ROUND_TEMPLATE_SOURCE_MODE_VALUES).optional(),
    defaultPackIds: z.array(z.string()).optional(),
    selectionRules: selectionRulesSchema,
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.behaviourType !== undefined ||
      value.defaultQuestionCount !== undefined ||
      value.jokerEligible !== undefined ||
      value.countsTowardsScore !== undefined ||
      value.sourceMode !== undefined ||
      value.defaultPackIds !== undefined ||
      value.selectionRules !== undefined ||
      value.isActive !== undefined ||
      value.sortOrder !== undefined,
    { message: "At least one field must be provided." }
  )

export async function PATCH(req: Request, context: RouteContext) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  const { templateId } = await context.params

  let body: unknown

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 })
  }

  const parsed = updateRoundTemplateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 }
    )
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (parsed.data.name !== undefined) update.name = parsed.data.name.trim()
  if (parsed.data.description !== undefined) update.description = String(parsed.data.description).trim()
  if (parsed.data.behaviourType !== undefined) update.behaviour_type = cleanBehaviourType(parsed.data.behaviourType)
  if (parsed.data.defaultQuestionCount !== undefined) update.default_question_count = parsed.data.defaultQuestionCount
  if (parsed.data.jokerEligible !== undefined) update.joker_eligible = parsed.data.jokerEligible
  if (parsed.data.countsTowardsScore !== undefined) update.counts_towards_score = parsed.data.countsTowardsScore
  if (parsed.data.sourceMode !== undefined) update.source_mode = cleanSourceMode(parsed.data.sourceMode)
  if (parsed.data.defaultPackIds !== undefined) update.default_pack_ids = cleanPackIds(parsed.data.defaultPackIds)
  if (parsed.data.selectionRules !== undefined) update.selection_rules = normaliseSelectionRules(parsed.data.selectionRules)
  if (parsed.data.isActive !== undefined) update.is_active = parsed.data.isActive
  if (parsed.data.sortOrder !== undefined) update.sort_order = parsed.data.sortOrder

  const updateRes = await supabaseAdmin
    .from("round_templates")
    .update(update)
    .eq("id", templateId)
    .select("*")
    .maybeSingle()

  if (updateRes.error) {
    return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
  }

  if (!updateRes.data) {
    return NextResponse.json({ error: "Round template not found." }, { status: 404 })
  }

  return NextResponse.json({ ok: true, template: updateRes.data })
}