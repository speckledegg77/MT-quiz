import type { EffectiveRoundPlanItem } from "@/lib/roomRoundPlan"

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

export function isQuickfireRound(round: Pick<EffectiveRoundPlanItem, "behaviourType"> | { behaviourType?: unknown } | null | undefined) {
  return isQuickfireBehaviour(round?.behaviourType)
}

export function getEffectiveAnswerSeconds(room: any) {
  const rawAnswerSeconds = Number(room?.answer_seconds ?? 0)
  return Number.isFinite(rawAnswerSeconds) && rawAnswerSeconds > 0 ? rawAnswerSeconds : UNTIMED_SECONDS
}

export function getRevealDelaySecondsForRound(room: any, round: { behaviourType?: unknown } | null | undefined) {
  if (isQuickfireRound(round)) return 0
  return cleanNonNegativeInt(room?.reveal_delay_seconds, 0)
}

export function getRevealSecondsForRound(room: any, round: { behaviourType?: unknown } | null | undefined) {
  if (isQuickfireRound(round)) return 0
  return cleanNonNegativeInt(room?.reveal_seconds, 0)
}

export function buildQuestionTimesForRound(params: {
  now?: Date
  room: any
  round: { behaviourType?: unknown } | null | undefined
}) {
  const now = params.now ?? new Date()
  const openAt = now
  const closeAt = addSeconds(openAt, getEffectiveAnswerSeconds(params.room) + ANSWER_AUTO_SUBMIT_GRACE_SECONDS)
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
  if (isQuickfireRound(params.round)) return false

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
