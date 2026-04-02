export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../lib/supabaseAdmin"

type PackRow = {
  id: string
  display_name: string | null
  sort_order: number | null
  is_active: boolean | null
}

type PackQuestionRow = {
  pack_id: string
  question_id: string
}

type QuestionRoundTypeRow = {
  id: string
  round_type: string | null
}

type PackInfo = { id: string; label: string; questionCount: number; audioCount: number }

export async function GET() {
  const packsRes = await supabaseAdmin
    .from("packs")
    .select("id, display_name, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("display_name", { ascending: true })

  if (packsRes.error) {
    return NextResponse.json({ error: packsRes.error.message }, { status: 500 })
  }

  const packs = ((packsRes.data ?? []) as PackRow[]).map((pack) => ({
    id: String(pack.id),
    label: String(pack.display_name ?? pack.id),
    sortOrder: typeof pack.sort_order === "number" ? pack.sort_order : Number.MAX_SAFE_INTEGER,
  }))

  const packIds = packs.map((pack) => pack.id)
  if (!packIds.length) {
    return NextResponse.json({ packs: [] satisfies PackInfo[] })
  }

  const packQuestionsRes = await supabaseAdmin
    .from("pack_questions")
    .select("pack_id, question_id")
    .in("pack_id", packIds)

  if (packQuestionsRes.error) {
    return NextResponse.json({ error: packQuestionsRes.error.message }, { status: 500 })
  }

  const packQuestions = (packQuestionsRes.data ?? []) as PackQuestionRow[]
  const questionIds = [...new Set(packQuestions.map((row) => String(row.question_id ?? "")).filter(Boolean))]

  const questionRoundTypeById = new Map<string, string | null>()

  if (questionIds.length) {
    const questionsRes = await supabaseAdmin.from("questions").select("id, round_type").in("id", questionIds)

    if (questionsRes.error) {
      return NextResponse.json({ error: questionsRes.error.message }, { status: 500 })
    }

    for (const question of (questionsRes.data ?? []) as QuestionRoundTypeRow[]) {
      questionRoundTypeById.set(String(question.id), question.round_type ?? null)
    }
  }

  const countsByPackId = new Map<string, { questionCount: number; audioCount: number }>()

  for (const row of packQuestions) {
    const packId = String(row.pack_id ?? "")
    const questionId = String(row.question_id ?? "")
    if (!packId || !questionId) continue

    const current = countsByPackId.get(packId) ?? { questionCount: 0, audioCount: 0 }
    current.questionCount += 1
    if (questionRoundTypeById.get(questionId) === "audio") {
      current.audioCount += 1
    }
    countsByPackId.set(packId, current)
  }

  const response: PackInfo[] = packs.map((pack) => {
    const counts = countsByPackId.get(pack.id) ?? { questionCount: 0, audioCount: 0 }
    return {
      id: pack.id,
      label: pack.label,
      questionCount: counts.questionCount,
      audioCount: counts.audioCount,
    }
  })

  return NextResponse.json({ packs: response })
}
