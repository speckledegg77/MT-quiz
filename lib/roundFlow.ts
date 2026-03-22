import { getDefaultAnswerSecondsForBehaviour, getDefaultRoundReviewSecondsForBehaviour, type EffectiveRoundPlanItem } from "@/lib/roomRoundPlan"

export const UNTIMED_SECONDS = 60 * 60 * 24 * 365
export const ANSWER_AUTO_SUBMIT_GRACE_SECONDS = 2

export function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + Math.max(0, Number(seconds ?? 0)) * 1000)
}

export function cleanPositiveInt(value: unknown, fallback = 0) {
  const parsed = Math.floor(Number(value ?? fallback))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function cleanNonNegativeInt(value: unknown, fallback = 0) {
  const parsed = Math.floor(Number(value ?? fallback))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export function isQuickfireBehaviour(raw: unknown) {
  return String(raw ?? "").trim().toLowerCase() === "quickfire"
}

export function isHeadsUpBehaviour(raw: unknown) {
  return String(raw ?? "").trim().toLowerCase() === "heads_up"
}

export function isQuickfireRound(round: Pick<EffectiveRoundPlanItem, "behaviourType"> | { behaviourType?: unknown } | null | undefined) {
  return isQuickfireBehaviour(round?.behaviourType)
}

export function isHeadsUpRound(round: Pick<EffectiveRoundPlanItem, "behaviourType"> | { behaviourType?: unknown } | null | undefined) {
  return isHeadsUpBehaviour(round?.behaviourType)
}

export function getConfiguredAnswerSecondsForRound(room: any, round: { behaviourType?: unknown; answerSeconds?: unknown } | null | undefined) {
  const roundAnswerSeconds = Number(round?.answerSeconds)
  if (Number.isFinite(roundAnswerSeconds) && roundAnswerSeconds >= 0) {
    return Math.floor(roundAnswerSeconds)
  }

  const roomAnswerSeconds = Number(room?.answer_seconds)
  if (Number.isFinite(roomAnswerSeconds) && roomAnswerSeconds >= 0) {
    return Math.floor(roomAnswerSeconds)
  }

  return getDefaultAnswerSecondsForBehaviour(isQuickfireRound(round) ? "quickfire" : isHeadsUpRound(round) ? "heads_up" : "standard")
}

export function getEffectiveAnswerSeconds(room: any, round: { behaviourType?: unknown; answerSeconds?: unknown } | null | undefined) {
  const configured = getConfiguredAnswerSecondsForRound(room, round)
  return configured > 0 ? configured : UNTIMED_SECONDS
}

export function getEffectiveRoundReviewSecondsForRound(room: any, round: { behaviourType?: unknown; roundReviewSeconds?: unknown } | null | undefined) {
  const roundReviewSeconds = Number(round?.roundReviewSeconds)
  if (Number.isFinite(roundReviewSeconds) && roundReviewSeconds >= 0) {
    return Math.floor(roundReviewSeconds)
  }

  const roomReviewSeconds = Number(room?.countdown_seconds)
  if (Number.isFinite(roomReviewSeconds) && roomReviewSeconds >= 0) {
    return Math.floor(roomReviewSeconds)
  }

  return getDefaultRoundReviewSecondsForBehaviour(isQuickfireRound(round) ? "quickfire" : isHeadsUpRound(round) ? "heads_up" : "standard")
}

export function getRevealDelaySecondsForRound(room: any, round: { behaviourType?: unknown } | null | undefined) {
  if (isQuickfireRound(round) || isHeadsUpRound(round)) return 0
  return cleanNonNegativeInt(room?.reveal_delay_seconds, 0)
}

export function getRevealSecondsForRound(room: any, round: { behaviourType?: unknown } | null | undefined) {
  if (isQuickfireRound(round) || isHeadsUpRound(round)) return 0
  return cleanNonNegativeInt(room?.reveal_seconds, 0)
}


export type StageTimes = {
  closeAt?: string | null
  revealAt?: string | null
  nextAt?: string | null
}

export function stageFromTimes(
  phase: string,
  nowMs: number,
  openAt?: string | null,
  closeAt?: string | null,
  revealAt?: string | null,
  nextAt?: string | null
) {
  if (phase !== "running") return phase

  const open = openAt ? Date.parse(openAt) : 0
  const close = closeAt ? Date.parse(closeAt) : 0
  const reveal = revealAt ? Date.parse(revealAt) : 0
  const next = nextAt ? Date.parse(nextAt) : 0

  if (nowMs < open) return "countdown"
  if (nowMs < close) return "open"
  if (nowMs < reveal) return "wait"
  if (nowMs < next) return "reveal"
  return "needs_advance"
}

export function deriveClientStageFromTimes(serverNow: string | null | undefined, roomTimes: StageTimes | null | undefined, fallback: string) {
  const nowMs = serverNow ? Date.parse(String(serverNow)) : Date.now()
  const closeMs = roomTimes?.closeAt ? Date.parse(String(roomTimes.closeAt)) : Number.NaN
  const revealMs = roomTimes?.revealAt ? Date.parse(String(roomTimes.revealAt)) : Number.NaN
  const nextMs = roomTimes?.nextAt ? Date.parse(String(roomTimes.nextAt)) : Number.NaN

  if (Number.isFinite(closeMs) && nowMs < closeMs) return "open"
  if (Number.isFinite(revealMs) && nowMs < revealMs) return "wait"
  if (Number.isFinite(nextMs) && nowMs < nextMs) return fallback === "needs_advance" ? "needs_advance" : "reveal"
  return fallback
}

export function shouldSuppressQuestionBetweenRounds(params: {
  phase?: unknown
  stage?: unknown
  questionIndex?: unknown
  roundTransitionQuestionIndex?: number | null
}) {
  const phase = String(params.phase ?? "").trim().toLowerCase()
  const stage = String(params.stage ?? "")
  const transitionIndex = params.roundTransitionQuestionIndex

  if (phase === "lobby" || phase === "finished") return false
  if (stage === "round_summary") return false
  if (transitionIndex === null || transitionIndex === undefined) return false

  return Number(params.questionIndex ?? -1) === transitionIndex
}

export function getAnswerWindowLabel(params: { isUntimedAnswers: boolean; isQuickfire: boolean; isHeadsUp?: boolean }) {
  if (params.isHeadsUp) {
    return params.isUntimedAnswers ? "Card stays live" : "Card changes in"
  }

  if (params.isUntimedAnswers) {
    return params.isQuickfire ? "Quickfire window" : "Answer window"
  }

  return params.isQuickfire ? "Quickfire closes in" : "Time remaining"
}

export function buildQuestionTimesForRound(params: {
  now?: Date
  room: any
  round: { behaviourType?: unknown } | null | undefined
}) {
  const now = params.now ?? new Date()
  const openAt = now
  const closeAt = addSeconds(openAt, getEffectiveAnswerSeconds(params.room, params.round) + ANSWER_AUTO_SUBMIT_GRACE_SECONDS)
  const revealAt = addSeconds(closeAt, getRevealDelaySecondsForRound(params.room, params.round))
  const nextAt = addSeconds(revealAt, getRevealSecondsForRound(params.room, params.round))

  return {
    openAt,
    closeAt,
    revealAt,
    nextAt,
  }
}

export function buildPostCloseTimes(params: {
  closedAt?: Date
  room: any
  round: { behaviourType?: unknown } | null | undefined
}) {
  const closedAt = params.closedAt ?? new Date()
  const revealAt = addSeconds(closedAt, getRevealDelaySecondsForRound(params.room, params.round))
  const nextAt = addSeconds(revealAt, getRevealSecondsForRound(params.room, params.round))

  return {
    closeAt: closedAt,
    revealAt,
    nextAt,
  }
}

export function isJokerActiveForRound(params: {
  playerJokerRoundIndex: unknown
  round: { index?: unknown; jokerEligible?: unknown; countsTowardsScore?: unknown; behaviourType?: unknown } | null | undefined
}) {
  const roundIndex = Number(params.round?.index)
  const jokerRoundIndex = Number(params.playerJokerRoundIndex)

  if (!Number.isFinite(roundIndex) || !Number.isFinite(jokerRoundIndex)) return false
  if (params.round?.jokerEligible === false) return false
  if (params.round?.countsTowardsScore === false) return false
  if (isQuickfireRound(params.round) || isHeadsUpRound(params.round)) return false

  return roundIndex === jokerRoundIndex
}

export function getScoreDeltaForRound(params: {
  isCorrect: boolean
  jokerActive: boolean
  countsTowardsScore: boolean
}) {
  if (!params.countsTowardsScore) return 0
  if (params.jokerActive) return params.isCorrect ? 2 : -1
  return params.isCorrect ? 1 : 0
}
