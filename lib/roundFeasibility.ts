import { deriveMediaType, type QuestionCandidate } from "@/lib/manualRoundPlanBuilder"
import {
  QUICKFIRE_AUDIO_MAX_DURATION_MS,
  getQuickfireIneligibilityReasons,
  normaliseMediaDurationMs,
} from "@/lib/quickfireEligibility"
import type { RoundBehaviourType, RoundSelectionRules, RoundSourceMode } from "@/lib/roomRoundPlan"

export type RoundFeasibilityInput = {
  id?: string
  name?: string
  questionCount?: number
  behaviourType?: RoundBehaviourType
  sourceMode?: RoundSourceMode
  packIds?: string[]
  selectionRules?: RoundSelectionRules
}

export type FeasibilityTone = "ok" | "warning" | "error"

export type FeasibilityExplanation = {
  tone: FeasibilityTone
  summary: string
  detail: string | null
  fallback: string | null
}

export type FeasibilityRoundResult = {
  id: string
  name: string
  requestedCount: number
  eligibleCount: number
  assignedCount: number
  shortfall: number
  feasible: boolean
  setupError: string | null
  behaviourType: RoundBehaviourType
  sourceMode: RoundSourceMode
  notes: string[]
  explanation: FeasibilityExplanation
}

export type FeasibilitySummary = {
  requestedTotal: number
  unionEligibleQuestionCount: number
  assignedTotal: number
  shortfallTotal: number
  allFeasible: boolean
  explanation: FeasibilityExplanation
}

export type FeasibilitySetResult = {
  rounds: FeasibilityRoundResult[]
  summary: FeasibilitySummary
}

type InternalRoundEvaluation = {
  id: string
  name: string
  requestedCount: number
  behaviourType: RoundBehaviourType
  sourceMode: RoundSourceMode
  eligibleCandidateIds: string[]
  setupError: string | null
  notes: string[]
  scopeDescription: string
  filtersDescription: string | null
}

function cleanStringArray(raw: unknown) {
  if (!Array.isArray(raw)) return [] as string[]
  return raw.map((value) => String(value ?? "").trim()).filter(Boolean)
}

function cleanMediaTypeArray(raw: unknown): Array<"text" | "audio" | "image"> {
  return cleanStringArray(raw).filter((value): value is "text" | "audio" | "image" => {
    return value === "text" || value === "audio" || value === "image"
  })
}

function normaliseSelectionRules(raw: unknown): RoundSelectionRules {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    mediaTypes: cleanMediaTypeArray(value.mediaTypes),
    promptTargets: cleanStringArray(value.promptTargets),
    clueSources: cleanStringArray(value.clueSources),
    primaryShowKeys: cleanStringArray(value.primaryShowKeys),
    audioClipTypes: cleanStringArray(value.audioClipTypes),
  }
}

function normaliseSourceMode(raw: unknown): RoundSourceMode {
  const value = String(raw ?? "").trim().toLowerCase()
  if (value === "specific_packs") return "specific_packs"
  if (value === "all_questions") return "all_questions"
  return "selected_packs"
}

function normaliseBehaviourType(raw: unknown): RoundBehaviourType {
  return String(raw ?? "").trim().toLowerCase() === "quickfire" ? "quickfire" : "standard"
}

function normaliseCount(raw: unknown) {
  const value = Math.floor(Number(raw ?? 0))
  return Number.isFinite(value) && value > 0 ? value : 0
}

function normaliseRoundName(raw: unknown, index: number) {
  const value = String(raw ?? "").trim()
  return value || `Round ${index + 1}`
}

function cleanPackIds(raw: unknown) {
  return [...new Set(cleanStringArray(raw))]
}

function getSourcePackIds(args: {
  sourceMode: RoundSourceMode
  selectedPackIds: string[]
  specificPackIds: string[]
  allPackIds: string[]
}) {
  if (args.sourceMode === "specific_packs") return args.specificPackIds
  if (args.sourceMode === "all_questions") return args.allPackIds
  return args.selectedPackIds
}

function candidateMatchesRules(candidate: QuestionCandidate, rules: RoundSelectionRules) {
  if (rules.mediaTypes?.length && !rules.mediaTypes.includes(candidate.mediaType)) return false
  if (rules.promptTargets?.length && !rules.promptTargets.includes(candidate.promptTarget ?? "")) return false
  if (rules.clueSources?.length && !rules.clueSources.includes(candidate.clueSource ?? "")) return false
  if (rules.primaryShowKeys?.length && !rules.primaryShowKeys.includes(candidate.primaryShowKey ?? "")) return false
  if (rules.audioClipTypes?.length && !rules.audioClipTypes.includes(candidate.audioClipType ?? "")) return false
  return true
}

type Edge = {
  to: number
  rev: number
  cap: number
}

class Dinic {
  graph: Edge[][]

  constructor(private nodeCount: number) {
    this.graph = Array.from({ length: nodeCount }, () => [])
  }

  addEdge(from: number, to: number, cap: number) {
    const forward: Edge = { to, rev: this.graph[to].length, cap }
    const backward: Edge = { to: from, rev: this.graph[from].length, cap: 0 }
    this.graph[from].push(forward)
    this.graph[to].push(backward)
    return forward
  }

  maxFlow(source: number, sink: number) {
    let total = 0
    const level = new Array<number>(this.nodeCount).fill(-1)
    const it = new Array<number>(this.nodeCount).fill(0)

    const bfs = () => {
      level.fill(-1)
      const queue: number[] = [source]
      level[source] = 0
      for (let head = 0; head < queue.length; head++) {
        const node = queue[head]
        for (const edge of this.graph[node]) {
          if (edge.cap <= 0 || level[edge.to] >= 0) continue
          level[edge.to] = level[node] + 1
          queue.push(edge.to)
        }
      }
      return level[sink] >= 0
    }

    const dfs = (node: number, pushed: number): number => {
      if (node === sink) return pushed
      for (; it[node] < this.graph[node].length; it[node]++) {
        const edge = this.graph[node][it[node]]
        if (edge.cap <= 0 || level[edge.to] !== level[node] + 1) continue
        const flow = dfs(edge.to, Math.min(pushed, edge.cap))
        if (flow <= 0) continue
        edge.cap -= flow
        this.graph[edge.to][edge.rev].cap += flow
        return flow
      }
      return 0
    }

    while (bfs()) {
      it.fill(0)
      while (true) {
        const pushed = dfs(source, Number.MAX_SAFE_INTEGER)
        if (!pushed) break
        total += pushed
      }
    }

    return total
  }
}

function buildAssignmentCounts(rounds: InternalRoundEvaluation[]) {
  const validRounds = rounds.filter((round) => !round.setupError && round.requestedCount > 0)
  if (!validRounds.length) return new Map<string, number>()

  const uniqueQuestionIds = [...new Set(validRounds.flatMap((round) => round.eligibleCandidateIds))]
  const questionNodeOffset = 1
  const roundNodeOffset = questionNodeOffset + uniqueQuestionIds.length
  const sink = roundNodeOffset + validRounds.length
  const flow = new Dinic(sink + 1)

  const questionNodeById = new Map<string, number>()
  uniqueQuestionIds.forEach((questionId, index) => {
    const node = questionNodeOffset + index
    questionNodeById.set(questionId, node)
    flow.addEdge(0, node, 1)
  })

  const roundSinkEdges = new Map<string, Edge>()
  validRounds.forEach((round, index) => {
    const roundNode = roundNodeOffset + index
    for (const questionId of round.eligibleCandidateIds) {
      const questionNode = questionNodeById.get(questionId)
      if (questionNode !== undefined) {
        flow.addEdge(questionNode, roundNode, 1)
      }
    }
    const sinkEdge = flow.addEdge(roundNode, sink, round.requestedCount)
    roundSinkEdges.set(round.id, sinkEdge)
  })

  flow.maxFlow(0, sink)

  const result = new Map<string, number>()
  for (const round of validRounds) {
    const sinkEdge = roundSinkEdges.get(round.id)
    const assigned = sinkEdge ? round.requestedCount - sinkEdge.cap : 0
    result.set(round.id, assigned)
  }
  return result
}

function humanise(value: string) {
  return value.replace(/_/g, " ")
}

function pluralise(count: number, singular: string, plural?: string) {
  return count === 1 ? singular : plural ?? `${singular}s`
}

function describeSourceScope(sourceMode: RoundSourceMode, sourcePackIds: string[]) {
  if (sourceMode === "all_questions") return "all active packs"
  if (sourceMode === "specific_packs") {
    if (!sourcePackIds.length) return "the chosen specific packs"
    return `${sourcePackIds.length} specific ${pluralise(sourcePackIds.length, "pack")}`
  }
  if (!sourcePackIds.length) return "the current selected packs"
  return `${sourcePackIds.length} selected ${pluralise(sourcePackIds.length, "pack")}`
}

function describeSelectionFilters(rules: RoundSelectionRules) {
  const filters: string[] = []

  if (rules.mediaTypes?.length) {
    filters.push(`media ${rules.mediaTypes.map((value) => humanise(value)).join(", ")}`)
  }

  if (rules.promptTargets?.length) {
    filters.push(`prompt target ${rules.promptTargets.map((value) => humanise(value)).join(", ")}`)
  }

  if (rules.clueSources?.length) {
    filters.push(`clue source ${rules.clueSources.map((value) => humanise(value)).join(", ")}`)
  }

  if (rules.primaryShowKeys?.length) {
    filters.push(`show ${rules.primaryShowKeys.join(", ")}`)
  }

  if (rules.audioClipTypes?.length) {
    filters.push(`audio clip type ${rules.audioClipTypes.map((value) => humanise(value)).join(", ")}`)
  }

  if (!filters.length) return null
  return filters.join(", ")
}

function getQuickfirePoolHint() {
  return `Quickfire uses MCQ questions only, and audio clips must have a saved duration of ${QUICKFIRE_AUDIO_MAX_DURATION_MS / 1000} seconds or less.`
}

function buildRoundExplanation(args: {
  evaluation: InternalRoundEvaluation
  eligibleCount: number
  assignedCount: number
}) {
  const { evaluation, eligibleCount, assignedCount } = args
  const requestedCount = evaluation.requestedCount
  const scopeSentence = `Scope: ${evaluation.scopeDescription}.`
  const filtersSentence = evaluation.filtersDescription
    ? `Filters: ${evaluation.filtersDescription}.`
    : "No extra metadata filters are active."
  const quickfireSentence =
    evaluation.behaviourType === "quickfire"
      ? getQuickfirePoolHint()
      : null

  if (evaluation.setupError) {
    return {
      tone: "error",
      summary: evaluation.setupError,
      detail: [scopeSentence, evaluation.filtersDescription ? filtersSentence : null, quickfireSentence]
        .filter(Boolean)
        .join(" "),
      fallback:
        evaluation.sourceMode === "selected_packs"
          ? "Select one or more packs, or switch this round to all active packs."
          : evaluation.sourceMode === "specific_packs"
            ? "Choose one or more specific packs for this round."
            : "Review the current pack scope and try again.",
    } satisfies FeasibilityExplanation
  }

  if (requestedCount <= 0) {
    return {
      tone: "error",
      summary: "This round needs at least one question.",
      detail: [scopeSentence, evaluation.filtersDescription ? filtersSentence : null].filter(Boolean).join(" "),
      fallback: "Set a question count greater than 0.",
    } satisfies FeasibilityExplanation
  }

  if (assignedCount >= requestedCount) {
    return {
      tone: "ok",
      summary: `Ready now for ${requestedCount} ${pluralise(requestedCount, "question")}.`,
      detail: [`${eligibleCount} eligible ${pluralise(eligibleCount, "question")} currently match this round.`, scopeSentence, filtersSentence]
        .filter(Boolean)
        .join(" "),
      fallback: null,
    } satisfies FeasibilityExplanation
  }

  if (eligibleCount === 0) {
    return {
      tone: "error",
      summary: "No eligible questions match this round right now.",
      detail: [scopeSentence, filtersSentence, quickfireSentence].filter(Boolean).join(" "),
      fallback:
        evaluation.behaviourType === "quickfire"
          ? "Try more packs, relax the filters, or switch this round to Standard."
          : "Try more packs, relax the filters, or lower the question count.",
    } satisfies FeasibilityExplanation
  }

  if (eligibleCount < requestedCount) {
    return {
      tone: "warning",
      summary: `Only ${eligibleCount} of ${requestedCount} ${pluralise(requestedCount, "question")} are available right now.`,
      detail: [scopeSentence, filtersSentence, quickfireSentence].filter(Boolean).join(" "),
      fallback:
        evaluation.behaviourType === "quickfire"
          ? "Lower the question count, widen the pack scope, relax the filters, or switch this round to Standard."
          : "Lower the question count, widen the pack scope, or relax the filters.",
    } satisfies FeasibilityExplanation
  }

  return {
    tone: "warning",
    summary: `Can only guarantee ${assignedCount} of ${requestedCount} ${pluralise(requestedCount, "question")} once the other rounds are taken into account.`,
    detail: [
      `${eligibleCount} eligible ${pluralise(eligibleCount, "question")} match this round, but some of them are also needed elsewhere in the current setup.`,
      scopeSentence,
      filtersSentence,
    ]
      .filter(Boolean)
      .join(" "),
    fallback: "Reduce overlap by changing packs or filters, or lower the question count.",
  } satisfies FeasibilityExplanation
}

function buildSetExplanation(rounds: FeasibilityRoundResult[], summary: Omit<FeasibilitySummary, "explanation">) {
  if (!rounds.length) {
    return {
      tone: "error",
      summary: "No rounds are selected yet.",
      detail: null,
      fallback: "Add at least one round or template.",
    } satisfies FeasibilityExplanation
  }

  const blockedRounds = rounds.filter((round) => round.explanation.tone === "error")
  const warningRounds = rounds.filter((round) => round.explanation.tone === "warning")

  if (summary.allFeasible) {
    return {
      tone: "ok",
      summary: `All ${rounds.length} ${pluralise(rounds.length, "round")} are ready with the current settings.`,
      detail: `The current setup can assign all ${summary.requestedTotal} requested ${pluralise(summary.requestedTotal, "question")}, with ${summary.unionEligibleQuestionCount} unique eligible questions across the set.`,
      fallback: null,
    } satisfies FeasibilityExplanation
  }

  const statusBits: string[] = []
  if (blockedRounds.length) {
    statusBits.push(`${blockedRounds.length} ${pluralise(blockedRounds.length, "round")} need changes before they can run`)
  }
  if (warningRounds.length) {
    statusBits.push(`${warningRounds.length} ${pluralise(warningRounds.length, "round")} still overlap or fall short`)
  }

  return {
    tone: blockedRounds.length > 0 ? "error" : "warning",
    summary: `Current settings can only guarantee ${summary.assignedTotal} of ${summary.requestedTotal} requested ${pluralise(summary.requestedTotal, "question")}.`,
    detail: [
      statusBits.length ? `${statusBits.join(", ")}.` : null,
      `There are ${summary.unionEligibleQuestionCount} unique eligible ${pluralise(summary.unionEligibleQuestionCount, "question")} across these rounds.`,
    ]
      .filter(Boolean)
      .join(" "),
    fallback: "Lower the counts, widen the pack scope, or relax the filters until every round is ready.",
  } satisfies FeasibilityExplanation
}

export function buildQuestionCandidatesFromPackRows(rows: any[]) {
  const candidatesById = new Map<string, QuestionCandidate>()

  for (const row of rows) {
    const packId = String(row?.pack_id ?? "").trim()
    const questionId = String(row?.question_id ?? "").trim()
    if (!packId || !questionId) continue

    const question = row?.questions ?? {}
    const legacyRoundType: "general" | "audio" | "picture" =
      question.round_type === "audio" ? "audio" : question.round_type === "picture" ? "picture" : "general"

    const existing = candidatesById.get(questionId)
    if (existing) {
      if (!existing.packIds.includes(packId)) existing.packIds.push(packId)
      continue
    }

    candidatesById.set(questionId, {
      id: questionId,
      legacyRoundType,
      answerType: question.answer_type === "text" ? "text" : "mcq",
      mediaType: deriveMediaType({
        mediaType: question.media_type ?? null,
        legacyRoundType,
      }),
      promptTarget: question.prompt_target ? String(question.prompt_target) : null,
      clueSource: question.clue_source ? String(question.clue_source) : null,
      primaryShowKey: question.primary_show_key ? String(question.primary_show_key) : null,
      mediaDurationMs: normaliseMediaDurationMs(question.media_duration_ms),
      audioClipType: question.audio_clip_type ? String(question.audio_clip_type) : null,
      packIds: [packId],
    })
  }

  return [...candidatesById.values()]
}

export function evaluateRoundsFeasibility(params: {
  roundsInput: RoundFeasibilityInput[]
  selectedPackIds: string[]
  allPackIds: string[]
  candidates: QuestionCandidate[]
}) {
  const evaluations: InternalRoundEvaluation[] = (Array.isArray(params.roundsInput) ? params.roundsInput : []).map(
    (roundRaw, index) => {
      const requestedCount = normaliseCount(roundRaw.questionCount)
      const behaviourType = normaliseBehaviourType(roundRaw.behaviourType)
      const sourceMode = normaliseSourceMode(roundRaw.sourceMode)
      const packIds = cleanPackIds(roundRaw.packIds)
      const sourcePackIds = getSourcePackIds({
        sourceMode,
        selectedPackIds: params.selectedPackIds,
        specificPackIds: packIds,
        allPackIds: params.allPackIds,
      })
      const rules = normaliseSelectionRules(roundRaw.selectionRules)
      const notes: string[] = []
      let setupError: string | null = null

      const scopeDescription = describeSourceScope(sourceMode, sourcePackIds)
      const filtersDescription = describeSelectionFilters(rules)

      if (behaviourType === "quickfire") {
        notes.push(getQuickfirePoolHint())
      }

      if (sourceMode === "selected_packs" && sourcePackIds.length === 0) {
        setupError = "No selected packs are available for this round."
      }

      if (sourceMode === "specific_packs" && sourcePackIds.length === 0) {
        setupError = "This round needs at least one specific pack."
      }

      const eligibleCandidateIds = setupError
        ? []
        : params.candidates
            .filter((candidate) => {
              if (sourcePackIds.length > 0) {
                const inScope = candidate.packIds.some((packId) => sourcePackIds.includes(packId))
                if (!inScope) return false
              }
              if (behaviourType === "quickfire") {
                if (getQuickfireIneligibilityReasons(candidate).length > 0) return false
              }
              return candidateMatchesRules(candidate, rules)
            })
            .map((candidate) => candidate.id)

      return {
        id: String(roundRaw.id ?? `round_${index + 1}`).trim() || `round_${index + 1}`,
        name: normaliseRoundName(roundRaw.name, index),
        requestedCount,
        behaviourType,
        sourceMode,
        eligibleCandidateIds: [...new Set(eligibleCandidateIds)],
        setupError,
        notes,
        scopeDescription,
        filtersDescription,
      }
    }
  )

  const assignedCountByRoundId = buildAssignmentCounts(evaluations)

  const rounds: FeasibilityRoundResult[] = evaluations.map((round) => {
    const eligibleCount = round.eligibleCandidateIds.length
    const assignedCount = round.setupError ? 0 : assignedCountByRoundId.get(round.id) ?? 0
    const shortfall = Math.max(0, round.requestedCount - assignedCount)
    const explanation = buildRoundExplanation({
      evaluation: round,
      eligibleCount,
      assignedCount,
    })

    return {
      id: round.id,
      name: round.name,
      requestedCount: round.requestedCount,
      eligibleCount,
      assignedCount,
      shortfall,
      feasible: !round.setupError && shortfall === 0,
      setupError: round.setupError,
      behaviourType: round.behaviourType,
      sourceMode: round.sourceMode,
      notes: round.notes,
      explanation,
    }
  })

  const requestedTotal = rounds.reduce((sum, round) => sum + round.requestedCount, 0)
  const unionEligibleQuestionCount = new Set(evaluations.flatMap((round) => round.eligibleCandidateIds)).size
  const assignedTotal = rounds.reduce((sum, round) => sum + round.assignedCount, 0)
  const shortfallTotal = Math.max(0, requestedTotal - assignedTotal)

  const summaryBase = {
    requestedTotal,
    unionEligibleQuestionCount,
    assignedTotal,
    shortfallTotal,
    allFeasible: shortfallTotal === 0 && rounds.every((round) => !round.setupError),
  }

  return {
    rounds,
    summary: {
      ...summaryBase,
      explanation: buildSetExplanation(rounds, summaryBase),
    },
  } satisfies FeasibilitySetResult
}
