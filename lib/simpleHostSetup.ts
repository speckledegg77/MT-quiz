import { normaliseDefaultPackIds, normaliseSelectionRules, type RoundTemplateRow } from "@/lib/roundTemplates"
import { getDefaultAnswerSecondsForBehaviour, getDefaultRoundReviewSecondsForBehaviour } from "@/lib/roomRoundPlan"
import { countDistinctRoundTemplateFamilies, getRoundTemplateFamilyKey } from "@/lib/roundTemplateFamilies"

export type SimplePresetId = "classic" | "balanced" | "quickfire_mix"
export type RoundBehaviourType = "standard" | "quickfire" | "spotlight"
export type RoundSourceMode = "selected_packs" | "specific_packs" | "all_questions"

export type FeasibilityExplanation = {
  tone: "ok" | "warning" | "error"
  summary: string
  detail: string | null
  fallback: string | null
}

export type FeasibilityRoundResult = {
  id: string
  name: string
  requestedCount: number
  eligibleCount: number
  assignedCount: number
  shortfall: number
  feasible: boolean
  setupError: string | null
  behaviourType: RoundBehaviourType
  sourceMode: RoundSourceMode
  notes: string[]
  explanation: FeasibilityExplanation
}

export type FeasibilitySetResult = {
  rounds: FeasibilityRoundResult[]
  summary: {
    requestedTotal: number
    unionEligibleQuestionCount: number
    assignedTotal: number
    shortfallTotal: number
    allFeasible: boolean
    explanation: FeasibilityExplanation
  }
}

export type PlannedRoomRound = {
  id: string
  name: string
  questionCount: number
  behaviourType: RoundBehaviourType
  jokerEligible: boolean
  countsTowardsScore: boolean
  sourceMode: RoundSourceMode
  packIds: string[]
  selectionRules: {
    mediaTypes: Array<"text" | "audio" | "image">
    answerTypes: Array<"mcq" | "text">
    promptTargets: string[]
    clueSources: string[]
    primaryShowKeys: string[]
    audioClipTypes: string[]
  }
  answerSeconds: number
  roundReviewSeconds: number
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function normaliseTemplateTiming(raw: unknown, fallback: number) {
  const value = Math.floor(Number(raw ?? fallback))
  if (!Number.isFinite(value) || value < 0) return fallback
  return clampInt(value, 0, 120)
}

export function serialiseTemplateAsRound(template: RoundTemplateRow, index: number): PlannedRoomRound {
  const selectionRules = normaliseSelectionRules(template.selection_rules)
  const defaultPackIds = normaliseDefaultPackIds(template.default_pack_ids)
  const behaviourType: RoundBehaviourType =
    String(template.behaviour_type ?? "standard") === "quickfire"
      ? "quickfire"
      : String(template.behaviour_type ?? "standard") === "spotlight"
        ? "spotlight"
        : "standard"
  const sourceMode: RoundSourceMode =
    String(template.source_mode ?? "selected_packs") === "specific_packs"
      ? "specific_packs"
      : String(template.source_mode ?? "selected_packs") === "all_questions"
        ? "all_questions"
        : "selected_packs"

  return {
    id: String(template.id ?? `template_${index + 1}`),
    name: String(template.name ?? "").trim() || `Round ${index + 1}`,
    questionCount: Math.max(1, Number(template.default_question_count ?? 5) || 5),
    behaviourType,
    jokerEligible:
      behaviourType === "quickfire" || behaviourType === "spotlight"
        ? false
        : Boolean(template.joker_eligible ?? true),
    countsTowardsScore:
      behaviourType === "spotlight" ? false : Boolean(template.counts_towards_score ?? true),
    sourceMode,
    packIds: sourceMode === "specific_packs" ? defaultPackIds : [],
    selectionRules: {
      mediaTypes: selectionRules.mediaTypes ?? [],
      answerTypes: selectionRules.answerTypes ?? [],
      promptTargets: selectionRules.promptTargets ?? [],
      clueSources: selectionRules.clueSources ?? [],
      primaryShowKeys: selectionRules.primaryShowKeys ?? [],
      audioClipTypes: selectionRules.audioClipTypes ?? [],
    },
    answerSeconds: normaliseTemplateTiming(
      template.default_answer_seconds,
      getDefaultAnswerSecondsForBehaviour(behaviourType)
    ),
    roundReviewSeconds: normaliseTemplateTiming(
      template.default_round_review_seconds,
      getDefaultRoundReviewSecondsForBehaviour(behaviourType)
    ),
  }
}

function getSimplePresetQuickfireTarget(preset: SimplePresetId, roundCount: number) {
  if (preset === "classic") return 0
  if (preset === "balanced") {
    if (roundCount >= 5) return 2
    if (roundCount >= 3) return 1
    return 0
  }
  if (roundCount <= 1) return 0
  return Math.min(roundCount - 1, Math.max(1, Math.floor(roundCount / 2)))
}

function shuffleTemplates<T>(items: T[]) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const current = copy[i]
    copy[i] = copy[j]
    copy[j] = current
  }
  return copy
}

function takeNextTemplateByFamily(pool: RoundTemplateRow[], usedFamilies: Set<string>) {
  for (let index = 0; index < pool.length; index += 1) {
    const template = pool[index]
    const familyKey = getRoundTemplateFamilyKey(template)
    if (usedFamilies.has(familyKey)) continue
    usedFamilies.add(familyKey)
    pool.splice(index, 1)
    return template
  }
  return null
}

function chooseSimplePlanTemplates(params: {
  preset: SimplePresetId
  standardTemplates: RoundTemplateRow[]
  quickfireTemplates: RoundTemplateRow[]
  roundCount: number
}) {
  const standardTemplates = shuffleTemplates(params.standardTemplates)
  const quickfireTemplates = shuffleTemplates(params.quickfireTemplates)
  const ordered: RoundTemplateRow[] = []
  const usedFamilies = new Set<string>()

  const pushStandard = () => {
    const next = takeNextTemplateByFamily(standardTemplates, usedFamilies)
    if (next) ordered.push(next)
  }

  const pushQuickfire = () => {
    const next = takeNextTemplateByFamily(quickfireTemplates, usedFamilies)
    if (next) ordered.push(next)
  }

  if (params.preset === "quickfire_mix") {
    if (ordered.length < params.roundCount) pushStandard()
    while (ordered.length < params.roundCount) {
      const before = ordered.length
      if (ordered.length < params.roundCount) pushQuickfire()
      if (ordered.length < params.roundCount) pushStandard()
      if (ordered.length === before) break
    }
    return ordered
  }

  if (params.preset === "balanced") {
    while (ordered.length < params.roundCount) {
      const before = ordered.length
      if (ordered.length < params.roundCount) pushStandard()
      if (ordered.length < params.roundCount) pushStandard()
      if (ordered.length < params.roundCount) pushQuickfire()
      if (ordered.length === before) break
    }
    return ordered
  }

  while (ordered.length < params.roundCount) {
    const before = ordered.length
    pushStandard()
    if (ordered.length < params.roundCount) pushQuickfire()
    if (ordered.length === before) break
  }

  return ordered
}

export function buildSimpleTemplatePlan(params: {
  templates: RoundTemplateRow[]
  feasibilityById: Map<string, FeasibilityRoundResult>
  roundCount: number
  preset: SimplePresetId
}) {
  const roundCount = clampInt(params.roundCount, 1, 20)
  const feasibleTemplates = params.templates.filter((template) => params.feasibilityById.get(template.id)?.feasible)
  const standardTemplates = feasibleTemplates.filter((template) => template.behaviour_type !== "quickfire")
  const quickfireTemplates = feasibleTemplates.filter((template) => template.behaviour_type === "quickfire")

  const availableTemplateCount = countDistinctRoundTemplateFamilies(feasibleTemplates)
  const availableStandardCount = countDistinctRoundTemplateFamilies(standardTemplates)
  const availableQuickfireCount = countDistinctRoundTemplateFamilies(quickfireTemplates)

  if (availableTemplateCount === 0) {
    return {
      rounds: [] as PlannedRoomRound[],
      notes: [] as string[],
      error: "No ready round templates match the current pack choice.",
      availableTemplateCount,
      availableStandardCount,
      availableQuickfireCount,
      standardCount: 0,
      quickfireCount: 0,
      jokerEligibleCount: 0,
    }
  }

  if (availableTemplateCount < roundCount) {
    return {
      rounds: [] as PlannedRoomRound[],
      notes: [] as string[],
      error: `Only ${availableTemplateCount} ready template famil${availableTemplateCount === 1 ? "y is" : "ies are"} available for ${roundCount} rounds.`,
      availableTemplateCount,
      availableStandardCount,
      availableQuickfireCount,
      standardCount: 0,
      quickfireCount: 0,
      jokerEligibleCount: 0,
    }
  }

  const desiredQuickfireCount = getSimplePresetQuickfireTarget(params.preset, roundCount)
  const desiredStandardCount = roundCount - desiredQuickfireCount
  const notes: string[] = []

  if (desiredQuickfireCount > 0 && availableQuickfireCount === 0) {
    notes.push("No ready Quickfire template families were found for this pack choice, so this game falls back to standard rounds.")
  } else if (availableQuickfireCount < desiredQuickfireCount) {
    notes.push(`Only ${availableQuickfireCount} ready Quickfire template famil${availableQuickfireCount === 1 ? "y was" : "ies were"} available, so the game uses fewer Quickfire rounds than the preset prefers.`)
  }

  if (availableStandardCount < desiredStandardCount) {
    notes.push(`Only ${availableStandardCount} ready standard template famil${availableStandardCount === 1 ? "y was" : "ies were"} available, so extra Quickfire rounds were used to fill the plan.`)
  }

  const orderedTemplates = chooseSimplePlanTemplates({
    preset: params.preset,
    standardTemplates,
    quickfireTemplates,
    roundCount,
  }).slice(0, roundCount)

  if (orderedTemplates.length < roundCount) {
    return {
      rounds: [] as PlannedRoomRound[],
      notes,
      error: "The current ready templates cannot fill that game plan without repeating the same round family.",
      availableTemplateCount,
      availableStandardCount,
      availableQuickfireCount,
      standardCount: 0,
      quickfireCount: 0,
      jokerEligibleCount: 0,
    }
  }

  const rounds = orderedTemplates.map((template, index) => serialiseTemplateAsRound(template, index))
  const standardCount = rounds.filter((round) => round.behaviourType !== "quickfire").length
  const quickfireCount = rounds.filter((round) => round.behaviourType === "quickfire").length
  const jokerEligibleCount = rounds.filter((round) => round.jokerEligible).length

  return {
    rounds,
    notes,
    error: null,
    availableTemplateCount,
    availableStandardCount,
    availableQuickfireCount,
    standardCount,
    quickfireCount,
    jokerEligibleCount,
  }
}
