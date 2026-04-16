import { normaliseSelectionRules, type RoundTemplateRow } from "@/lib/roundTemplates"

type TemplateLike = Pick<RoundTemplateRow, "name" | "selection_rules"> | { name: string; selection_rules?: unknown }

export type RoundTemplateDisplayInfo = {
  rawName: string
  displayName: string
  familyName: string
  variantLabel: string
  isCanonical: boolean
  suggestionReason: string | null
}

function splitDisplayName(displayName: string) {
  const trimmed = String(displayName ?? "").trim()
  if (!trimmed) {
    return {
      familyName: "Unnamed template",
      variantLabel: "Base",
    }
  }

  const colonIndex = trimmed.indexOf(":")
  if (colonIndex > 0) {
    return {
      familyName: trimmed.slice(0, colonIndex).trim() || trimmed,
      variantLabel: trimmed.slice(colonIndex + 1).trim() || "Base",
    }
  }

  const parenMatch = trimmed.match(/^(.*)\(([^)]*)\)\s*$/)
  if (parenMatch) {
    return {
      familyName: parenMatch[1]?.trim() || trimmed,
      variantLabel: parenMatch[2]?.trim() || "Base",
    }
  }

  return {
    familyName: trimmed,
    variantLabel: "Base",
  }
}

export function getCanonicalRoundTemplateName(template: TemplateLike | string) {
  const rawName = typeof template === "string" ? template : template?.name
  const trimmed = String(rawName ?? "").trim()
  if (!trimmed) return ""

  const nameKey = trimmed.toLowerCase()

  if (nameKey === "warm-up" || nameKey === "opening night") return "Opening Night"
  if (nameKey === "shows and creatives" || nameKey === "general show knowledge") return "General Show Knowledge"
  if (nameKey === "songs to shows" || nameKey === "from song to show" || nameKey === "from song to show: standard") {
    return "From Song to Show: Standard"
  }

  if (nameKey === "waxing lyrical" || nameKey === "waxing lyrical (mcq)") return "Waxing Lyrical"
  if (nameKey === "waxing lyrical (text)" || nameKey === "waxing lyrical: hard mode") return "Waxing Lyrical: Hard Mode"

  if (typeof template !== "string") {
    const rules = normaliseSelectionRules(template.selection_rules)
    if (nameKey.startsWith("waxing lyrical")) {
      const answerTypes = rules.answerTypes ?? []
      if (answerTypes.length === 1 && answerTypes[0] === "text") return "Waxing Lyrical: Hard Mode"
      if (answerTypes.includes("mcq")) return "Waxing Lyrical"
    }
  }

  return trimmed
}

export function getRoundTemplateDisplayInfo(template: TemplateLike | string): RoundTemplateDisplayInfo {
  const rawName = typeof template === "string" ? template : String(template?.name ?? "").trim()
  const displayName = getCanonicalRoundTemplateName(template)
  const { familyName, variantLabel } = splitDisplayName(displayName)

  let suggestionReason: string | null = null
  if (rawName && rawName !== displayName) {
    if (rawName.toLowerCase() === "warm-up") suggestionReason = "Uses the agreed host-facing round name"
    else if (rawName.toLowerCase() === "shows and creatives") suggestionReason = "Clarifies the round purpose"
    else if (rawName.toLowerCase() === "songs to shows") suggestionReason = "Folds the older name into the current family"
    else if (rawName.toLowerCase().startsWith("waxing lyrical")) suggestionReason = "Reflects the agreed difficulty naming for the text variant"
    else suggestionReason = "Matches the agreed canonical family naming"
  }

  return {
    rawName,
    displayName,
    familyName,
    variantLabel,
    isCanonical: rawName === displayName,
    suggestionReason,
  }
}

export function getRoundTemplateDisplayName(template: TemplateLike | string) {
  return getRoundTemplateDisplayInfo(template).displayName
}
