import { getRoundTemplateDisplayInfo } from "@/lib/roundTemplateNaming"

type TemplateLike = { name?: string | null } | string

function normaliseFamilyKey(familyName: string) {
  return String(familyName ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unnamed_template"
}

export function getRoundTemplateFamilyKey(template: TemplateLike) {
  return normaliseFamilyKey(getRoundTemplateDisplayInfo(typeof template === "string" ? template : { name: String(template?.name ?? "") }).familyName)
}

export function countDistinctRoundTemplateFamilies<T extends { name?: string | null }>(templates: T[]) {
  return new Set(templates.map((template) => getRoundTemplateFamilyKey(template))).size
}

function shuffleArray<T>(items: T[]) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = copy[index]
    copy[index] = copy[swapIndex]
    copy[swapIndex] = current
  }
  return copy
}

export function chooseDistinctRoundTemplatesRandomised<T extends { name?: string | null }>(templates: T[], count: number) {
  const shuffled = shuffleArray(templates)
  const chosen: T[] = []
  const usedFamilies = new Set<string>()

  for (const template of shuffled) {
    const familyKey = getRoundTemplateFamilyKey(template)
    if (usedFamilies.has(familyKey)) continue
    usedFamilies.add(familyKey)
    chosen.push(template)
    if (chosen.length >= count) break
  }

  return chosen
}
