export const SPOTLIGHT_ITEM_TYPE_VALUES = [
  "show",
  "song",
  "character",
  "person",
  "phrase",
  "other",
] as const

export const SPOTLIGHT_PERSON_ROLE_VALUES = [
  "performer",
  "composer",
  "lyricist",
  "book_writer",
  "director",
  "choreographer",
  "other",
] as const

export const SPOTLIGHT_DIFFICULTY_VALUES = ["easy", "medium", "hard"] as const
export const SPOTLIGHT_SYNTHETIC_ID_PREFIX = "spotlight_item:"
export const LEGACY_SPOTLIGHT_SYNTHETIC_ID_PREFIX = "heads_up_item:"

export type SpotlightItemType = (typeof SPOTLIGHT_ITEM_TYPE_VALUES)[number]
export type SpotlightPersonRole = (typeof SPOTLIGHT_PERSON_ROLE_VALUES)[number]
export type SpotlightDifficulty = (typeof SPOTLIGHT_DIFFICULTY_VALUES)[number]

export function cleanSpotlightItemType(value: string | null | undefined): SpotlightItemType {
  return SPOTLIGHT_ITEM_TYPE_VALUES.includes(value as SpotlightItemType)
    ? (value as SpotlightItemType)
    : "other"
}

export function cleanSpotlightDifficulty(value: string | null | undefined): SpotlightDifficulty {
  return SPOTLIGHT_DIFFICULTY_VALUES.includes(value as SpotlightDifficulty)
    ? (value as SpotlightDifficulty)
    : "medium"
}

export function cleanSpotlightPersonRoles(
  value: string[] | null | undefined,
  itemType: string | null | undefined
): SpotlightPersonRole[] | null {
  if (cleanSpotlightItemType(itemType) !== "person") return null

  const roles = [...new Set((value ?? []).map((item) => item.trim()).filter(Boolean))].filter((item) =>
    SPOTLIGHT_PERSON_ROLE_VALUES.includes(item as SpotlightPersonRole)
  ) as SpotlightPersonRole[]

  return roles.length ? roles : ["other"]
}

export function normaliseSpotlightAnswerText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
}

export function buildSpotlightNaturalKey(params: {
  answerText: string | null | undefined
  itemType: string | null | undefined
  primaryShowKey: string | null | undefined
}) {
  return [
    cleanSpotlightItemType(params.itemType),
    String(params.primaryShowKey ?? "").trim().toLowerCase(),
    normaliseSpotlightAnswerText(params.answerText),
  ].join("::")
}

export function buildSpotlightSyntheticQuestionId(itemId: string | null | undefined) {
  const safeItemId = String(itemId ?? "").trim()
  return safeItemId ? `${SPOTLIGHT_SYNTHETIC_ID_PREFIX}${safeItemId}` : ""
}

export function parseSpotlightSyntheticQuestionId(questionId: string | null | undefined) {
  const value = String(questionId ?? "").trim()
  if (value.startsWith(SPOTLIGHT_SYNTHETIC_ID_PREFIX)) {
    const itemId = value.slice(SPOTLIGHT_SYNTHETIC_ID_PREFIX.length).trim()
    return itemId || null
  }
  if (value.startsWith(LEGACY_SPOTLIGHT_SYNTHETIC_ID_PREFIX)) {
    const itemId = value.slice(LEGACY_SPOTLIGHT_SYNTHETIC_ID_PREFIX.length).trim()
    return itemId || null
  }
  return null
}

export function isSpotlightSyntheticQuestionId(questionId: string | null | undefined) {
  return Boolean(parseSpotlightSyntheticQuestionId(questionId))
}
