export const runtime = "nodejs"

import { NextResponse } from "next/server"

import {
  buildQuestionCandidatesFromPackRows,
  evaluateRoundsFeasibility,
  type RoundFeasibilityInput,
} from "@/lib/roundFeasibility"
import type { QuestionCandidate } from "@/lib/manualRoundPlanBuilder"
import type { RoundSelectionRules } from "@/lib/roomRoundPlan"
import { buildHeadsUpSyntheticQuestionId, cleanHeadsUpDifficulty } from "@/lib/headsUp"
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { normaliseDefaultPackIds, normaliseSelectionRules as normaliseTemplateSelectionRules, normaliseRoundTemplateRow } from "@/lib/roundTemplates"

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
    headsUpDifficulties: cleanStringArray(value.headsUpDifficulties),
  }
}

function cleanRounds(raw: unknown): RoundFeasibilityInput[] {
  if (!Array.isArray(raw)) return []
  return raw.map((value, index) => {
    const item = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
    const behaviourRaw = String(item.behaviourType ?? "standard").trim().toLowerCase()
    return {
      id: String(item.id ?? `round_${index + 1}`).trim() || `round_${index + 1}`,
      name: String(item.name ?? "").trim(),
      questionCount: Math.max(0, Math.floor(Number(item.questionCount ?? 0)) || 0),
      behaviourType: behaviourRaw === "quickfire" ? "quickfire" : behaviourRaw === "heads_up" ? "heads_up" : "standard",
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


function mapTemplateRowToFeasibilityInput(raw: unknown, index: number): RoundFeasibilityInput {
  const template = normaliseRoundTemplateRow(raw)
  const behaviourRaw = String(template.behaviour_type ?? "standard").trim().toLowerCase()
  const behaviourType = behaviourRaw === "quickfire" ? "quickfire" : behaviourRaw === "heads_up" ? "heads_up" : "standard"
  const sourceModeRaw = String(template.source_mode ?? "selected_packs").trim().toLowerCase()
  const sourceMode = sourceModeRaw === "specific_packs" ? "specific_packs" : sourceModeRaw === "all_questions" ? "all_questions" : "selected_packs"
  const selectionRules = normaliseTemplateSelectionRules(template.selection_rules)

  return {
    id: String(template.id ?? `template_${index + 1}`).trim() || `template_${index + 1}`,
    name: String(template.name ?? "").trim(),
    questionCount: Math.max(0, Math.floor(Number(template.default_question_count ?? 0)) || 0),
    behaviourType,
    sourceMode,
    packIds: sourceMode === "specific_packs" ? normaliseDefaultPackIds(template.default_pack_ids) : [],
    selectionRules: {
      mediaTypes: selectionRules.mediaTypes ?? [],
      promptTargets: selectionRules.promptTargets ?? [],
      clueSources: selectionRules.clueSources ?? [],
      primaryShowKeys: selectionRules.primaryShowKeys ?? [],
      audioClipTypes: selectionRules.audioClipTypes ?? [],
    },
  } satisfies RoundFeasibilityInput
}

function buildHeadsUpCandidatesFromPackRows(rows: Array<Record<string, unknown>>): QuestionCandidate[] {
  const candidatesById = new Map<string, QuestionCandidate>()
  for (const row of rows) {
    const packId = String(row?.pack_id ?? "").trim()
    const itemId = String(row?.item_id ?? "").trim()
    if (!packId || !itemId) continue
    const item = (row?.heads_up_items ?? {}) as Record<string, unknown>
    const existing = candidatesById.get(itemId)
    if (existing) {
      if (!existing.packIds.includes(packId)) existing.packIds.push(packId)
      continue
    }
    candidatesById.set(itemId, {
      id: buildHeadsUpSyntheticQuestionId(itemId),
      kind: "heads_up",
      legacyRoundType: "general",
      answerType: "text",
      mediaType: "text",
      promptTarget: null,
      clueSource: null,
      primaryShowKey: item.primary_show_key ? String(item.primary_show_key) : null,
      mediaDurationMs: null,
      audioClipType: null,
      packIds: [packId],
      headsUpDifficulty: cleanHeadsUpDifficulty(String(item.difficulty ?? "medium")),
    })
  }
  return [...candidatesById.values()]
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))

    const selectedPackIds = [...new Set(cleanStringArray(body.selectedPackIds))]
    const manualRounds = cleanRounds(body.manualRounds)

    const templateIds = [...new Set(cleanStringArray(body.templateIds))]
    let templateRounds = cleanRounds(body.templateRounds)

    if (templateIds.length > 0) {
      const templateRes = await supabaseAdmin
        .from("round_templates")
        .select("*")
        .in("id", templateIds)
        .eq("is_active", true)

      if (templateRes.error) {
        return NextResponse.json({ error: templateRes.error.message }, { status: 500 })
      }

      const byId = new Map((templateRes.data ?? []).map((row: Record<string, unknown>) => [String(row.id ?? ""), row]))
      templateRounds = templateIds
        .map((id, index) => {
          const row = byId.get(id)
          return row ? mapTemplateRowToFeasibilityInput(row, index) : null
        })
        .filter((value): value is RoundFeasibilityInput => value != null)
    }

    const allRounds = [...manualRounds, ...templateRounds]

    const questionRounds = allRounds.filter((round) => round.behaviourType !== "heads_up")
    const headsUpRounds = allRounds.filter((round) => round.behaviourType === "heads_up")

    const needsAllQuestions = questionRounds.some((round) => round.sourceMode === "all_questions")
    let allActivePackIds: string[] = []

    if (needsAllQuestions) {
      const packsRes = await supabaseAdmin.from("packs").select("id").eq("is_active", true)
      if (packsRes.error) return NextResponse.json({ error: packsRes.error.message }, { status: 500 })
      allActivePackIds = cleanStringArray((packsRes.data ?? []).map((row: { id?: string | null }) => row.id))
    }

    const specificQuestionPackIds = [...new Set(questionRounds.flatMap((round) => cleanStringArray(round.packIds)))]
    const scopeQuestionPackIds = [...new Set([...selectedPackIds, ...specificQuestionPackIds, ...allActivePackIds])]

    const specificHeadsUpPackIds = [...new Set(headsUpRounds.flatMap((round) => cleanStringArray(round.packIds)))]

    let candidates: QuestionCandidate[] = []
    let selectedCandidates: QuestionCandidate[] = []

    if (selectedPackIds.length > 0) {
      const selectedLinksRes = await supabaseAdmin
        .from("pack_questions")
        .select(
          "pack_id, question_id, questions(round_type, answer_type, media_type, prompt_target, clue_source, primary_show_key, media_duration_ms, audio_clip_type)"
        )
        .in("pack_id", selectedPackIds)

      if (selectedLinksRes.error) return NextResponse.json({ error: selectedLinksRes.error.message }, { status: 500 })
      selectedCandidates = buildQuestionCandidatesFromPackRows((selectedLinksRes.data ?? []) as Array<Record<string, unknown>>)
    }

    if (scopeQuestionPackIds.length > 0) {
      const linksRes = await supabaseAdmin
        .from("pack_questions")
        .select(
          "pack_id, question_id, questions(round_type, answer_type, media_type, prompt_target, clue_source, primary_show_key, media_duration_ms, audio_clip_type)"
        )
        .in("pack_id", scopeQuestionPackIds)

      if (linksRes.error) return NextResponse.json({ error: linksRes.error.message }, { status: 500 })
      candidates = candidates.concat(buildQuestionCandidatesFromPackRows((linksRes.data ?? []) as Array<Record<string, unknown>>))
    }

    if (specificHeadsUpPackIds.length > 0) {
      const headsUpLinksRes = await supabaseAdmin
        .from("heads_up_pack_items")
        .select("pack_id, item_id, heads_up_items(id, difficulty, primary_show_key, is_active)")
        .in("pack_id", specificHeadsUpPackIds)

      if (headsUpLinksRes.error) return NextResponse.json({ error: headsUpLinksRes.error.message }, { status: 500 })

      const activeRows = ((headsUpLinksRes.data ?? []) as Array<Record<string, unknown>>).filter((row) => {
        const item = row?.heads_up_items
        const value = Array.isArray(item) ? item[0] : item
        return Boolean(value && (value as Record<string, unknown>).is_active !== false)
      }).map((row) => {
        const item = row?.heads_up_items
        const value = Array.isArray(item) ? item[0] : item
        return { ...row, heads_up_items: value } as Record<string, unknown>
      })

      candidates = candidates.concat(buildHeadsUpCandidatesFromPackRows(activeRows))
    }

    const manual = manualRounds.length
      ? evaluateRoundsFeasibility({ roundsInput: manualRounds, selectedPackIds, allPackIds: allActivePackIds, candidates })
      : null

    const templates = templateRounds.length
      ? evaluateRoundsFeasibility({ roundsInput: templateRounds, selectedPackIds, allPackIds: allActivePackIds, candidates })
      : null

    return NextResponse.json({
      ok: true,
      candidateCount: selectedCandidates.length,
      scopePackCount: scopeQuestionPackIds.length + specificHeadsUpPackIds.length,
      manual,
      templates,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to check round feasibility."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
