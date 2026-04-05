export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { z } from "zod"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import { parseAcceptedAnswers } from "@/lib/questionAudit"
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
    options: z.array(z.string()).length(4, "MCQ questions need exactly four options.").optional(),
    answerIndex: z.number().int().min(0).max(3).optional(),
  })
  .refine(
    (value) =>
      value.answerText !== undefined ||
      value.acceptedAnswers !== undefined ||
      value.options !== undefined ||
      value.answerIndex !== undefined,
    {
      message: "At least one answer field must be provided.",
    }
  )

function normaliseAcceptedAnswers(value: string[] | null | undefined) {
  if (value === undefined) return undefined
  if (value === null) return null
  const parsed = parseAcceptedAnswers(value)
  return parsed.length ? parsed : null
}

function normaliseMcqOptions(value: string[] | undefined) {
  if (value === undefined) return undefined

  return value.map((item) => String(item ?? "").trim())
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
    .select("id, answer_type, answer_text, accepted_answers, options, answer_index")
    .eq("id", questionId)
    .maybeSingle()

  if (existingRes.error) {
    return NextResponse.json({ error: existingRes.error.message }, { status: 500 })
  }

  if (!existingRes.data) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 })
  }

  const answerType = String(existingRes.data.answer_type ?? "")
  const update: Record<string, unknown> = {}

  if (answerType === "text") {
    if (parsed.data.options !== undefined || parsed.data.answerIndex !== undefined) {
      return NextResponse.json({ error: "MCQ option editing is only available for MCQ questions." }, { status: 400 })
    }

    if (parsed.data.answerText !== undefined) {
      update.answer_text = parsed.data.answerText.trim()
    }

    if (parsed.data.acceptedAnswers !== undefined) {
      update.accepted_answers = normaliseAcceptedAnswers(parsed.data.acceptedAnswers)
    }
  } else if (answerType === "mcq") {
    if (parsed.data.answerText !== undefined || parsed.data.acceptedAnswers !== undefined) {
      return NextResponse.json({ error: "Canonical text-answer editing is only available for text-answer questions." }, { status: 400 })
    }

    const nextOptions = normaliseMcqOptions(parsed.data.options)
    if (nextOptions !== undefined && nextOptions.some((option) => !option)) {
      return NextResponse.json({ error: "All four MCQ options must be filled in." }, { status: 400 })
    }

    if (nextOptions !== undefined) {
      update.options = nextOptions
    }

    if (parsed.data.answerIndex !== undefined) {
      update.answer_index = parsed.data.answerIndex
    }
  } else {
    return NextResponse.json({ error: "This question type cannot be edited here." }, { status: 400 })
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 })
  }

  const updateRes = await supabaseAdmin
    .from("questions")
    .update(update)
    .eq("id", questionId)
    .select("id, answer_type, answer_text, accepted_answers, options, answer_index")
    .maybeSingle()

  if (updateRes.error) {
    return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, question: updateRes.data })
}
