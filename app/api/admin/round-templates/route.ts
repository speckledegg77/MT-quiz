export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0


import { NextResponse } from "next/server"
import { z } from "zod"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import {
  cleanBehaviourType,
  cleanSourceMode,
  normaliseSelectionRules,
  normalisePackIds,
  ROUND_TEMPLATE_BEHAVIOUR_TYPE_VALUES,
  ROUND_TEMPLATE_SOURCE_MODE_VALUES,
} from "@/lib/roundTemplates"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

function cleanPackIds(values: string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
}

const selectionRulesSchema = z
  .object({
    mediaTypes: z.array(z.enum(["text", "audio", "image"])).optional(),
    promptTargets: z.array(z.string()).optional(),
    clueSources: z.array(z.string()).optional(),
    primaryShowKeys: z.array(z.string()).optional(),
    audioClipTypes: z.array(z.string()).optional(),
  })
  .optional()

const createRoundTemplateSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  description: z.string().optional(),
  behaviourType: z.enum(ROUND_TEMPLATE_BEHAVIOUR_TYPE_VALUES).optional(),
  defaultQuestionCount: z.coerce.number().int().min(1, "Default question count must be at least 1."),
  defaultAnswerSeconds: z.union([z.coerce.number().int().min(0).max(120), z.null()]).optional(),
  defaultRoundReviewSeconds: z.union([z.coerce.number().int().min(0).max(120), z.null()]).optional(),
  jokerEligible: z.boolean().optional(),
  countsTowardsScore: z.boolean().optional(),
  sourceMode: z.enum(ROUND_TEMPLATE_SOURCE_MODE_VALUES).optional(),
  defaultPackIds: z.array(z.string()).optional(),
  selectionRules: selectionRulesSchema,
  isActive: z.boolean().optional(),
})

export async function GET(req: Request) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  const templatesRes = await supabaseAdmin
    .from("round_templates")
    .select("*")
    .order("name", { ascending: true })

  if (templatesRes.error) {
    return NextResponse.json({ error: templatesRes.error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, templates: (templatesRes.data ?? []).map((template: any) => ({ ...template, source_mode: cleanSourceMode(template?.source_mode), default_pack_ids: normalisePackIds(template?.default_pack_ids), selection_rules: normaliseSelectionRules(template?.selection_rules) })) }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(req: Request) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  let body: unknown

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 })
  }

  const parsed = createRoundTemplateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 }
    )
  }

  const insertRes = await supabaseAdmin
    .from("round_templates")
    .insert({
      name: parsed.data.name.trim(),
      description: String(parsed.data.description ?? "").trim(),
      behaviour_type: cleanBehaviourType(parsed.data.behaviourType),
      default_question_count: parsed.data.defaultQuestionCount,
      default_answer_seconds: parsed.data.defaultAnswerSeconds ?? null,
      default_round_review_seconds: parsed.data.defaultRoundReviewSeconds ?? null,
      joker_eligible: parsed.data.jokerEligible ?? true,
      counts_towards_score: parsed.data.countsTowardsScore ?? true,
      source_mode: cleanSourceMode(parsed.data.sourceMode),
      default_pack_ids: normalisePackIds(parsed.data.defaultPackIds),
      selection_rules: normaliseSelectionRules(parsed.data.selectionRules),
      is_active: parsed.data.isActive ?? true,
    })
    .select("*")
    .single()

  if (insertRes.error) {
    return NextResponse.json({ error: insertRes.error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, template: { ...insertRes.data, source_mode: cleanSourceMode(insertRes.data?.source_mode), default_pack_ids: normalisePackIds(insertRes.data?.default_pack_ids), selection_rules: normaliseSelectionRules(insertRes.data?.selection_rules) } }, { headers: { "Cache-Control": "no-store" } })
}