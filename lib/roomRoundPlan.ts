export type RoomBuildMode = "legacy_pack_mode" | "manual_rounds" | "auto_rounds" | "quick_random"
export type RoundBehaviourType = "standard" | "quickfire" | "heads_up"
export type RoundSourceMode = "selected_packs" | "specific_packs" | "all_questions"

export type RoundSelectionRules = {
  mediaTypes?: Array<"text" | "audio" | "image">
  promptTargets?: string[]
  clueSources?: string[]
  primaryShowKeys?: string[]
  audioClipTypes?: string[]
  headsUpDifficulties?: string[]
}

export type RoundPlanItem = {
  id: string
  name: string
  behaviourType: RoundBehaviourType
  questionCount: number
  jokerEligible: boolean
  countsTowardsScore: boolean
  sourceMode: RoundSourceMode
  packIds: string[]
  selectionRules: RoundSelectionRules
  answerSeconds?: number
  roundReviewSeconds?: number
  questionIds: string[]
}

export type RoomRoundPlan = {
  buildMode: RoomBuildMode
  rounds: RoundPlanItem[]
}

export const SIMPLE_INFINITE_ROUND_ID = "simple_infinite_round"

export type EffectiveRoundPlanItem = RoundPlanItem & {
  index: number
  number: number
  startIndex: number
  endIndex: number
  size: number
}

export function getDefaultAnswerSecondsForBehaviour(behaviourType: RoundBehaviourType) {
  if (behaviourType === "quickfire") return 10
  if (behaviourType === "heads_up") return 45
  return 20
}

export function getDefaultRoundReviewSecondsForBehaviour(behaviourType: RoundBehaviourType) {
  if (behaviourType === "quickfire") return 45
  if (behaviourType === "heads_up") return 20
  return 30
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function defaultRoundName(index: number) {
  return `Round ${index + 1}`
}

function cleanOptionalNonNegativeInt(raw: unknown) {
  const value = Math.floor(Number(raw))
  if (!Number.isFinite(value) || value < 0) return undefined
  return clampInt(value, 0, 120)
}

function normaliseRoundCount(raw: unknown, questionCount: number) {
  const qc = Math.max(1, Math.floor(Number(questionCount ?? 0)) || 1)
  const requested = Math.floor(Number(raw ?? 4))
  const safe = Number.isFinite(requested) ? requested : 4
  const capped = clampInt(safe, 1, 20)
  return Math.min(capped, qc)
}

function normaliseRoundNames(raw: unknown, count: number) {
  const arr = Array.isArray(raw) ? raw : []
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const name = String(arr[i] ?? "").trim()
    out.push(name || defaultRoundName(i))
  }
  return out
}

function cleanQuestionIds(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return raw.map((value) => String(value ?? "").trim()).filter(Boolean)
}

function cleanStringArray(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return raw.map((value) => String(value ?? "").trim()).filter(Boolean)
}

function normaliseBuildMode(raw: unknown): RoomBuildMode {
  const value = String(raw ?? "").trim().toLowerCase()
  if (value === "manual_rounds") return "manual_rounds"
  if (value === "auto_rounds") return "auto_rounds"
  if (value === "quick_random") return "quick_random"
  return "legacy_pack_mode"
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
  if (value === "heads_up") return "heads_up"
  return "standard"
}

function normaliseSelectionRules(raw: unknown): RoundSelectionRules {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    mediaTypes: cleanStringArray(value.mediaTypes) as Array<"text" | "audio" | "image">,
    promptTargets: cleanStringArray(value.promptTargets),
    clueSources: cleanStringArray(value.clueSources),
    primaryShowKeys: cleanStringArray(value.primaryShowKeys),
    audioClipTypes: cleanStringArray(value.audioClipTypes),
    headsUpDifficulties: cleanStringArray(value.headsUpDifficulties),
  }
}

export function buildLegacyRoomRoundPlan(
  questionIdsRaw: unknown,
  roundCountRaw: unknown,
  roundNamesRaw: unknown,
  buildModeRaw: unknown = "legacy_pack_mode"
): RoomRoundPlan {
  const questionIds = cleanQuestionIds(questionIdsRaw)
  const questionCount = Math.max(1, questionIds.length || 1)
  const roundCount = normaliseRoundCount(roundCountRaw, questionCount)
  const roundNames = normaliseRoundNames(roundNamesRaw, roundCount)

  const base = Math.floor(questionCount / roundCount)
  const rem = questionCount % roundCount

  const rounds: RoundPlanItem[] = []
  let start = 0

  for (let i = 0; i < roundCount; i++) {
    const size = base + (i < rem ? 1 : 0)
    const end = start + size
    const slice = questionIds.slice(start, end)

    rounds.push({
      id: `legacy_round_${i + 1}`,
      name: roundNames[i] ?? defaultRoundName(i),
      behaviourType: "standard",
      questionCount: slice.length,
      jokerEligible: true,
      countsTowardsScore: true,
      sourceMode: "selected_packs",
      packIds: [],
      selectionRules: {},
      answerSeconds: getDefaultAnswerSecondsForBehaviour("standard"),
      roundReviewSeconds: getDefaultRoundReviewSecondsForBehaviour("standard"),
      questionIds: slice,
    })

    start = end
  }

  return {
    buildMode: normaliseBuildMode(buildModeRaw),
    rounds,
  }
}

function normaliseStoredRoundPlan(raw: unknown): RoomRoundPlan | null {
  if (!raw || typeof raw !== "object") return null

  const value = raw as Record<string, unknown>
  const roundsRaw = Array.isArray(value.rounds) ? value.rounds : null
  if (!roundsRaw || roundsRaw.length === 0) return null

  const rounds: RoundPlanItem[] = roundsRaw
    .map((roundRaw, index) => {
      const round = roundRaw && typeof roundRaw === "object" ? (roundRaw as Record<string, unknown>) : {}
      const questionIds = cleanQuestionIds(round.questionIds)
      const behaviourType = normaliseBehaviourType(round.behaviourType)

      return {
        id: String(round.id ?? `round_${index + 1}`).trim() || `round_${index + 1}`,
        name: String(round.name ?? "").trim() || defaultRoundName(index),
        behaviourType,
        questionCount: Math.max(0, Math.floor(Number(round.questionCount ?? questionIds.length ?? 0)) || questionIds.length),
        jokerEligible: behaviourType === "heads_up" ? false : Boolean(round.jokerEligible ?? true),
        countsTowardsScore: behaviourType === "heads_up" ? false : Boolean(round.countsTowardsScore ?? true),
        sourceMode: normaliseSourceMode(round.sourceMode),
        packIds: cleanStringArray(round.packIds),
        selectionRules: normaliseSelectionRules(round.selectionRules),
        answerSeconds: cleanOptionalNonNegativeInt(round.answerSeconds),
        roundReviewSeconds: cleanOptionalNonNegativeInt(round.roundReviewSeconds),
        questionIds,
      }
    })
    .filter((round) => round.questionIds.length > 0)

  if (!rounds.length) return null

  return {
    buildMode: normaliseBuildMode(value.buildMode),
    rounds,
  }
}

export function getEffectiveRoomRoundPlan(room: any): RoomRoundPlan {
  const stored = normaliseStoredRoundPlan(room?.round_plan)
  if (stored) return stored

  return buildLegacyRoomRoundPlan(
    Array.isArray(room?.question_ids) ? room.question_ids : [],
    room?.round_count,
    room?.round_names,
    room?.build_mode
  )
}

export function materialiseRoundPlan(plan: RoomRoundPlan): EffectiveRoundPlanItem[] {
  let startIndex = 0

  return plan.rounds.map((round, index) => {
    const size = round.questionIds.length
    const endIndex = startIndex + size - 1
    const item: EffectiveRoundPlanItem = {
      ...round,
      index,
      number: index + 1,
      startIndex,
      endIndex,
      size,
    }
    startIndex = endIndex + 1
    return item
  })
}

export function findRoundForQuestionIndex(questionIndex: number, roundPlan: EffectiveRoundPlanItem[]) {
  const safeIndex = Math.max(0, Math.floor(Number(questionIndex ?? 0)) || 0)
  const matched = roundPlan.find((round) => safeIndex >= round.startIndex && safeIndex <= round.endIndex)
  return matched ?? roundPlan[roundPlan.length - 1]
}

export function countJokerEligibleRounds(roundPlan: EffectiveRoundPlanItem[] | RoundPlanItem[]) {
  return (roundPlan ?? []).filter((round) => round.jokerEligible !== false && round.countsTowardsScore !== false).length
}

export function isJokerEnabledForRoundPlan(plan: EffectiveRoundPlanItem[] | RoomRoundPlan | null | undefined) {
  const rounds = Array.isArray(plan) ? plan : plan?.rounds ?? []
  return countJokerEligibleRounds(rounds as any) > 0
}

export function getLegacyFieldsFromRoundPlan(plan: RoomRoundPlan) {
  const roundPlan = materialiseRoundPlan(plan)
  const question_ids = roundPlan.flatMap((round) => round.questionIds)
  return {
    question_ids,
    round_count: roundPlan.length,
    round_names: roundPlan.map((round) => round.name),
  }
}

export function isInfiniteRound(round: Pick<RoundPlanItem, "id"> | null | undefined) {
  return String(round?.id ?? "").trim() === SIMPLE_INFINITE_ROUND_ID
}

export function isInfiniteRoundPlan(plan: RoomRoundPlan | null | undefined) {
  return Boolean(plan && Array.isArray(plan.rounds) && plan.rounds.length === 1 && isInfiniteRound(plan.rounds[0]))
}
