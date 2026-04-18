import { normaliseRoundTemplateRow, type RoundTemplateRow } from "@/lib/roundTemplates"

const HOST_TEMPLATE_NAME_MAP: Record<string, string> = {
  "warm-up": "Opening Night",
  "shows and creatives": "General Show Knowledge",
  "songs to shows": "From Song to Show: Standard",
  "waxing lyrical (mcq)": "Waxing Lyrical",
  "waxing lyrical (text)": "Waxing Lyrical: Hard Mode",
}

const HIDDEN_HOST_TEMPLATE_NAMES = new Set([
  "audio round",
  "picture round",
  "typed answers",
])

const HIDDEN_HOST_PACK_NAMES = new Set([
  "audio round",
  "picture round",
  "typed answers",
])

function cleanName(value: unknown) {
  return String(value ?? "").trim()
}

function normalisedNameKey(value: unknown) {
  return cleanName(value).toLowerCase()
}

export function getHostTemplateDisplayName(name: unknown) {
  const raw = cleanName(name)
  return HOST_TEMPLATE_NAME_MAP[normalisedNameKey(raw)] ?? raw
}

export function shouldHideTemplateFromHost(name: unknown) {
  return HIDDEN_HOST_TEMPLATE_NAMES.has(normalisedNameKey(name))
}

function scoreTemplateForHost(template: RoundTemplateRow) {
  const rawName = cleanName(template.name)
  const canonicalName = getHostTemplateDisplayName(rawName)
  const exactCanonicalMatch = rawName === canonicalName ? 1 : 0
  const updatedAt = Date.parse(String(template.updated_at ?? ""))
  const updatedScore = Number.isFinite(updatedAt) ? updatedAt : 0
  const described = cleanName(template.description) ? 1 : 0
  return [exactCanonicalMatch, described, updatedScore] as const
}

export function getVisibleHostTemplates(rawTemplates: unknown[]) {
  const normalised = rawTemplates.map(normaliseRoundTemplateRow)
  const grouped = new Map<string, RoundTemplateRow[]>()

  for (const template of normalised) {
    if (!template.is_active) continue
    if (shouldHideTemplateFromHost(template.name)) continue
    const canonicalName = getHostTemplateDisplayName(template.name)
    const key = canonicalName.toLowerCase()
    const next = { ...template, name: canonicalName }
    grouped.set(key, [...(grouped.get(key) ?? []), next])
  }

  const visible: RoundTemplateRow[] = []

  for (const templates of grouped.values()) {
    const ordered = [...templates].sort((a, b) => {
      const aScore = scoreTemplateForHost(a)
      const bScore = scoreTemplateForHost(b)
      if (aScore[0] !== bScore[0]) return bScore[0] - aScore[0]
      if (aScore[1] !== bScore[1]) return bScore[1] - aScore[1]
      if (aScore[2] !== bScore[2]) return bScore[2] - aScore[2]
      return a.id.localeCompare(b.id)
    })
    visible.push(ordered[0])
  }

  return visible.sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name)
    if (nameCompare !== 0) return nameCompare
    return a.id.localeCompare(b.id)
  })
}

export function shouldHidePackFromHost(displayName: unknown) {
  return HIDDEN_HOST_PACK_NAMES.has(normalisedNameKey(displayName))
}
