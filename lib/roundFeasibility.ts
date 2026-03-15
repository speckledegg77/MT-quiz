import { deriveMediaType, type QuestionCandidate } from "@/lib/manualRoundPlanBuilder"
import { QUICKFIRE_AUDIO_MAX_DURATION_MS, getQuickfireIneligibilityReasons, normaliseMediaDurationMs } from "@/lib/quickfireEligibility"
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
}

export type FeasibilitySummary = {
  requestedTotal: number
  unionEligibleQuestionCount: number
  assignedTotal: number
  shortfallTotal: number
  allFeasible: boolean
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

      if (behaviourType === "quickfire") {
        notes.push(`Quickfire allows MCQ questions only. Audio clips need media_duration_ms and must be ${QUICKFIRE_AUDIO_MAX_DURATION_MS / 1000} seconds or shorter.`)
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
      }
    }
  )

  const assignedCountByRoundId = buildAssignmentCounts(evaluations)

  const rounds: FeasibilityRoundResult[] = evaluations.map((round) => {
    const eligibleCount = round.eligibleCandidateIds.length
    const assignedCount = round.setupError ? 0 : assignedCountByRoundId.get(round.id) ?? 0
    const shortfall = Math.max(0, round.requestedCount - assignedCount)
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
    }
  })

  const requestedTotal = rounds.reduce((sum, round) => sum + round.requestedCount, 0)
  const unionEligibleQuestionCount = new Set(evaluations.flatMap((round) => round.eligibleCandidateIds)).size
  const assignedTotal = rounds.reduce((sum, round) => sum + round.assignedCount, 0)
  const shortfallTotal = Math.max(0, requestedTotal - assignedTotal)

  return {
    rounds,
    summary: {
      requestedTotal,
      unionEligibleQuestionCount,
      assignedTotal,
      shortfallTotal,
      allFeasible: shortfallTotal === 0 && rounds.every((round) => !round.setupError),
    },
  } satisfies FeasibilitySetResult
}
