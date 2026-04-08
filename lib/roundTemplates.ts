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

function parseJsonLikeValue(raw: unknown) {
  if (typeof raw !== "string") return raw
  const value = raw.trim()
  if (!value) return raw
  if (!(value.startsWith("[") || value.startsWith("{"))) return raw
  try {
    return JSON.parse(value)
  } catch {
    return raw
  }
}

export function cleanStringArray(raw: unknown) {
  const parsed = parseJsonLikeValue(raw)
  if (!Array.isArray(parsed)) return [] as string[]
  return parsed.map((value) => String(value ?? "").trim()).filter(Boolean)
}

export function cleanMediaTypes(raw: unknown): Array<"text" | "audio" | "image"> {
  return cleanStringArray(raw).filter(
    (value): value is "text" | "audio" | "image" =>
      value === "text" || value === "audio" || value === "image"
  )
}

export function normalisePackIds(raw: unknown) {
  return [...new Set(cleanStringArray(raw))]
}

export function normaliseSelectionRules(raw: unknown): RoundTemplateSelectionRules {
  const parsed = parseJsonLikeValue(raw)
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
