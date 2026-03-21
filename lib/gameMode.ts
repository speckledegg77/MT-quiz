import { isInfiniteRound, isInfiniteRoundPlan, type EffectiveRoundPlanItem, type RoomRoundPlan } from "@/lib/roomRoundPlan"

export type GameStage = "countdown" | "open" | "wait" | "reveal" | "round_summary" | "needs_advance" | string

export function getStageStatusText(stage: GameStage, isInfiniteFinalStage = false) {
  if (stage === "countdown") return "Get ready"
  if (stage === "open") return "Answer now"
  if (stage === "wait") return "Waiting for answers"
  if (stage === "reveal") return "Reveal"
  if (stage === "round_summary") return isInfiniteFinalStage ? "End of game" : "End of round"
  if (stage === "needs_advance") return "Next question"
  return ""
}

export function isInfiniteModeFromRoundPlan(plan: RoomRoundPlan | null | undefined) {
  return isInfiniteRoundPlan(plan)
}

export function isInfiniteModeFromRound(round: Pick<EffectiveRoundPlanItem, "id"> | null | undefined) {
  return isInfiniteRound(round)
}

export function isInfiniteModeFromState(state: any) {
  if (!state) return false
  return (
    Boolean(state?.mode?.isInfinite) ||
    Boolean(state?.flow?.isInfiniteMode) ||
    Boolean(state?.rounds?.current?.isInfinite) ||
    String(state?.gameType ?? "").trim().toLowerCase() === "infinite" ||
    String(state?.roomMode ?? "").trim().toLowerCase() === "infinite" ||
    String(state?.mode ?? "").trim().toLowerCase() === "infinite"
  )
}

export function isInfiniteFinalStage(stage: GameStage, options: { isInfiniteMode?: boolean; isLastQuestionOverall?: boolean } = {}) {
  return Boolean(options.isInfiniteMode) && stage === "round_summary" && Boolean(options.isLastQuestionOverall)
}

export function getInfiniteProgressLabel(currentQuestionNumber: number, totalQuestions: number, phase?: string | null) {
  const current = Math.max(0, Math.floor(Number(currentQuestionNumber) || 0))
  const total = Math.max(0, Math.floor(Number(totalQuestions) || 0))

  if (phase === "finished") {
    return `${current} asked`
  }

  if (total > 0) {
    return `${current} asked of ${total}`
  }

  return `${current} asked so far`
}

export function getStandardProgressLabel(currentQuestionNumber: number, totalQuestions: number) {
  const current = Math.max(0, Math.floor(Number(currentQuestionNumber) || 0))
  const total = Math.max(0, Math.floor(Number(totalQuestions) || 0))
  return `Q${current} of ${total}`
}

export function getGameProgressLabel(options: {
  isInfiniteMode?: boolean
  currentQuestionNumber: number
  totalQuestions: number
  phase?: string | null
}) {
  return options.isInfiniteMode
    ? getInfiniteProgressLabel(options.currentQuestionNumber, options.totalQuestions, options.phase)
    : getStandardProgressLabel(options.currentQuestionNumber, options.totalQuestions)
}

export function getRunBadgeLabel(options: {
  isInfiniteMode?: boolean
  currentRound?: { number?: number | null; name?: string | null } | null
}) {
  if (options.isInfiniteMode) return "Infinite run"
  const number = Math.max(0, Math.floor(Number(options.currentRound?.number) || 0))
  const name = String(options.currentRound?.name ?? "").trim()
  return `R${number}: ${name}`
}
