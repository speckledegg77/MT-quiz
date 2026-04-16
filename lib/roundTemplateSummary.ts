import {
  getDefaultAnswerSecondsForBehaviour,
  getDefaultRoundReviewSecondsForBehaviour,
} from "@/lib/roomRoundPlan"
import { getRoundTemplateDisplayInfo } from "@/lib/roundTemplateNaming"
import {
  normaliseDefaultPackIds,
  normaliseSelectionRules,
  type RoundTemplateRow,
} from "@/lib/roundTemplates"

export type RoundTemplateListFilters = {
  active: "all" | "active" | "inactive"
  behaviour: "all" | "standard" | "quickfire"
  answerType: "all" | "mcq" | "text" | "any"
  mediaType: "all" | "text" | "audio" | "image" | "any"
}

export type RoundTemplatePresentation = {
  familyName: string
  variantLabel: string
  behaviourLabel: string
  sourceModeLabel: string
  answerTypeLabel: string
  mediaTypeLabel: string
  promptTargetLabel: string
  clueSourceLabel: string
  showLabel: string
  audioClipTypeLabel: string
  packScopeLabel: string
  timingLabel: string
  scoringLabel: string
  searchText: string
}

const BEHAVIOUR_LABELS: Record<string, string> = {
  standard: "Standard",
  quickfire: "Quickfire",
}

const SOURCE_MODE_LABELS: Record<string, string> = {
  selected_packs: "Host-selected packs",
  specific_packs: "Specific packs",
  all_questions: "All questions",
}

function titleCaseToken(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatLabelList(values: string[]) {
  if (!values.length) return "Any"
  return values.map(titleCaseToken).join(" + ")
}

export function deriveTemplateFamilyName(name: string) {
  return getRoundTemplateDisplayInfo(name).familyName
}

export function deriveTemplateVariantLabel(name: string, familyName?: string) {
  const info = getRoundTemplateDisplayInfo(name)
  if (familyName && info.familyName !== familyName) return info.variantLabel
  return info.variantLabel
}

function firstOrManyLabel(values: string[], fallback: string, kind: string) {
  if (!values.length) return fallback
  if (values.length === 1) return titleCaseToken(values[0])
  return `${values.length} ${kind}`
}

function describeAnswerTypes(answerTypes: string[]) {
  if (!answerTypes.length) return "Any answer"
  if (answerTypes.length === 1) return answerTypes[0].toUpperCase()
  return answerTypes.map((value) => value.toUpperCase()).join(" + ")
}

function describeMediaTypes(mediaTypes: string[]) {
  if (!mediaTypes.length) return "Any media"
  if (mediaTypes.length === 1) return titleCaseToken(mediaTypes[0])
  return mediaTypes.map(titleCaseToken).join(" + ")
}

function describePackScope(
  template: RoundTemplateRow,
  packLabelById: Map<string, string>,
) {
  const defaultPackIds = normaliseDefaultPackIds(template.default_pack_ids)
  const previewLabels = defaultPackIds
    .map((packId) => packLabelById.get(packId) || packId)
    .filter(Boolean)

  if (template.source_mode === "all_questions") return "All questions"
  if (!defaultPackIds.length) return SOURCE_MODE_LABELS[template.source_mode] || titleCaseToken(template.source_mode)

  const preview = previewLabels.slice(0, 2).join(" · ")
  const remaining = previewLabels.length - 2
  const packPreview = remaining > 0 ? `${preview} +${remaining}` : preview

  if (template.source_mode === "specific_packs") return `Specific packs: ${packPreview}`
  return `Host-selected packs · defaults: ${packPreview}`
}

export function buildRoundTemplatePresentation(
  template: RoundTemplateRow,
  options?: {
    packLabelById?: Map<string, string>
    showNameByKey?: Map<string, string>
  },
): RoundTemplatePresentation {
  const packLabelById = options?.packLabelById ?? new Map<string, string>()
  const showNameByKey = options?.showNameByKey ?? new Map<string, string>()
  const rules = normaliseSelectionRules(template.selection_rules)
  const displayInfo = getRoundTemplateDisplayInfo(template)
  const familyName = displayInfo.familyName
  const variantLabel = displayInfo.variantLabel

  const promptTargetLabel = firstOrManyLabel(rules.promptTargets ?? [], "Any prompt", "prompt targets")
  const clueSourceLabel = firstOrManyLabel(rules.clueSources ?? [], "Any clue", "clue sources")
  const primaryShowKeys = rules.primaryShowKeys ?? []
  const showLabel =
    primaryShowKeys.length === 0
      ? "Any show"
      : primaryShowKeys.length === 1
        ? showNameByKey.get(primaryShowKeys[0]) || primaryShowKeys[0]
        : `${primaryShowKeys.length} shows`

  const audioClipTypes = rules.audioClipTypes ?? []
  const audioClipTypeLabel = firstOrManyLabel(audioClipTypes, "Any audio clip", "audio clip types")

  const answerSeconds =
    template.default_answer_seconds == null
      ? `${getDefaultAnswerSecondsForBehaviour(template.behaviour_type)}s default`
      : `${template.default_answer_seconds}s`

  const roundReviewSeconds =
    template.default_round_review_seconds == null
      ? `${getDefaultRoundReviewSecondsForBehaviour(template.behaviour_type)}s default`
      : `${template.default_round_review_seconds}s`

  const scoringLabel = [
    template.counts_towards_score ? "Scores on" : "Scores off",
    template.joker_eligible ? "Joker on" : "Joker off",
  ].join(" · ")

  const searchText = [
    template.name,
    displayInfo.displayName,
    familyName,
    variantLabel,
    template.description ?? "",
    template.behaviour_type,
    template.source_mode,
    describeAnswerTypes(rules.answerTypes ?? []),
    describeMediaTypes(rules.mediaTypes ?? []),
    formatLabelList(rules.promptTargets ?? []),
    formatLabelList(rules.clueSources ?? []),
    primaryShowKeys.map((key) => showNameByKey.get(key) || key).join(" "),
    audioClipTypes.join(" "),
    normaliseDefaultPackIds(template.default_pack_ids)
      .map((id) => packLabelById.get(id) || id)
      .join(" "),
  ]
    .join(" ")
    .toLowerCase()

  return {
    familyName,
    variantLabel,
    behaviourLabel: BEHAVIOUR_LABELS[template.behaviour_type] || titleCaseToken(template.behaviour_type),
    sourceModeLabel: SOURCE_MODE_LABELS[template.source_mode] || titleCaseToken(template.source_mode),
    answerTypeLabel: describeAnswerTypes(rules.answerTypes ?? []),
    mediaTypeLabel: describeMediaTypes(rules.mediaTypes ?? []),
    promptTargetLabel,
    clueSourceLabel,
    showLabel,
    audioClipTypeLabel,
    packScopeLabel: describePackScope(template, packLabelById),
    timingLabel: `Answer ${answerSeconds} · Review ${roundReviewSeconds}`,
    scoringLabel,
    searchText,
  }
}

export function templateMatchesFilters(
  template: RoundTemplateRow,
  filters: RoundTemplateListFilters,
) {
  const rules = normaliseSelectionRules(template.selection_rules)

  if (filters.active === "active" && !template.is_active) return false
  if (filters.active === "inactive" && template.is_active) return false

  if (filters.behaviour !== "all" && template.behaviour_type !== filters.behaviour) return false

  if (filters.answerType !== "all") {
    const answerTypes = rules.answerTypes ?? []
    if (filters.answerType === "any" && answerTypes.length > 0) return false
    if (filters.answerType === "mcq" && !answerTypes.includes("mcq")) return false
    if (filters.answerType === "text" && !answerTypes.includes("text")) return false
  }

  if (filters.mediaType !== "all") {
    const mediaTypes = rules.mediaTypes ?? []
    if (filters.mediaType === "any" && mediaTypes.length > 0) return false
    if (
      (filters.mediaType === "text" || filters.mediaType === "audio" || filters.mediaType === "image") &&
      !mediaTypes.includes(filters.mediaType)
    ) {
      return false
    }
  }

  return true
}
