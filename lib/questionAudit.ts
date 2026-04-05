import type { QuestionRowForMetadata } from "@/lib/questionMetadata"
import { normaliseTextAnswer } from "@/lib/textAnswers"

export type AuditIssue = {
  code: string
  message: string
}

export type HelperSuggestion = {
  label: string
  value: string
  reason: string
}

export type TextAnswerAuditDetail = {
  canonicalRaw: string
  canonicalNormalised: string
  acceptedAnswers: string[]
  acceptedNormalised: string[]
  helperSuggestions: HelperSuggestion[]
  issues: AuditIssue[]
  needsAcceptedAnswersReview: boolean
}

export type McqOptionAudit = {
  index: number
  label: string
  value: string
  normalised: string
}

export type McqAuditDetail = {
  options: McqOptionAudit[]
  issues: AuditIssue[]
  duplicateOptionGroups: string[][]
}

export type QuestionAnswerAudit = {
  codes: string[]
  likelyProblem: boolean
  summaryBadges: string[]
  textNeedsAcceptedAnswersReview: boolean
  mcqHasIssues: boolean
  text: TextAnswerAuditDetail | null
  mcq: McqAuditDetail | null
}

function cleanString(value: unknown) {
  return String(value ?? "").trim()
}

export function parseAcceptedAnswers(value: unknown): string[] {
  if (Array.isArray(value)) {
    return dedupeDisplayValues(value.map((item) => cleanString(item)).filter(Boolean))
  }

  const cleaned = cleanString(value)
  if (!cleaned) return []

  if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
    try {
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed)) {
        return dedupeDisplayValues(parsed.map((item) => cleanString(item)).filter(Boolean))
      }
    } catch {
      // ignore and fall through to pipe parsing
    }
  }

  if (cleaned.includes("|")) {
    return dedupeDisplayValues(
      cleaned
        .split("|")
        .map((item) => cleanString(item))
        .filter(Boolean)
    )
  }

  return dedupeDisplayValues([cleaned])
}

export function parseMcqOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item ?? "")).slice(0, 4)
}

function dedupeDisplayValues(values: string[]) {
  const seen = new Set<string>()
  const out: string[] = []

  for (const value of values) {
    const key = normaliseTextAnswer(value)
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }

  return out
}

function buildHelperSuggestions(answerText: string, acceptedAnswers: string[]) {
  const existing = new Set<string>([answerText, ...acceptedAnswers].map((value) => normaliseTextAnswer(value)).filter(Boolean))
  const suggestions: HelperSuggestion[] = []

  const articleless = answerText.replace(/^(the|a|an)\s+/i, "").trim()
  if (articleless && articleless !== answerText && !existing.has(normaliseTextAnswer(articleless))) {
    suggestions.push({
      label: "Add without leading article",
      value: articleless,
      reason: "Players often omit the opening article when they type a title.",
    })
  }

  if (/&/.test(answerText)) {
    const andVariant = answerText.replace(/&/g, "and").replace(/\s+/g, " ").trim()
    if (andVariant && andVariant !== answerText && !existing.has(normaliseTextAnswer(andVariant))) {
      suggestions.push({
        label: "Add with ‘and’",
        value: andVariant,
        reason: "Players often type ‘and’ instead of ‘&’.",
      })
    }
  }

  if (/\band\b/i.test(answerText)) {
    const ampersandVariant = answerText.replace(/\band\b/gi, "&").replace(/\s+/g, " ").trim()
    if (ampersandVariant && ampersandVariant !== answerText && !existing.has(normaliseTextAnswer(ampersandVariant))) {
      suggestions.push({
        label: "Add with ‘&’",
        value: ampersandVariant,
        reason: "Players often type ‘&’ instead of ‘and’.",
      })
    }
  }

  return suggestions
}

function analyseTextAnswer(answerTextRaw: unknown, acceptedAnswersRaw: unknown): TextAnswerAuditDetail {
  const canonicalRaw = cleanString(answerTextRaw)
  const canonicalNormalised = normaliseTextAnswer(canonicalRaw)
  const acceptedAnswers = parseAcceptedAnswers(acceptedAnswersRaw)
  const acceptedNormalised = acceptedAnswers.map((value) => normaliseTextAnswer(value)).filter(Boolean)
  const issues: AuditIssue[] = []

  if (!canonicalRaw) {
    issues.push({
      code: "missing_canonical_answer",
      message: "This text-answer question has no canonical answer_text saved.",
    })
  }

  const acceptedDuplicateCount = acceptedAnswers.length - new Set(acceptedNormalised).size
  if (acceptedDuplicateCount > 0) {
    issues.push({
      code: "duplicate_accepted_answers",
      message: "Some accepted answers collapse to the same normalised value.",
    })
  }

  const acceptedEquivalentToCanonical = acceptedNormalised.some(
    (value) => value && value === canonicalNormalised
  )
  if (acceptedEquivalentToCanonical) {
    issues.push({
      code: "redundant_accepted_answer",
      message: "At least one accepted answer normalises to the same value as the canonical answer.",
    })
  }

  const helperSuggestions = canonicalRaw ? buildHelperSuggestions(canonicalRaw, acceptedAnswers) : []
  const tokenCount = canonicalNormalised ? canonicalNormalised.split(" ").filter(Boolean).length : 0
  const looksLong = canonicalRaw.length >= 24 || tokenCount >= 4
  const hasSubtitleStylePunctuation = /[:()\-]/.test(canonicalRaw)
  const hasComma = /,/.test(canonicalRaw)
  const hasLeadingArticle = /^(the|a|an)\s+/i.test(canonicalRaw)
  const hasAmpersand = /&/.test(canonicalRaw) || /\band\b/i.test(canonicalRaw)

  const needsAcceptedAnswersReview =
    Boolean(canonicalRaw) &&
    acceptedAnswers.length === 0 &&
    (helperSuggestions.length > 0 || hasSubtitleStylePunctuation || hasComma || looksLong || hasLeadingArticle || hasAmpersand)

  if (needsAcceptedAnswersReview) {
    issues.push({
      code: "needs_accepted_answers_review",
      message: "This title is worth a quick accepted-answers review before live play.",
    })
  }

  return {
    canonicalRaw,
    canonicalNormalised,
    acceptedAnswers,
    acceptedNormalised,
    helperSuggestions,
    issues,
    needsAcceptedAnswersReview,
  }
}

function analyseMcqOptions(optionsRaw: unknown, answerIndexRaw: unknown): McqAuditDetail {
  const rawOptions = parseMcqOptions(optionsRaw)
  const options = [0, 1, 2, 3].map((index) => {
    const value = String(rawOptions[index] ?? "")
    return {
      index,
      label: String.fromCharCode(65 + index),
      value,
      normalised: normaliseTextAnswer(value),
    }
  })

  const issues: AuditIssue[] = []

  const blankOptionCount = options.filter((option) => !option.value.trim()).length
  if (blankOptionCount > 0) {
    issues.push({
      code: "blank_mcq_option",
      message: "One or more MCQ options are blank.",
    })
  }

  const answerIndex = Number(answerIndexRaw)
  if (!Number.isFinite(answerIndex) || answerIndex < 0 || answerIndex > 3) {
    issues.push({
      code: "invalid_answer_index",
      message: "The correct answer index is missing or outside A to D.",
    })
  }

  const duplicatesByNormalised = new Map<string, string[]>()
  for (const option of options) {
    if (!option.normalised) continue
    const current = duplicatesByNormalised.get(option.normalised) ?? []
    current.push(option.label)
    duplicatesByNormalised.set(option.normalised, current)
  }

  const duplicateOptionGroups = Array.from(duplicatesByNormalised.values()).filter((group) => group.length > 1)
  if (duplicateOptionGroups.length > 0) {
    issues.push({
      code: "duplicate_mcq_options",
      message: "At least two MCQ options collapse to the same value.",
    })
  }

  return {
    options,
    issues,
    duplicateOptionGroups,
  }
}

export function analyseQuestionAnswerAudit(question: Pick<QuestionRowForMetadata, "answer_type" | "answer_text" | "accepted_answers"> & {
  options?: unknown
  answer_index?: unknown
}): QuestionAnswerAudit {
  const answerType = cleanString(question.answer_type).toLowerCase()
  const text = answerType === "text" ? analyseTextAnswer(question.answer_text, question.accepted_answers) : null
  const mcq = answerType === "mcq" ? analyseMcqOptions(question.options, question.answer_index) : null

  const codes = [...(text?.issues ?? []), ...(mcq?.issues ?? [])].map((issue) => issue.code)
  const likelyProblem = Boolean(text?.issues.length || mcq?.issues.length)
  const summaryBadges: string[] = []

  if (text?.needsAcceptedAnswersReview) summaryBadges.push("accepted review")
  if (text?.issues.some((issue) => issue.code === "missing_canonical_answer")) summaryBadges.push("missing canonical")
  if (mcq?.issues.some((issue) => issue.code === "duplicate_mcq_options")) summaryBadges.push("duplicate options")
  if (mcq?.issues.some((issue) => issue.code === "invalid_answer_index")) summaryBadges.push("check correct option")
  if (mcq?.issues.some((issue) => issue.code === "blank_mcq_option")) summaryBadges.push("blank option")

  return {
    codes,
    likelyProblem,
    summaryBadges: summaryBadges.slice(0, 3),
    textNeedsAcceptedAnswersReview: Boolean(text?.needsAcceptedAnswersReview),
    mcqHasIssues: Boolean(mcq?.issues.length),
    text,
    mcq,
  }
}

export function matchesAuditFilter(audit: QuestionAnswerAudit, answerTypeRaw: unknown, filterRaw: string | null | undefined) {
  const filter = cleanString(filterRaw)
  const answerType = cleanString(answerTypeRaw).toLowerCase()

  if (!filter) return true
  if (filter === "likely_answer_issues") return audit.likelyProblem
  if (filter === "text_likely_problems") return answerType === "text" && audit.likelyProblem
  if (filter === "text_needs_accepted_review") return answerType === "text" && audit.textNeedsAcceptedAnswersReview
  if (filter === "mcq_review") return answerType === "mcq"
  if (filter === "mcq_has_issues") return answerType === "mcq" && audit.mcqHasIssues

  return true
}
