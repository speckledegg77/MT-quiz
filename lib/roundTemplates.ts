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
}

export type RoundTemplateRow = {
  id: string
  name: string
  description: string
  behaviour_type: RoundTemplateBehaviourType
  default_question_count: number
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

export function cleanStringArray(raw: unknown) {
  if (!Array.isArray(raw)) return [] as string[]
  return raw.map((value) => String(value ?? "").trim()).filter(Boolean)
}

export function cleanMediaTypes(raw: unknown): Array<"text" | "audio" | "image"> {
  return cleanStringArray(raw).filter(
    (value): value is "text" | "audio" | "image" =>
      value === "text" || value === "audio" || value === "image"
  )
}

export function normaliseSelectionRules(raw: unknown): RoundTemplateSelectionRules {
  const value =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}

  const mediaTypes = cleanMediaTypes(value.mediaTypes)
  const promptTargets = cleanStringArray(value.promptTargets)
  const clueSources = cleanStringArray(value.clueSources)
  const primaryShowKeys = cleanStringArray(value.primaryShowKeys)

  const result: RoundTemplateSelectionRules = {}

  if (mediaTypes.length) result.mediaTypes = mediaTypes
  if (promptTargets.length) result.promptTargets = promptTargets
  if (clueSources.length) result.clueSources = clueSources
  if (primaryShowKeys.length) result.primaryShowKeys = primaryShowKeys

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