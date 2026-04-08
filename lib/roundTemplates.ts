export const ROUND_TEMPLATE_BEHAVIOUR_TYPE_VALUES = ["standard", "quickfire"] as const
export const ROUND_TEMPLATE_SOURCE_MODE_VALUES = [
  "selected_packs",
  "specific_packs",
  "all_questions",
] as const

export type RoundTemplateBehaviourType =
  (typeof ROUND_TEMPLATE_BEHAVIOUR_TYPE_VALUES)[number]

export type RoundTemplateSourceMode =
  (typeof ROUND_TEMPLATE_SOURCE_MODE_VALUES)[number]

export type RoundTemplateSelectionRules = {
  mediaTypes?: Array<"text" | "audio" | "image">
  promptTargets?: string[]
  clueSources?: string[]
  primaryShowKeys?: string[]
  audioClipTypes?: string[]
}

export type RoundTemplateRow = {
  id: string
  name: string
  description: string
  behaviour_type: RoundTemplateBehaviourType
  default_question_count: number
  default_answer_seconds?: number | null
  default_round_review_seconds?: number | null
  joker_eligible: boolean
  counts_towards_score: boolean
  source_mode: RoundTemplateSourceMode
  default_pack_ids: unknown
  selection_rules: unknown
  is_active: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}

function parseJsonLike(raw: unknown) {
  if (typeof raw !== "string") return raw
  const value = raw.trim()
  if (!value) return raw
  try {
    return JSON.parse(value)
  } catch {
    return raw
  }
}

export function cleanStringArray(raw: unknown) {
  const value = parseJsonLike(raw)
  if (!Array.isArray(value)) return [] as string[]
  return value.map((item) => String(item ?? "").trim()).filter(Boolean)
}

export function cleanMediaTypes(raw: unknown): Array<"text" | "audio" | "image"> {
  return cleanStringArray(raw).filter(
    (value): value is "text" | "audio" | "image" =>
      value === "text" || value === "audio" || value === "image"
  )
}

export function normaliseSelectionRules(raw: unknown): RoundTemplateSelectionRules {
  const parsed = parseJsonLike(raw)
  const value =
    parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}

  const mediaTypes = cleanMediaTypes(value.mediaTypes)
  const promptTargets = cleanStringArray(value.promptTargets)
  const clueSources = cleanStringArray(value.clueSources)
  const primaryShowKeys = cleanStringArray(value.primaryShowKeys)
  const audioClipTypes = cleanStringArray(value.audioClipTypes)

  const result: RoundTemplateSelectionRules = {}

  if (mediaTypes.length) result.mediaTypes = mediaTypes
  if (promptTargets.length) result.promptTargets = promptTargets
  if (clueSources.length) result.clueSources = clueSources
  if (primaryShowKeys.length) result.primaryShowKeys = primaryShowKeys
  if (audioClipTypes.length) result.audioClipTypes = audioClipTypes

  return result
}

export function firstRuleValue(
  rules: RoundTemplateSelectionRules | unknown,
  key: keyof RoundTemplateSelectionRules
) {
  const normalised = normaliseSelectionRules(rules)
  const value = normalised[key]
  return Array.isArray(value) && value.length ? value[0] : ""
}

export function cleanSourceMode(raw: unknown): RoundTemplateSourceMode {
  const value = String(raw ?? "").trim().toLowerCase()
  if (value === "specific_packs") return "specific_packs"
  if (value === "all_questions") return "all_questions"
  return "selected_packs"
}

export function cleanBehaviourType(raw: unknown): RoundTemplateBehaviourType {
  const value = String(raw ?? "").trim().toLowerCase()
  if (value === "quickfire") return "quickfire"
  return "standard"
}

export function normaliseDefaultPackIds(raw: unknown) {
  return cleanStringArray(raw)
}

export function normaliseRoundTemplateRow(raw: unknown): RoundTemplateRow {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    id: String(value.id ?? "").trim(),
    name: String(value.name ?? "").trim(),
    description: String(value.description ?? ""),
    behaviour_type: cleanBehaviourType(value.behaviour_type),
    default_question_count: Math.max(1, Number(value.default_question_count ?? 1) || 1),
    default_answer_seconds: value.default_answer_seconds == null ? null : Number(value.default_answer_seconds),
    default_round_review_seconds: value.default_round_review_seconds == null ? null : Number(value.default_round_review_seconds),
    joker_eligible: Boolean(value.joker_eligible ?? true),
    counts_towards_score: Boolean(value.counts_towards_score ?? true),
    source_mode: cleanSourceMode(value.source_mode),
    default_pack_ids: normaliseDefaultPackIds(value.default_pack_ids),
    selection_rules: normaliseSelectionRules(value.selection_rules),
    is_active: Boolean(value.is_active ?? true),
    sort_order: Number(value.sort_order ?? 0) || 0,
    created_at: typeof value.created_at === 'string' ? value.created_at : undefined,
    updated_at: typeof value.updated_at === 'string' ? value.updated_at : undefined,
  }
}
