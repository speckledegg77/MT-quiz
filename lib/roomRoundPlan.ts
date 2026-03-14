export type RoomBuildMode = "legacy_pack_mode" | "manual_rounds" | "auto_rounds" | "quick_random"
export type RoundBehaviourType = "standard" | "quickfire"
export type RoundSourceMode = "selected_packs" | "specific_packs" | "all_questions"

export type RoundSelectionRules = {
  mediaTypes?: Array<"text" | "audio" | "image">
  promptTargets?: string[]
  clueSources?: string[]
  primaryShowKeys?: string[]
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

export type EffectiveRoundPlanItem = RoundPlanItem & {
  index: number
  number: number
  startIndex: number
  endIndex: number
  size: number
}

export function getDefaultAnswerSecondsForBehaviour(behaviourType: RoundBehaviourType) {
  return behaviourType === "quickfire" ? 10 : 20
}

export function getDefaultRoundReviewSecondsForBehaviour(behaviourType: RoundBehaviourType) {
  return behaviourType === "quickfire" ? 45 : 30
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
  return "standard"
}

function normaliseSelectionRules(raw: unknown): RoundSelectionRules {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    mediaTypes: cleanStringArray(value.mediaTypes) as Array<"text" | "audio" | "image">,
    promptTargets: cleanStringArray(value.promptTargets),
    clueSources: cleanStringArray(value.clueSources),
    primaryShowKeys: cleanStringArray(value.primaryShowKeys),
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

      return {
        id: String(round.id ?? `round_${index + 1}`).trim() || `round_${index + 1}`,
        name: String(round.name ?? "").trim() || defaultRoundName(index),
        behaviourType: normaliseBehaviourType(round.behaviourType),
        questionCount: Math.max(0, Math.floor(Number(round.questionCount ?? questionIds.length ?? 0)) || questionIds.length),
        jokerEligible: Boolean(round.jokerEligible ?? true),
        countsTowardsScore: Boolean(round.countsTowardsScore ?? true),
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

export function flattenRoundPlanQuestionIds(plan: RoomRoundPlan) {
  return plan.rounds.flatMap((round) => round.questionIds)
}

export function findRoundForQuestionIndex(questionIndex: number, rounds: EffectiveRoundPlanItem[]) {
  const qi = Math.max(0, Math.floor(Number(questionIndex ?? 0)) || 0)
  for (const round of rounds) {
    if (qi >= round.startIndex && qi <= round.endIndex) return round
  }
  return rounds[0]
}

export function countJokerEligibleRounds(rounds: EffectiveRoundPlanItem[]) {
  return rounds.filter((round) => round.jokerEligible).length
}

export function isJokerEnabledForRoundPlan(rounds: EffectiveRoundPlanItem[]) {
  return countJokerEligibleRounds(rounds) >= 2
}

export function getLegacyFieldsFromRoundPlan(plan: RoomRoundPlan) {
  return {
    round_count: plan.rounds.length,
    round_names: plan.rounds.map((round) => round.name),
    question_ids: flattenRoundPlanQuestionIds(plan),
  }
}
