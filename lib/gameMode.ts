import { isInfiniteRound, isInfiniteRoundPlan, type EffectiveRoundPlanItem, type RoomRoundPlan } from "@/lib/roomRoundPlan"

export type GameStage = "countdown" | "open" | "wait" | "reveal" | "round_summary" | "needs_advance" | string

function normaliseBehaviourType(raw: unknown) {
  const value = String(raw ?? "").trim().toLowerCase()
  if (value === "quickfire") return "quickfire"
  if (value === "spotlight" || value === "heads_up") return "spotlight"
  return "standard"
}

export function getStageStatusText(stage: GameStage, isInfiniteFinalStage = false) {
  if (stage === "countdown") return "Get ready"
  if (stage === "open") return "Answer now"
  if (stage === "wait") return "Waiting for answers"
  if (stage === "reveal") return "Reveal"
  if (stage === "heads_up_ready") return "Ready for turn"
  if (stage === "heads_up_live") return "Turn live"
  if (stage === "heads_up_review") return "Turn review"
  if (stage === "round_summary") return isInfiniteFinalStage ? "End of game" : "End of round"
  if (stage === "needs_advance") return "Next question"
  return ""
}

export function getStagePillClass(stage: GameStage) {
  if (stage === "open" || stage === "heads_up_live") return "bg-emerald-600/20 text-emerald-200 border-emerald-500/40"
  if (stage === "reveal" || stage === "heads_up_review") return "bg-indigo-600/20 text-indigo-200 border-indigo-500/40"
  if (stage === "round_summary") return "bg-violet-600/20 text-violet-200 border-violet-500/40"
  if (stage === "heads_up_ready") return "bg-amber-600/20 text-amber-200 border-amber-500/40"
  if (stage === "countdown") return "bg-amber-600/20 text-amber-200 border-amber-500/40"
  if (stage === "wait") return "bg-slate-600/20 text-slate-200 border-slate-500/40"
  return "bg-slate-600/20 text-slate-200 border-slate-500/40"
}

export function getRoomStagePillLabel(options: {
  phase?: string | null | undefined
  stage?: GameStage | null | undefined
  isInfiniteMode?: boolean
  isLastQuestionOverall?: boolean
}) {
  const phase = String(options.phase ?? "").trim().toLowerCase()
  const stage = String(options.stage ?? "")

  if (phase === "running") {
    const text = getStageStatusText(stage, isInfiniteFinalStage(stage, {
      isInfiniteMode: options.isInfiniteMode,
      isLastQuestionOverall: options.isLastQuestionOverall,
    }))
    return text || "Running"
  }

  if (phase === "finished") return "Finished"
  return "Lobby"
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

  if (phase === "finished") return `${current} asked`
  if (total > 0) return `${current} asked of ${total}`
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

export function getRoundBehaviourLabel(behaviourType: unknown, options: { isInfiniteMode?: boolean } = {}) {
  if (options.isInfiniteMode) return "Infinite"
  const value = normaliseBehaviourType(behaviourType)
  if (value === "quickfire") return "Quickfire"
  if (value === "spotlight") return "Spotlight"
  return "Standard"
}

export function getRoundBehaviourBadgeClass(behaviourType: unknown, options: { isInfiniteMode?: boolean } = {}) {
  if (options.isInfiniteMode) return "border-sky-500/40 bg-sky-600/10 text-sky-200"
  const value = normaliseBehaviourType(behaviourType)
  if (value === "quickfire") return "border-violet-500/40 bg-violet-600/10 text-violet-200"
  if (value === "spotlight") return "border-amber-500/40 bg-amber-600/10 text-amber-200"
  return "border-emerald-500/40 bg-emerald-600/10 text-emerald-200"
}

export function getRunModeSummaryLabel(options: { isInfiniteMode?: boolean; behaviourType?: unknown }) {
  if (options.isInfiniteMode) return "Infinite run"
  return `${getRoundBehaviourLabel(options.behaviourType)} round`
}
