export const runtime = "nodejs"

import { NextResponse } from "next/server"

import { supabaseAdmin } from "../../../../lib/supabaseAdmin"
import {
  buildQuestionIdList,
  SelectionError,
  type PackSelectionInput,
  type RoundFilter,
  type SelectionStrategy,
} from "../../../../lib/questionSelection"
import {
  buildLegacyRoomRoundPlan,
  getDefaultAnswerSecondsForBehaviour,
  getDefaultRoundReviewSecondsForBehaviour,
  getLegacyFieldsFromRoundPlan,
  type RoomBuildMode,
  type RoundBehaviourType,
  type RoundSelectionRules,
  type RoundSourceMode,
} from "../../../../lib/roomRoundPlan"
import {
  buildManualRoomRoundPlan,
  deriveMediaType,
  type ManualRoundDraftInput,
  type QuestionCandidate,
} from "../../../../lib/manualRoundPlanBuilder"
import { buildSpotlightSyntheticQuestionId, cleanSpotlightDifficulty } from "../../../../lib/spotlight"
import { normaliseMediaDurationMs } from "../../../../lib/quickfireEligibility"
import { chooseDistinctRoundTemplatesRandomised, countDistinctRoundTemplateFamilies } from "../../../../lib/roundTemplateFamilies"

type LegacyRoundRequest = { packId: string; count: number }


function randomCode(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let out = ""
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

async function fetchAllPackQuestionRows(packIds: string[]) {
  const cleanedPackIds = [...new Set(cleanStringArray(packIds))]
  if (cleanedPackIds.length === 0) return [] as Array<Record<string, unknown>>

  const pageSize = 1000
  const rows: Array<Record<string, unknown>> = []

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const res = await supabaseAdmin
      .from("pack_questions")
      .select(
        "pack_id, question_id, questions(round_type, answer_type, media_type, prompt_target, clue_source, primary_show_key, media_duration_ms, audio_clip_type)"
      )
      .in("pack_id", cleanedPackIds)
      .range(from, to)

    if (res.error) throw new Error(res.error.message)

    const batch = (res.data ?? []) as Array<Record<string, unknown>>
    rows.push(...batch)

    if (batch.length < pageSize) break
  }

  return rows
}

async function fetchAllHeadsUpPackItemRows(packIds: string[]) {
  const cleanedPackIds = [...new Set(cleanStringArray(packIds))]
  if (cleanedPackIds.length === 0) return [] as Array<Record<string, unknown>>

  const pageSize = 1000
  const rows: Array<Record<string, unknown>> = []

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const res = await supabaseAdmin
      .from("heads_up_pack_items")
      .select("pack_id, item_id, heads_up_items(id, difficulty, primary_show_key, is_active)")
      .in("pack_id", cleanedPackIds)
      .range(from, to)

    if (res.error) throw new Error(res.error.message)

    const batch = (res.data ?? []) as Array<Record<string, unknown>>
    rows.push(...batch)

    if (batch.length < pageSize) break
  }

  return rows
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function normaliseRoundFilter(raw: unknown): RoundFilter {
  const v = String(raw ?? "").toLowerCase()
  if (v === "no_audio") return "no_audio"
  if (v === "no_image") return "no_image"
  if (v === "audio_only") return "audio_only"
  if (v === "picture_only") return "picture_only"
  if (v === "audio_and_image") return "audio_and_image"
  return "mixed"
}

function normaliseStrategy(raw: unknown): SelectionStrategy | null {
  const v = String(raw ?? "").toLowerCase()
  if (v === "per_pack") return "per_pack"
  if (v === "all_packs") return "all_packs"
  return null
}

function normaliseBuildMode(raw: unknown): RoomBuildMode {
  const v = String(raw ?? "").toLowerCase()
  if (v === "manual_rounds") return "manual_rounds"
  if (v === "auto_rounds") return "auto_rounds"
  if (v === "quick_random") return "quick_random"
  return "legacy_pack_mode"
}

function normaliseRoundCount(raw: unknown, questionCount: number) {
  const qc = Math.max(1, Math.floor(Number(questionCount ?? 0)) || 1)
  const requested = Math.floor(Number(raw ?? 4))
  const safe = Number.isFinite(requested) ? requested : 4
  const capped = clampInt(safe, 1, 20)
  return Math.min(capped, qc)
}

function normaliseRoundNames(raw: unknown, count: number) {
  const arr = Array.isArray(raw) ? raw : []
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const name = String(arr[i] ?? "").trim()
    out.push(name || `Round ${i + 1}`)
  }
  return out
}

function cleanStringArray(raw: unknown) {
  if (!Array.isArray(raw)) return [] as string[]
  return raw.map((value) => String(value ?? "").trim()).filter(Boolean)
}

function cleanBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback
}

function cleanNumber(value: unknown, fallback: number) {
  const parsed = Math.floor(Number(value))
  return Number.isFinite(parsed) ? parsed : fallback
}

function cleanOptionalNonNegativeNumber(value: unknown) {
  const parsed = Math.floor(Number(value))
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(120, parsed) : undefined
}

function cleanSelectionRules(raw: unknown): RoundSelectionRules {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    mediaTypes: cleanStringArray(value.mediaTypes).filter(
      (item): item is "text" | "audio" | "image" => item === "text" || item === "audio" || item === "image"
    ),
    answerTypes: cleanStringArray(value.answerTypes).filter(
      (item): item is "mcq" | "text" => item === "mcq" || item === "text"
    ),
    promptTargets: cleanStringArray(value.promptTargets),
    clueSources: cleanStringArray(value.clueSources),
    primaryShowKeys: cleanStringArray(value.primaryShowKeys),
    audioClipTypes: cleanStringArray(value.audioClipTypes),
    spotlightDifficulties: cleanStringArray(value.spotlightDifficulties ?? value.headsUpDifficulties),
  }
}

function cleanSourceMode(raw: unknown): RoundSourceMode {
  const value = String(raw ?? "").trim().toLowerCase()
  if (value === "specific_packs") return "specific_packs"
  if (value === "all_questions") return "all_questions"
  return "selected_packs"
}

function cleanBehaviourType(raw: unknown): RoundBehaviourType {
  const value = String(raw ?? "").trim().toLowerCase()
  if (value === "quickfire") return "quickfire"
  if (value === "spotlight" || value === "heads_up") return "spotlight"
  return "standard"
}

function cleanManualRounds(raw: unknown): ManualRoundDraftInput[] {
  const arr = Array.isArray(raw) ? raw : []
  return arr.map((item, index) => {
    const value = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
    return {
      id: String(value.id ?? `manual_round_${index + 1}`).trim() || `manual_round_${index + 1}`,
      name: String(value.name ?? "").trim(),
      questionCount: cleanNumber(value.questionCount, 0),
      behaviourType: cleanBehaviourType(value.behaviourType),
      jokerEligible: cleanBoolean(value.jokerEligible, true),
      countsTowardsScore: cleanBoolean(value.countsTowardsScore, true),
      sourceMode: cleanSourceMode(value.sourceMode),
      packIds: cleanStringArray(value.packIds),
      selectionRules: cleanSelectionRules(value.selectionRules),
      answerSeconds: cleanOptionalNonNegativeNumber(value.answerSeconds),
      roundReviewSeconds: cleanOptionalNonNegativeNumber(value.roundReviewSeconds),
      spotlightTvDisplayMode: String(value.spotlightTvDisplayMode ?? value.headsUpTvDisplayMode ?? "").trim().toLowerCase() === "show_clue" ? "show_clue" : "timer_only",
    }
  })
}

function shuffleInPlace<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = items[i]
    items[i] = items[j]
    items[j] = tmp
  }
}

async function loadQuickRandomTemplates(templateIds: string[]) {
  let query = supabaseAdmin
    .from("round_templates")
    .select("*")
    .eq("is_active", true)

  const cleanedIds = [...new Set(cleanStringArray(templateIds))]
  if (cleanedIds.length) {
    query = query.in("id", cleanedIds)
  }

  const templatesRes = await query
  if (templatesRes.error) throw new Error(templatesRes.error.message)
  return (templatesRes.data ?? []) as any[]
}

function mapTemplateToManualRound(template: any, index: number): ManualRoundDraftInput {
  const defaultPackIds = cleanStringArray(template?.default_pack_ids)
  const behaviourType = cleanBehaviourType(template?.behaviour_type)
  return {
    id: String(template?.id ?? `quick_template_${index + 1}`),
    name: String(template?.name ?? "").trim() || `Round ${index + 1}`,
    questionCount: Math.max(1, cleanNumber(template?.default_question_count, 5)),
    behaviourType,
    jokerEligible: behaviourType === "quickfire" || behaviourType === "spotlight" ? false : cleanBoolean(template?.joker_eligible, true),
    countsTowardsScore: behaviourType === "spotlight" ? false : cleanBoolean(template?.counts_towards_score, true),
    sourceMode: cleanSourceMode(template?.source_mode),
    packIds: cleanSourceMode(template?.source_mode) === "specific_packs" ? defaultPackIds : [],
    selectionRules: cleanSelectionRules(template?.selection_rules),
    answerSeconds: cleanOptionalNonNegativeNumber(template?.default_answer_seconds) ?? getDefaultAnswerSecondsForBehaviour(behaviourType),
    roundReviewSeconds:
      cleanOptionalNonNegativeNumber(template?.default_round_review_seconds) ??
      getDefaultRoundReviewSecondsForBehaviour(behaviourType),
    spotlightTvDisplayMode: String(template?.heads_up_tv_display_mode ?? "").trim().toLowerCase() === "show_clue" ? "show_clue" : "timer_only",
  }
}

async function loadCandidatePoolForManualRounds(params: {
  selectedPackIds: string[]
  manualRounds: ManualRoundDraftInput[]
}) {
  const questionRounds = params.manualRounds.filter((round) => round.behaviourType !== "spotlight")
  const headsUpRounds = params.manualRounds.filter((round) => round.behaviourType === "spotlight")

  const needsAllQuestions = questionRounds.some((round) => round.sourceMode === "all_questions")
  let allActivePackIds: string[] = []

  if (needsAllQuestions) {
    const packsRes = await supabaseAdmin.from("packs").select("id").eq("is_active", true)
    if (packsRes.error) throw new Error(packsRes.error.message)
    allActivePackIds = cleanStringArray((packsRes.data ?? []).map((row: any) => row.id))
  }

  const specificQuestionPackIds = questionRounds.flatMap((round) => cleanStringArray(round.packIds))
  const scopeQuestionPackIds = [...new Set([...params.selectedPackIds, ...specificQuestionPackIds, ...allActivePackIds])]
  const specificHeadsUpPackIds = [...new Set(headsUpRounds.flatMap((round) => cleanStringArray(round.packIds)))]

  if (scopeQuestionPackIds.length === 0 && specificHeadsUpPackIds.length === 0) {
    throw new Error("Manual rounds need selected packs, specific packs, or all active packs.")
  }

  const candidatesById = new Map<string, QuestionCandidate>()

  if (scopeQuestionPackIds.length > 0) {
    const links = await fetchAllPackQuestionRows(scopeQuestionPackIds)

    for (const row of links as any[]) {
      const packId = String(row.pack_id ?? "").trim()
      const questionId = String(row.question_id ?? "").trim()
      if (!packId || !questionId) continue

      const question = row.questions ?? {}
      const legacyRoundType: "general" | "audio" | "picture" =
        question.round_type === "audio" ? "audio" : question.round_type === "picture" ? "picture" : "general"

      const existing = candidatesById.get(questionId)
      if (existing) {
        if (!existing.packIds.includes(packId)) existing.packIds.push(packId)
        continue
      }

      candidatesById.set(questionId, {
        id: questionId,
        kind: "question",
        legacyRoundType,
        answerType: question.answer_type === "text" ? "text" : "mcq",
        mediaType: deriveMediaType({ mediaType: question.media_type ?? null, legacyRoundType }),
        promptTarget: question.prompt_target ? String(question.prompt_target) : null,
        clueSource: question.clue_source ? String(question.clue_source) : null,
        primaryShowKey: question.primary_show_key ? String(question.primary_show_key) : null,
        mediaDurationMs: normaliseMediaDurationMs(question.media_duration_ms),
        audioClipType: question.audio_clip_type ? String(question.audio_clip_type) : null,
        packIds: [packId],
      })
    }
  }

  if (specificHeadsUpPackIds.length > 0) {
    const headsUpLinks = await fetchAllHeadsUpPackItemRows(specificHeadsUpPackIds)

    for (const row of headsUpLinks as any[]) {
      const packId = String(row.pack_id ?? "").trim()
      const itemId = String(row.item_id ?? "").trim()
      const itemRaw = Array.isArray(row.heads_up_items) ? row.heads_up_items[0] : row.heads_up_items
      if (!packId || !itemId || !itemRaw || itemRaw.is_active === false) continue

      const syntheticId = buildSpotlightSyntheticQuestionId(itemId)
      const existing = candidatesById.get(syntheticId)
      if (existing) {
        if (!existing.packIds.includes(packId)) existing.packIds.push(packId)
        continue
      }

      candidatesById.set(syntheticId, {
        id: syntheticId,
        kind: "spotlight",
        legacyRoundType: "general",
        answerType: "text",
        mediaType: "text",
        promptTarget: null,
        clueSource: null,
        primaryShowKey: itemRaw.primary_show_key ? String(itemRaw.primary_show_key) : null,
        mediaDurationMs: null,
        audioClipType: null,
        packIds: [packId],
        spotlightDifficulty: cleanSpotlightDifficulty(String(itemRaw.difficulty ?? "medium")),
      })
    }
  }

  return {
    allActivePackIds,
    candidates: [...candidatesById.values()],
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  const buildMode = normaliseBuildMode(body.buildMode)
  const gameModeRaw = String(body.gameMode ?? "teams").toLowerCase()
  const gameMode = gameModeRaw === "solo" ? "solo" : "teams"
  const teamScoreModeRaw = String(body.teamScoreMode ?? "total").toLowerCase()
  const teamScoreMode = teamScoreModeRaw === "average" ? "average" : "total"
  const teamNames = cleanStringArray(body.teamNames)

  if (gameMode === "teams") {
    if (teamNames.length < 2) {
      return NextResponse.json({ error: "Add at least two team names" }, { status: 400 })
    }
    const seen = new Set<string>()
    for (const name of teamNames) {
      const key = name.toLowerCase()
      if (seen.has(key)) {
        return NextResponse.json({ error: "Team names must be unique" }, { status: 400 })
      }
      seen.add(key)
    }
  }

  const countdownSeconds = Number(body.countdownSeconds ?? 30)
  const answerSeconds = Number(body.answerSeconds ?? 20)
  const revealDelaySeconds = Number(body.revealDelaySeconds ?? 2)
  const revealSeconds = Number(body.revealSeconds ?? 5)
  const audioModeRaw = String(body.audioMode ?? "display").toLowerCase()
  const audioMode = audioModeRaw === "phones" || audioModeRaw === "both" ? audioModeRaw : "display"

  const roundFilter = normaliseRoundFilter(body.roundFilter)
  const legacyRoundsInput: any[] = Array.isArray(body.rounds) ? body.rounds : []
  const legacyRounds: LegacyRoundRequest[] = legacyRoundsInput
    .map((round) => ({
      packId: String(round?.packId ?? "").trim(),
      count: Number(round?.count ?? 0),
    }))
    .filter((round) => round.packId && Number.isFinite(round.count) && round.count > 0)

  const selectedPacksInput: any[] = Array.isArray(body.selectedPacks) ? body.selectedPacks : []
  const selectedPacks = selectedPacksInput.map((value) => String(value ?? "").trim()).filter(Boolean)

  const totalQuestionsRaw =
    body.totalQuestions != null ? Number(body.totalQuestions) : body.questionCount != null ? Number(body.questionCount) : 20
  const totalQuestions = Number.isFinite(totalQuestionsRaw) && totalQuestionsRaw > 0 ? Math.floor(totalQuestionsRaw) : 20

  const strategyFromBody = normaliseStrategy(body.selectionStrategy)
  const inferredStrategy: SelectionStrategy = legacyRounds.length > 0 ? "per_pack" : "all_packs"
  const strategy: SelectionStrategy = strategyFromBody ?? inferredStrategy

  const roundCount = normaliseRoundCount(body.roundCount, totalQuestions)
  const roundNames = normaliseRoundNames(body.roundNames, roundCount)

  let roundPlan: import("../../../../lib/roomRoundPlan").RoomRoundPlan
  let legacyFields: ReturnType<typeof getLegacyFieldsFromRoundPlan>
  let selectedPacksToStore: string[] = []
  let selectionStrategyToStore: SelectionStrategy = strategy
  let roundFilterToStore: RoundFilter = roundFilter
  let roundsToStore: PackSelectionInput[] | null = null
  let effectiveTotalQuestions = totalQuestions

  try {
    if (buildMode === "manual_rounds") {
      const manualRounds = cleanManualRounds(body.manualRounds)
      const { allActivePackIds, candidates } = await loadCandidatePoolForManualRounds({
        selectedPackIds: selectedPacks,
        manualRounds,
      })

      roundPlan = buildManualRoomRoundPlan({
        roundsInput: manualRounds,
        selectedPackIds: selectedPacks,
        allPackIds: allActivePackIds,
        candidates,
        buildMode,
      })

      legacyFields = getLegacyFieldsFromRoundPlan(roundPlan)
      effectiveTotalQuestions = legacyFields.question_ids.length
      selectedPacksToStore = [
        ...new Set([
          ...selectedPacks,
          ...manualRounds.flatMap((round) => (round.sourceMode === "specific_packs" ? cleanStringArray(round.packIds) : [])),
        ]),
      ]
      selectionStrategyToStore = "all_packs"
      roundFilterToStore = "mixed"
      roundsToStore = null
    } else {
      const usingTemplateQuickRandom =
        buildMode === "quick_random" && Boolean(body.quickRandomUseTemplates)

      const packIdsFromRounds = [...new Set(legacyRounds.map((round) => round.packId))]
      const packIds = [...new Set([...(selectedPacks.length ? selectedPacks : []), ...packIdsFromRounds])].filter(Boolean)

      if (packIds.length === 0) {
        return NextResponse.json({ error: "Pick at least one pack" }, { status: 400 })
      }

      if (usingTemplateQuickRandom) {
        const quickRandomTemplateIds = cleanStringArray(body.quickRandomTemplateIds)
        const activeTemplates = await loadQuickRandomTemplates(quickRandomTemplateIds)

        if (!activeTemplates.length) {
          return NextResponse.json({ error: "No active round templates matched your selection." }, { status: 400 })
        }

        const distinctFamilyCount = countDistinctRoundTemplateFamilies(activeTemplates)

        if (roundCount > distinctFamilyCount) {
          return NextResponse.json(
            { error: "Number of rounds cannot be greater than the number of distinct template families selected." },
            { status: 400 }
          )
        }

        const chosenTemplates = chooseDistinctRoundTemplatesRandomised(activeTemplates, roundCount)
        if (chosenTemplates.length < roundCount) {
          return NextResponse.json(
            { error: "Could not build a quick-random game without repeating the same round family." },
            { status: 400 }
          )
        }

        const quickRandomRounds = chosenTemplates.map((template, index) => mapTemplateToManualRound(template, index))

        const { allActivePackIds, candidates } = await loadCandidatePoolForManualRounds({
          selectedPackIds: packIds,
          manualRounds: quickRandomRounds,
        })

        roundPlan = buildManualRoomRoundPlan({
          roundsInput: quickRandomRounds,
          selectedPackIds: packIds,
          allPackIds: allActivePackIds,
          candidates,
          buildMode,
        })

        legacyFields = getLegacyFieldsFromRoundPlan(roundPlan)
        effectiveTotalQuestions = legacyFields.question_ids.length
        selectedPacksToStore = [
          ...new Set([
            ...packIds,
            ...quickRandomRounds.flatMap((round) => (round.sourceMode === "specific_packs" ? cleanStringArray(round.packIds) : [])),
          ]),
        ]
        selectionStrategyToStore = "all_packs"
        roundFilterToStore = "mixed"
        roundsToStore = null
      } else {
        let selectionPacks: PackSelectionInput[] = []
        if (strategy === "per_pack" && legacyRounds.length > 0) {
          selectionPacks = legacyRounds.map((round) => ({
            pack_id: round.packId,
            count: Math.max(1, Math.floor(Number(round.count))),
          }))
        } else {
          selectionPacks = packIds.map((id) => ({ pack_id: id }))
        }

        const packQuestionsById: Record<string, Array<{ id: string; round_type: "general" | "audio" | "picture" }>> = {}
        for (const pid of packIds) packQuestionsById[pid] = []

        const links = await fetchAllPackQuestionRows(packIds)

        for (const row of links as any[]) {
          const pid = String(row.pack_id ?? "").trim()
          const qid = String(row.question_id ?? "").trim()
          const rt = row.questions?.round_type
          if (!pid || !qid) continue
          const round_type: "general" | "audio" | "picture" =
            rt === "audio" ? "audio" : rt === "picture" ? "picture" : "general"
          packQuestionsById[pid] ??= []
          packQuestionsById[pid].push({ id: qid, round_type })
        }

        const result = buildQuestionIdList({
          packs: selectionPacks,
          packQuestionsById,
          strategy,
          totalQuestions,
          roundFilter,
        })

        const pickedIds = result.questionIds
        if (pickedIds.length === 0) {
          return NextResponse.json(
            { error: packIds.length ? `No questions found for packs: ${packIds.join(", ")}` : "No questions found" },
            { status: 400 }
          )
        }

        roundPlan = buildLegacyRoomRoundPlan(pickedIds, roundCount, roundNames, buildMode)
        legacyFields = getLegacyFieldsFromRoundPlan(roundPlan)
        effectiveTotalQuestions = legacyFields.question_ids.length
        selectedPacksToStore = packIds
        selectionStrategyToStore = strategy
        roundFilterToStore = roundFilter
        roundsToStore = strategy === "per_pack" ? selectionPacks : null
      }
    }
  } catch (error: any) {
    if (error instanceof SelectionError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: error?.message ?? "Could not create room" }, { status: 400 })
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode(8)

    const ins = await supabaseAdmin
      .from("rooms")
      .insert({
        code,
        phase: "lobby",
        question_ids: legacyFields.question_ids,
        question_index: 0,
        countdown_seconds: countdownSeconds,
        answer_seconds: answerSeconds,
        reveal_delay_seconds: revealDelaySeconds,
        reveal_seconds: revealSeconds,
        audio_mode: audioMode,
        selected_packs: selectedPacksToStore,
        selection_strategy: selectionStrategyToStore,
        round_filter: roundFilterToStore,
        total_questions: effectiveTotalQuestions,
        rounds: roundsToStore,
        game_mode: gameMode,
        team_names: gameMode === "teams" ? teamNames : [],
        team_score_mode: gameMode === "teams" ? teamScoreMode : "total",
        round_count: legacyFields.round_count,
        round_names: legacyFields.round_names,
        build_mode: buildMode,
        round_plan: roundPlan,
      })
      .select("code")
      .single()

    if (!ins.error) return NextResponse.json({ code: ins.data.code })
  }

  return NextResponse.json({ error: "Could not create room" }, { status: 500 })
}
