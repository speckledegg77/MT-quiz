export const HEADS_UP_ITEM_TYPE_VALUES = [
  "show",
  "song",
  "character",
  "person",
  "phrase",
  "other",
] as const

export const HEADS_UP_PERSON_ROLE_VALUES = [
  "performer",
  "composer",
  "lyricist",
  "book_writer",
  "director",
  "choreographer",
  "other",
] as const

export const HEADS_UP_DIFFICULTY_VALUES = ["easy", "medium", "hard"] as const

export type HeadsUpItemType = (typeof HEADS_UP_ITEM_TYPE_VALUES)[number]
export type HeadsUpPersonRole = (typeof HEADS_UP_PERSON_ROLE_VALUES)[number]
export type HeadsUpDifficulty = (typeof HEADS_UP_DIFFICULTY_VALUES)[number]

export function cleanHeadsUpItemType(value: string | null | undefined): HeadsUpItemType {
  return HEADS_UP_ITEM_TYPE_VALUES.includes(value as HeadsUpItemType)
    ? (value as HeadsUpItemType)
    : "other"
}

export function cleanHeadsUpDifficulty(value: string | null | undefined): HeadsUpDifficulty {
  return HEADS_UP_DIFFICULTY_VALUES.includes(value as HeadsUpDifficulty)
    ? (value as HeadsUpDifficulty)
    : "medium"
}

export function cleanHeadsUpPersonRoles(
  value: string[] | null | undefined,
  itemType: string | null | undefined
): HeadsUpPersonRole[] | null {
  if (cleanHeadsUpItemType(itemType) !== "person") return null

  const roles = [...new Set((value ?? []).map((item) => item.trim()).filter(Boolean))].filter((item) =>
    HEADS_UP_PERSON_ROLE_VALUES.includes(item as HeadsUpPersonRole)
  ) as HeadsUpPersonRole[]

  return roles.length ? roles : ["other"]
}
