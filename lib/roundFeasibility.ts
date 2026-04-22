import { deriveMediaType, type QuestionCandidate } from "@/lib/manualRoundPlanBuilder"
import { getQuickfireIneligibilityReasons, normaliseMediaDurationMs } from "@/lib/quickfireEligibility"
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

function cleanAnswerTypeArray(raw: unknown): Array<"mcq" | "text"> {
  return cleanStringArray(raw).filter((value): value is "mcq" | "text" => {
    return value === "mcq" || value === "text"
  })
}

function normaliseSelectionRules(raw: unknown): RoundSelectionRules {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    mediaTypes: cleanMediaTypeArray(value.mediaTypes),
    answerTypes: cleanAnswerTypeArray(value.answerTypes),
    promptTargets: cleanStringArray(value.promptTargets),
    clueSources: cleanStringArray(value.clueSources),
    primaryShowKeys: cleanStringArray(value.primaryShowKeys),
    audioClipTypes: cleanStringArray(value.audioClipTypes),
    spotlightDifficulties: cleanStringArray(value.spotlightDifficulties ?? value.headsUpDifficulties),
  }
}

function normaliseSourceMode(raw: unknown): RoundSourceMode {
  const value = String(raw ?? "").trim().toLowerCase()
  if (value === "specific_packs") return "specific_packs"
  if (value === "all_questions") return "all_questions"
  return "selected_packs"
}

function normaliseBehaviourType(raw: unknown): RoundBehaviourType {
  const value = String(raw ?? "").trim().toLowerCase()
  if (value === "quickfire") return "quickfire"
  if (value === "spotlight" || value === "heads_up") return "spotlight"
  return "standard"
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

function candidateMatchesRules(candidate: QuestionCandidate, rules: RoundSelectionRules, behaviourType: RoundBehaviourType) {
  if (rules.primaryShowKeys?.length && !rules.primaryShowKeys.includes(candidate.primaryShowKey ?? "")) return false

  if (behaviourType === "spotlight") {
    if (candidate.kind !== "spotlight") return false
    if (rules.spotlightDifficulties?.length && !rules.spotlightDifficulties.includes(candidate.spotlightDifficulty ?? candidate.headsUpDifficulty ?? "")) return false
    return true
  }

  if (candidate.kind !== "question") return false
  if (rules.mediaTypes?.length && !rules.mediaTypes.includes(candidate.mediaType)) return false
  if (rules.answerTypes?.length && !rules.answerTypes.includes(candidate.answerType)) return false
  if (rules.promptTargets?.length && !rules.promptTargets.includes(candidate.promptTarget ?? "")) return false
  if (rules.clueSources?.length && !rules.clueSources.includes(candidate.clueSource ?? "")) return false
  if (rules.audioClipTypes?.length && !rules.audioClipTypes.includes(candidate.audioClipType ?? "")) return false
  return true
}

function pluralise(n: number, singular: string, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`
}

function describeSourceScope(sourceMode: RoundSourceMode, sourcePackIds: string[]) {
  if (sourceMode === "selected_packs") {
    return sourcePackIds.length ? `Using ${pluralise(sourcePackIds.length, "selected pack")}.` : "Using the selected packs."
  }
  if (sourceMode === "all_questions") return "Using every active pack."
  return sourcePackIds.length ? `Using ${pluralise(sourcePackIds.length, "specific pack")}.` : "Using specific packs."
}

function describeSelectionFilters(rules: RoundSelectionRules, behaviourType: RoundBehaviourType) {
  const parts: string[] = []
  if (behaviourType === "spotlight") {
    if (rules.spotlightDifficulties?.length) parts.push(`difficulty: ${rules.spotlightDifficulties.join(", ")}`)
  } else {
    if (rules.mediaTypes?.length) parts.push(`media: ${rules.mediaTypes.join(", ")}`)
    if (rules.answerTypes?.length) parts.push(`answer: ${rules.answerTypes.join(", ")}`)
    if (rules.promptTargets?.length) parts.push(`prompt: ${rules.promptTargets.join(", ")}`)
    if (rules.clueSources?.length) parts.push(`clue: ${rules.clueSources.join(", ")}`)
    if (rules.audioClipTypes?.length) parts.push(`clip: ${rules.audioClipTypes.join(", ")}`)
  }
  if (rules.primaryShowKeys?.length) parts.push(`show: ${rules.primaryShowKeys.join(", ")}`)
  return parts.length ? parts.join(" · ") : null
}

type Edge = { to: number; rev: number; cap: number }
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
  const uniqueIds = [...new Set(validRounds.flatMap((round) => round.eligibleCandidateIds))]
  const itemOffset = 1
  const roundOffset = itemOffset + uniqueIds.length
  const sink = roundOffset + validRounds.length
  const flow = new Dinic(sink + 1)
  const itemNodeById = new Map<string, number>()
  uniqueIds.forEach((id, index) => {
    const node = itemOffset + index
    itemNodeById.set(id, node)
    flow.addEdge(0, node, 1)
  })
  const roundSinkEdges = new Map<string, Edge>()
  validRounds.forEach((round, index) => {
    const roundNode = roundOffset + index
    for (const id of round.eligibleCandidateIds) {
      const itemNode = itemNodeById.get(id)
      if (itemNode !== undefined) flow.addEdge(itemNode, roundNode, 1)
    }
    roundSinkEdges.set(round.id, flow.addEdge(roundNode, sink, round.requestedCount))
  })
  flow.maxFlow(0, sink)
  const result = new Map<string, number>()
  for (const round of validRounds) {
    const edge = roundSinkEdges.get(round.id)
    result.set(round.id, edge ? round.requestedCount - edge.cap : 0)
  }
  return result
}

function buildExplanation(round: InternalRoundEvaluation, assignedCount: number): FeasibilityExplanation {
  if (round.setupError) {
    return { tone: "error", summary: round.setupError, detail: round.scopeDescription, fallback: round.filtersDescription }
  }
  const eligibleCount = round.eligibleCandidateIds.length
  if (eligibleCount <= 0) {
    return {
      tone: "error",
      summary: round.behaviourType === "spotlight" ? "No eligible Spotlight items match this round right now." : "No eligible questions match this round right now.",
      detail: [round.scopeDescription, round.filtersDescription].filter(Boolean).join(" "),
      fallback: null,
    }
  }
  if (assignedCount < round.requestedCount) {
    return {
      tone: "warning",
      summary: `Only ${pluralise(assignedCount, "item")} can be guaranteed under the current overlap.`,
      detail: `This round asks for ${pluralise(round.requestedCount, "item")} and currently has ${pluralise(eligibleCount, "eligible item")}.`,
      fallback: [round.scopeDescription, round.filtersDescription].filter(Boolean).join(" "),
    }
  }
  return {
    tone: "ok",
    summary: `This round can currently be filled with ${pluralise(round.requestedCount, "item")}.`,
    detail: `There are ${pluralise(eligibleCount, "eligible item")} in scope right now.`,
    fallback: round.filtersDescription,
  }
}

export function buildQuestionCandidatesFromPackRows(rows: Array<Record<string, unknown>>): QuestionCandidate[] {
  const candidatesById = new Map<string, QuestionCandidate>()
  for (const row of rows) {
    const packId = String(row?.pack_id ?? "").trim()
    const questionId = String(row?.question_id ?? "").trim()
    if (!packId || !questionId) continue
    const question = (row?.questions ?? {}) as Record<string, unknown>
    const legacyRoundType: "general" | "audio" | "picture" =
      question.round_type === "audio" ? "audio" : question.round_type === "picture" ? "picture" : "general"
    const existing = candidatesById.get(questionId)
    if (existing) {
      if (!existing.packIds.includes(packId)) existing.packIds.push(packId)
      continue
    }
    candidatesById.set(questionId, {
      id: questionId,
      kind: "question",
      legacyRoundType,
      answerType: question.answer_type === "text" ? "text" : "mcq",
      mediaType: deriveMediaType({ mediaType: String(question.media_type ?? "") || null, legacyRoundType }),
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
}): FeasibilitySetResult {
  const evaluations: InternalRoundEvaluation[] = (Array.isArray(params.roundsInput) ? params.roundsInput : []).map((roundRaw, index) => {
    const rawRequestedCount = normaliseCount(roundRaw.questionCount)
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
    const setupError =
      sourceMode === "selected_packs" && sourcePackIds.length === 0
        ? "No selected packs are available for this round."
        : sourceMode === "specific_packs" && sourcePackIds.length === 0
          ? "This round needs at least one specific pack."
          : behaviourType === "spotlight" && sourceMode !== "specific_packs"
            ? "Spotlight rounds must use a specific Spotlight pack."
            : null
    const eligibleCandidateIds = setupError
      ? []
      : params.candidates
          .filter((candidate) => {
            if (sourcePackIds.length > 0 && !candidate.packIds.some((packId) => sourcePackIds.includes(packId))) return false
            if (behaviourType === "quickfire" && getQuickfireIneligibilityReasons(candidate).length > 0) return false
            return candidateMatchesRules(candidate, rules, behaviourType)
          })
          .map((candidate) => candidate.id)

    const requestedCount = behaviourType === "spotlight" ? [...new Set(eligibleCandidateIds)].length : rawRequestedCount

    return {
      id: String(roundRaw.id ?? `round_${index + 1}`).trim() || `round_${index + 1}`,
      name: normaliseRoundName(roundRaw.name, index),
      requestedCount,
      behaviourType,
      sourceMode,
      eligibleCandidateIds: [...new Set(eligibleCandidateIds)],
      setupError,
      notes: behaviourType === "quickfire" ? ["Quickfire pool excludes typed answers and long audio clips."] : behaviourType === "spotlight" ? ["Spotlight uses separate themed packs and does not use phone answers in v1."] : [],
      scopeDescription: describeSourceScope(sourceMode, sourcePackIds),
      filtersDescription: describeSelectionFilters(rules, behaviourType),
    }
  })

  const assignmentCounts = buildAssignmentCounts(evaluations)
  const rounds: FeasibilityRoundResult[] = evaluations.map((evaluation) => {
    const assignedCount = assignmentCounts.get(evaluation.id) ?? 0
    const eligibleCount = evaluation.eligibleCandidateIds.length
    const shortfall = Math.max(0, evaluation.requestedCount - assignedCount)
    return {
      id: evaluation.id,
      name: evaluation.name,
      requestedCount: evaluation.requestedCount,
      eligibleCount,
      assignedCount,
      shortfall,
      feasible: !evaluation.setupError && shortfall === 0,
      setupError: evaluation.setupError,
      behaviourType: evaluation.behaviourType,
      sourceMode: evaluation.sourceMode,
      notes: evaluation.notes,
      explanation: buildExplanation(evaluation, assignedCount),
    }
  })

  const requestedTotal = rounds.reduce((sum, round) => sum + round.requestedCount, 0)
  const assignedTotal = rounds.reduce((sum, round) => sum + round.assignedCount, 0)
  const shortfallTotal = Math.max(0, requestedTotal - assignedTotal)
  const unionEligibleQuestionCount = new Set(evaluations.flatMap((round) => round.eligibleCandidateIds)).size
  const allFeasible = rounds.every((round) => round.feasible)

  const summary: FeasibilitySummary = {
    requestedTotal,
    unionEligibleQuestionCount,
    assignedTotal,
    shortfallTotal,
    allFeasible,
    explanation: allFeasible
      ? {
          tone: "ok",
          summary: `The current setup can fill all ${pluralise(requestedTotal, "requested item")}.`,
          detail: `There are ${pluralise(unionEligibleQuestionCount, "unique eligible item")} across the current set.`,
          fallback: null,
        }
      : {
          tone: shortfallTotal > 0 ? "warning" : "error",
          summary: `The current setup can only guarantee ${pluralise(assignedTotal, "item")} across these rounds.`,
          detail: `Requested: ${requestedTotal}. Shortfall: ${shortfallTotal}. Unique eligible items in scope: ${unionEligibleQuestionCount}.`,
          fallback: null,
        },
  }

  return { rounds, summary }
}
