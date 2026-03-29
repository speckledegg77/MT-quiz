export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { z } from "zod"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type RouteContext = {
  params: Promise<{
    questionId: string
  }>
}

const answerSchema = z
  .object({
    answerText: z.string().trim().min(1, "answerText is required.").optional(),
    acceptedAnswers: z.array(z.string().trim().min(1)).nullable().optional(),
  })
  .refine((value) => value.answerText !== undefined || value.acceptedAnswers !== undefined, {
    message: "At least one answer field must be provided.",
  })

function normaliseAcceptedAnswers(value: string[] | null | undefined) {
  if (value === undefined) return undefined
  if (value === null) return null

  const seen = new Set<string>()
  const out: string[] = []

  for (const item of value) {
    const cleaned = String(item ?? "").trim()
    if (!cleaned) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
  }

  return out.length ? out : null
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

  const parsed = answerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid answer payload." }, { status: 400 })
  }

  const existingRes = await supabaseAdmin
    .from("questions")
    .select("id, answer_type, answer_text, accepted_answers")
    .eq("id", questionId)
    .maybeSingle()

  if (existingRes.error) {
    return NextResponse.json({ error: existingRes.error.message }, { status: 500 })
  }

  if (!existingRes.data) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 })
  }

  if (String(existingRes.data.answer_type ?? "") !== "text") {
    return NextResponse.json({ error: "Only text-answer questions can edit canonical answers here." }, { status: 400 })
  }

  const update: Record<string, unknown> = {}

  if (parsed.data.answerText !== undefined) {
    update.answer_text = parsed.data.answerText.trim()
  }

  if (parsed.data.acceptedAnswers !== undefined) {
    update.accepted_answers = normaliseAcceptedAnswers(parsed.data.acceptedAnswers)
  }

  const updateRes = await supabaseAdmin
    .from("questions")
    .update(update)
    .eq("id", questionId)
    .select("id, answer_text, accepted_answers")
    .maybeSingle()

  if (updateRes.error) {
    return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, question: updateRes.data })
}
