export const runtime = "nodejs"

import { NextResponse } from "next/server"

import {
  buildQuestionCandidatesFromPackRows,
  evaluateRoundsFeasibility,
  type RoundFeasibilityInput,
} from "@/lib/roundFeasibility"
import type { RoundSelectionRules } from "@/lib/roomRoundPlan"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

function cleanStringArray(raw: unknown) {
  if (!Array.isArray(raw)) return [] as string[]
  return raw.map((value) => String(value ?? "").trim()).filter(Boolean)
}

function cleanMediaTypeArray(raw: unknown): Array<"text" | "audio" | "image"> {
  return cleanStringArray(raw).filter((value): value is "text" | "audio" | "image" => {
    return value === "text" || value === "audio" || value === "image"
  })
}

function cleanSelectionRules(raw: unknown): RoundSelectionRules {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    mediaTypes: cleanMediaTypeArray(value.mediaTypes),
    promptTargets: cleanStringArray(value.promptTargets),
    clueSources: cleanStringArray(value.clueSources),
    primaryShowKeys: cleanStringArray(value.primaryShowKeys),
    audioClipTypes: cleanStringArray(value.audioClipTypes),
  }
}

function cleanRounds(raw: unknown): RoundFeasibilityInput[] {
  if (!Array.isArray(raw)) return []
  return raw.map((value, index) => {
    const item = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
    return {
      id: String(item.id ?? `round_${index + 1}`).trim() || `round_${index + 1}`,
      name: String(item.name ?? "").trim(),
      questionCount: Math.max(0, Math.floor(Number(item.questionCount ?? 0)) || 0),
      behaviourType:
        String(item.behaviourType ?? "standard").trim().toLowerCase() === "quickfire" ? "quickfire" : "standard",
      sourceMode:
        String(item.sourceMode ?? "selected_packs").trim().toLowerCase() === "specific_packs"
          ? "specific_packs"
          : String(item.sourceMode ?? "selected_packs").trim().toLowerCase() === "all_questions"
            ? "all_questions"
            : "selected_packs",
      packIds: cleanStringArray(item.packIds),
      selectionRules: cleanSelectionRules(item.selectionRules),
    } satisfies RoundFeasibilityInput
  })
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))

    const selectedPackIds = [...new Set(cleanStringArray(body.selectedPackIds))]
    const manualRounds = cleanRounds(body.manualRounds)
    const templateRounds = cleanRounds(body.templateRounds)
    const allRounds = [...manualRounds, ...templateRounds]

    const needsAllQuestions = allRounds.some((round) => round.sourceMode === "all_questions")
    let allActivePackIds: string[] = []

    if (needsAllQuestions) {
      const packsRes = await supabaseAdmin.from("packs").select("id").eq("is_active", true)
      if (packsRes.error) {
        return NextResponse.json({ error: packsRes.error.message }, { status: 500 })
      }
      allActivePackIds = cleanStringArray((packsRes.data ?? []).map((row: { id?: string | null }) => row.id))
    }

    const specificPackIds = [...new Set(allRounds.flatMap((round) => cleanStringArray(round.packIds)))]
    const scopePackIds = [...new Set([...selectedPackIds, ...specificPackIds, ...allActivePackIds])]

    let candidates = [] as ReturnType<typeof buildQuestionCandidatesFromPackRows>

    if (scopePackIds.length > 0) {
      const linksRes = await supabaseAdmin
        .from("pack_questions")
        .select(
          "pack_id, question_id, questions(round_type, answer_type, media_type, prompt_target, clue_source, primary_show_key, media_duration_ms, audio_clip_type)"
        )
        .in("pack_id", scopePackIds)

      if (linksRes.error) {
        return NextResponse.json({ error: linksRes.error.message }, { status: 500 })
      }

      candidates = buildQuestionCandidatesFromPackRows((linksRes.data ?? []) as Array<Record<string, unknown>>)
    }

    const manual = manualRounds.length
      ? evaluateRoundsFeasibility({
          roundsInput: manualRounds,
          selectedPackIds,
          allPackIds: allActivePackIds,
          candidates,
        })
      : null

    const templates = templateRounds.length
      ? evaluateRoundsFeasibility({
          roundsInput: templateRounds,
          selectedPackIds,
          allPackIds: allActivePackIds,
          candidates,
        })
      : null

    return NextResponse.json({
      ok: true,
      candidateCount: candidates.length,
      scopePackCount: scopePackIds.length,
      manual,
      templates,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to check round feasibility."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
