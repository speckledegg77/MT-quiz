import {
  getDefaultAnswerSecondsForBehaviour,
  getDefaultRoundReviewSecondsForBehaviour,
  type RoomRoundPlan,
  type RoundBehaviourType,
  type RoundPlanItem,
  type RoundSelectionRules,
  type RoundSourceMode,
} from "@/lib/roomRoundPlan"
import { prioritiseItemsByRecentUsage, type QuestionUsageInfo } from "@/lib/questionRecency"
import { isQuickfireBehaviour } from "@/lib/roundFlow"
import { isQuickfireEligibleItem, normaliseMediaDurationMs } from "@/lib/quickfireEligibility"

export type ManualRoundDraftInput = {
  id?: string
  name?: string
  questionCount?: number
  behaviourType?: RoundBehaviourType
  jokerEligible?: boolean
  countsTowardsScore?: boolean
  sourceMode?: RoundSourceMode
  packIds?: string[]
  selectionRules?: RoundSelectionRules
  answerSeconds?: number
  roundReviewSeconds?: number
  spotlightTvDisplayMode?: "show_clue" | "timer_only"
}

export type QuestionCandidate = {
  id: string
  kind: "question" | "spotlight"
  legacyRoundType: "general" | "audio" | "picture"
  answerType: "mcq" | "text"
  mediaType: "text" | "audio" | "image"
  promptTarget: string | null
  clueSource: string | null
  primaryShowKey: string | null
  mediaDurationMs: number | null
  audioClipType: string | null
  packIds: string[]
  spotlightDifficulty?: string | null
}

function cleanStringArray(raw: unknown) {
  if (!Array.isArray(raw)) return [] as string[]
  return raw.map((value) => String(value ?? "").trim()).filter(Boolean)
}

function cleanMediaTypeArray(raw: unknown): Array<"text" | "audio" | "image"> {
  return cleanStringArray(raw).filter((value): value is "text" | "audio" | "image" => {
    return value === "text" || value === "audio" || value === "image"
  })
}

function cleanAnswerTypeArray(raw: unknown): Array<"mcq" | "text"> {
  return cleanStringArray(raw).filter((value): value is "mcq" | "text" => {
    return value === "mcq" || value === "text"
  })
}

function normaliseSelectionRules(raw: unknown): RoundSelectionRules {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    mediaTypes: cleanMediaTypeArray(value.mediaTypes),
    answerTypes: cleanAnswerTypeArray(value.answerTypes),
    promptTargets: cleanStringArray(value.promptTargets),
    clueSources: cleanStringArray(value.clueSources),
    primaryShowKeys: cleanStringArray(value.primaryShowKeys),
    audioClipTypes: cleanStringArray(value.audioClipTypes),
    spotlightDifficulties: cleanStringArray(value.spotlightDifficulties),
  }
}

function normaliseSourceMode(raw: unknown): RoundSourceMode {
  const value = String(raw ?? "").trim().toLowerCase()
  if (value === "specific_packs") return "specific_packs"
  if (value === "all_questions") return "all_questions"
  return "selected_packs"
}

function normaliseBehaviourType(raw: unknown): RoundBehaviourType {
  const value = String(raw ?? "").trim().toLowerCase()
  if (value === "spotlight") return "spotlight"
  return isQuickfireBehaviour(raw) ? "quickfire" : "standard"
}

function normaliseRoundName(raw: unknown, index: number) {
  const value = String(raw ?? "").trim()
  return value || `Round ${index + 1}`
}

function normaliseCount(raw: unknown) {
  const value = Math.floor(Number(raw ?? 0))
  return Number.isFinite(value) && value > 0 ? value : 0
}

function normaliseOptionalNonNegativeInt(raw: unknown, fallback: number) {
  const value = Math.floor(Number(raw ?? fallback))
  if (!Number.isFinite(value) || value < 0) return fallback
  return Math.min(120, value)
}

function cleanPackIds(raw: unknown) {
  return [...new Set(cleanStringArray(raw))]
}

function getSourcePackIds(args: {
  sourceMode: RoundSourceMode
  selectedPackIds: string[]
  specificPackIds: string[]
  allPackIds: string[]
}) {
  if (args.sourceMode === "specific_packs") return args.specificPackIds
  if (args.sourceMode === "all_questions") return args.allPackIds
  return args.selectedPackIds
}

function candidateMatchesRules(candidate: QuestionCandidate, rules: RoundSelectionRules, behaviourType: RoundBehaviourType) {
  if (rules.primaryShowKeys?.length && !rules.primaryShowKeys.includes(candidate.primaryShowKey ?? "")) return false

  if (behaviourType === "spotlight") {
    if (rules.spotlightDifficulties?.length && !rules.spotlightDifficulties.includes(candidate.spotlightDifficulty ?? "")) return false
    return candidate.kind === "spotlight"
  }

  if (candidate.kind !== "question") return false
  if (rules.mediaTypes?.length && !rules.mediaTypes.includes(candidate.mediaType)) return false
  if (rules.answerTypes?.length && !rules.answerTypes.includes(candidate.answerType)) return false
  if (rules.promptTargets?.length && !rules.promptTargets.includes(candidate.promptTarget ?? "")) return false
  if (rules.clueSources?.length && !rules.clueSources.includes(candidate.clueSource ?? "")) return false
  if (rules.audioClipTypes?.length && !rules.audioClipTypes.includes(candidate.audioClipType ?? "")) return false
  return true
}

export function deriveMediaType(input: {
  mediaType?: string | null
  legacyRoundType?: string | null
}) {
  const explicit = String(input.mediaType ?? "").trim().toLowerCase()
  if (explicit === "audio" || explicit === "image" || explicit === "text") {
    return explicit as "text" | "audio" | "image"
  }

  const legacy = String(input.legacyRoundType ?? "").trim().toLowerCase()
  if (legacy === "audio") return "audio"
  if (legacy === "picture") return "image"
  return "text"
}

export function buildManualRoomRoundPlan(params: {
  roundsInput: ManualRoundDraftInput[]
  selectedPackIds: string[]
  allPackIds: string[]
  candidates: QuestionCandidate[]
  buildMode?: RoomRoundPlan["buildMode"]
  recentUsageById?: Record<string, QuestionUsageInfo>
}): RoomRoundPlan {
  const { roundsInput, selectedPackIds, allPackIds, candidates } = params
  const recentUsageById = params.recentUsageById ?? {}

  if (!Array.isArray(roundsInput) || roundsInput.length === 0) {
    throw new Error("Add at least one round.")
  }

  const usedIds = new Set<string>()
  const rounds: RoundPlanItem[] = []

  for (let index = 0; index < roundsInput.length; index++) {
    const roundRaw = roundsInput[index] ?? {}
    const name = normaliseRoundName(roundRaw.name, index)
    const sourceMode = normaliseSourceMode(roundRaw.sourceMode)
    const behaviourType = normaliseBehaviourType(roundRaw.behaviourType)
    const questionCount = normaliseCount(roundRaw.questionCount)
    if (behaviourType !== "spotlight" && questionCount <= 0) {
      throw new Error(`Round ${index + 1} needs a question count greater than 0.`)
    }
    const packIds = cleanPackIds(roundRaw.packIds)
    const sourcePackIds = getSourcePackIds({
      sourceMode,
      selectedPackIds,
      specificPackIds: packIds,
      allPackIds,
    })

    if (sourceMode === "selected_packs" && sourcePackIds.length === 0) {
      throw new Error(`Round "${name}" uses selected packs, but no packs are selected.`)
    }

    if (sourceMode === "specific_packs" && sourcePackIds.length === 0) {
      throw new Error(`Round "${name}" needs at least one specific pack.`)
    }

    if (behaviourType === "spotlight" && sourceMode !== "specific_packs") {
      throw new Error(`Round "${name}" must use a specific Spotlight pack.`)
    }

    const selectionRules = normaliseSelectionRules(roundRaw.selectionRules)
    const answerSeconds = normaliseOptionalNonNegativeInt(
      roundRaw.answerSeconds,
      getDefaultAnswerSecondsForBehaviour(behaviourType)
    )
    const roundReviewSeconds = normaliseOptionalNonNegativeInt(
      roundRaw.roundReviewSeconds,
      getDefaultRoundReviewSecondsForBehaviour(behaviourType)
    )

    const available = candidates.filter((candidate) => {
      if (usedIds.has(candidate.id)) return false
      if (sourcePackIds.length > 0) {
        const inScope = candidate.packIds.some((packId) => sourcePackIds.includes(packId))
        if (!inScope) return false
      }
      if (behaviourType === "quickfire" && !isQuickfireEligibleItem(candidate)) return false
      if (behaviourType === "quickfire" && candidate.kind !== "question") return false
      if (behaviourType === "standard" && candidate.kind !== "question") return false
      if (behaviourType === "spotlight" && candidate.kind !== "spotlight") return false
      return candidateMatchesRules(candidate, selectionRules, behaviourType)
    })

    const requestedCount = behaviourType === "spotlight" ? available.length : questionCount
    if (requestedCount <= 0) {
      throw new Error(
        behaviourType === "spotlight"
          ? `Round "${name}" needs at least one active Spotlight card in the selected pack.`
          : `Round "${name}" needs a question count greater than 0.`
      )
    }

    if (available.length < requestedCount) {
      throw new Error(
        `Round "${name}" needs ${requestedCount} item${requestedCount === 1 ? "" : "s"}, but only ${available.length} match.`
      )
    }

    const chosen = prioritiseItemsByRecentUsage(available, recentUsageById).slice(0, requestedCount)
    for (const candidate of chosen) usedIds.add(candidate.id)

    rounds.push({
      id: String(roundRaw.id ?? `manual_round_${index + 1}`).trim() || `manual_round_${index + 1}`,
      name,
      behaviourType,
      questionCount: chosen.length,
      jokerEligible: behaviourType === "quickfire" || behaviourType === "spotlight" ? false : Boolean(roundRaw.jokerEligible ?? true),
      countsTowardsScore: behaviourType === "spotlight" ? false : Boolean(roundRaw.countsTowardsScore ?? true),
      sourceMode,
      packIds: sourceMode === "specific_packs" ? sourcePackIds : [],
      selectionRules,
      answerSeconds,
      roundReviewSeconds,
      spotlightTvDisplayMode:
        behaviourType === "spotlight"
          ? String((roundRaw as any).spotlightTvDisplayMode ?? "timer_only").trim().toLowerCase() === "show_clue"
            ? "show_clue"
            : "timer_only"
          : undefined,
      questionIds: chosen.map((candidate) => candidate.id),
    })
  }

  return {
    buildMode: params.buildMode ?? "manual_rounds",
    rounds,
  }
}
