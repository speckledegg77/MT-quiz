import { createHeadsUpReadyState, deriveHeadsUpStage, getHeadsUpReadyTurnMeta, normaliseHeadsUpRoomState, serialiseHeadsUpState, type HeadsUpCompletedTurn, type HeadsUpRoomState } from "@/lib/headsUpGameplay"
import { findRoundForQuestionIndex, getEffectiveRoomRoundPlan, materialiseRoundPlan } from "@/lib/roomRoundPlan"
import { buildQuestionTimesForRound, getEffectiveRoundReviewSecondsForRound } from "@/lib/roundFlow"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export type AdvanceRoomIfReadyResult = {
  ok: boolean
  advanced: boolean
  finished?: boolean
  stage?: string
  error?: string
  status?: number
}

function stageFromTimes(
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

function buildRoundSummaryEndsAt(nextAt: string | null | undefined, roundReviewSeconds: number) {
  const nextMs = nextAt ? Date.parse(nextAt) : Number.NaN
  if (!Number.isFinite(nextMs)) return null

  const reviewMs = Math.max(0, Math.floor(Number(roundReviewSeconds ?? 0)) || 0) * 1000
  if (reviewMs <= 0) return null

  return new Date(nextMs + reviewMs).toISOString()
}

function getCurrentHeadsUpState(room: any, currentRound: any, players: any[]) {
  const base = normaliseHeadsUpRoomState(room?.heads_up_state, currentRound.index)
  if (base.roundIndex !== currentRound.index || base.turnOrderPlayerIds.length === 0) {
    return createHeadsUpReadyState({
      roundIndex: currentRound.index,
      players,
      gameMode: room?.game_mode,
      teamNames: room?.team_names,
    })
  }
  return base
}

function findQuestionIndex(questionIds: string[], questionId: string) {
  return questionIds.findIndex((value) => String(value ?? "") === String(questionId ?? ""))
}

async function autoConfirmHeadsUpReview(params: {
  room: any
  currentRound: any
  currentIndex: number
  roundPlan: any[]
}) {
  const { room, currentRound, currentIndex, roundPlan } = params

  const playersRes = await supabaseAdmin
    .from("players")
    .select("id, name, team_name, joined_at")
    .eq("room_id", room.id)
    .order("joined_at", { ascending: true })

  if (playersRes.error) {
    return {
      ok: false,
      advanced: false,
      error: playersRes.error.message,
      status: 500,
    } satisfies AdvanceRoomIfReadyResult
  }

  const players = playersRes.data ?? []
  const currentState = getCurrentHeadsUpState(room, currentRound, players)
  const fullQuestionIds = roundPlan.flatMap((round) => round.questionIds).map(String)
  const currentVisibleQuestionId = String(fullQuestionIds[currentIndex] ?? "").trim()

  const completedTurn: HeadsUpCompletedTurn = {
    turnIndex: currentState.currentTurnIndex,
    activeGuesserId: String(currentState.activeGuesserId ?? "").trim(),
    activeTeamName: currentState.activeTeamName,
    startedAt: currentState.turnStartedAt,
    endedAt: new Date().toISOString(),
    actions: currentState.currentTurnActions,
  }

  const actionedQuestionIds = new Set(currentState.currentTurnActions.map((item) => String(item.questionId ?? "")).filter(Boolean))
  const currentVisibleQuestionIndex = currentVisibleQuestionId ? findQuestionIndex(fullQuestionIds, currentVisibleQuestionId) : -1
  const shouldConsumeVisibleCard =
    Boolean(currentVisibleQuestionId) &&
    currentVisibleQuestionIndex >= currentRound.startIndex &&
    currentVisibleQuestionIndex <= currentRound.endIndex &&
    !actionedQuestionIds.has(currentVisibleQuestionId)

  const nextQuestionIndex = shouldConsumeVisibleCard
    ? Math.min(currentVisibleQuestionIndex + 1, currentRound.endIndex + 1)
    : currentIndex

  const nextTurnIndex = currentState.currentTurnIndex + 1
  const roundComplete = nextTurnIndex >= currentState.turnOrderPlayerIds.length || nextQuestionIndex > currentRound.endIndex
  const nextReadyTurn = roundComplete
    ? { activeGuesserId: null, activeTeamName: null }
    : getHeadsUpReadyTurnMeta({
        turnOrderPlayerIds: currentState.turnOrderPlayerIds,
        currentTurnIndex: nextTurnIndex,
        players,
      })

  const nextState: HeadsUpRoomState = {
    ...currentState,
    status: roundComplete ? "round_summary" : "ready",
    currentTurnIndex: nextTurnIndex,
    activeGuesserId: nextReadyTurn.activeGuesserId,
    activeTeamName: nextReadyTurn.activeTeamName,
    turnStartedAt: null,
    turnEndsAt: null,
    currentTurnActions: [],
    completedTurns: [...currentState.completedTurns, completedTurn],
  }

  const updateRes = await supabaseAdmin
    .from("rooms")
    .update({
      question_index: roundComplete ? currentIndex : nextQuestionIndex,
      open_at: null,
      close_at: null,
      reveal_at: null,
      next_at: null,
      heads_up_state: serialiseHeadsUpState(nextState),
    })
    .eq("id", room.id)
    .eq("phase", "running")
    .select("id")

  if (updateRes.error) {
    return {
      ok: false,
      advanced: false,
      error: updateRes.error.message || "Could not confirm Heads Up turn.",
      status: 500,
    } satisfies AdvanceRoomIfReadyResult
  }

  return {
    ok: true,
    advanced: Array.isArray(updateRes.data) && updateRes.data.length > 0,
    finished: false,
    stage: roundComplete ? "round_summary" : "heads_up_ready",
  } satisfies AdvanceRoomIfReadyResult
}

export async function advanceRoomIfReady(params: {
  code: string
  allowRoundSummaryAdvance?: boolean
  allowHeadsUpReviewAutoConfirm?: boolean
}) {
  const code = String(params.code ?? "").trim().toUpperCase()
  const allowRoundSummaryAdvance = Boolean(params.allowRoundSummaryAdvance)
  const allowHeadsUpReviewAutoConfirm = Boolean(params.allowHeadsUpReviewAutoConfirm)

  if (!code) {
    return {
      ok: false,
      advanced: false,
      error: "Missing code",
      status: 400,
    } satisfies AdvanceRoomIfReadyResult
  }

  const roomRes = await supabaseAdmin.from("rooms").select("*").eq("code", code).single()
  if (roomRes.error || !roomRes.data) {
    return {
      ok: false,
      advanced: false,
      error: "Room not found",
      status: 404,
    } satisfies AdvanceRoomIfReadyResult
  }

  const room = roomRes.data
  if (room.phase !== "running") {
    return {
      ok: true,
      advanced: false,
      finished: room.phase === "finished",
      stage: String(room.phase ?? "lobby"),
    } satisfies AdvanceRoomIfReadyResult
  }

  const roomRoundPlan = getEffectiveRoomRoundPlan(room)
  const roundPlan = materialiseRoundPlan(roomRoundPlan)
  const ids = roundPlan.flatMap((round) => round.questionIds)
  const currentIndex = Math.max(0, Math.floor(Number(room.question_index ?? 0)) || 0)
  const currentRound = findRoundForQuestionIndex(currentIndex, roundPlan)
  const isHeadsUp = String(currentRound?.behaviourType ?? "").trim().toLowerCase() === "heads_up"

  const nowMs = Date.now()
  const baseStage = stageFromTimes(room.phase, nowMs, room.open_at, room.close_at, room.reveal_at, room.next_at)
  let stage = baseStage

  if (isHeadsUp) {
    stage =
      deriveHeadsUpStage({
        roomPhase: room.phase,
        round: currentRound,
        rawState: room.heads_up_state,
        nowMs,
        closeAt: room.close_at,
      }) ?? baseStage

    if (stage === "heads_up_review" && allowHeadsUpReviewAutoConfirm) {
      const reviewAutoAdvanceAtMs = room.close_at ? Date.parse(String(room.close_at)) + 4500 : Number.NaN
      if (Number.isFinite(reviewAutoAdvanceAtMs) && nowMs >= reviewAutoAdvanceAtMs) {
        return autoConfirmHeadsUpReview({ room, currentRound, currentIndex, roundPlan })
      }
    }

    if (!(allowRoundSummaryAdvance && stage === "round_summary")) {
      return {
        ok: true,
        advanced: false,
        finished: false,
        stage,
      } satisfies AdvanceRoomIfReadyResult
    }
  } else {
    const roundReviewSeconds = getEffectiveRoundReviewSecondsForRound(room, currentRound)
    const roundSummaryEndsAt = buildRoundSummaryEndsAt(room.next_at, roundReviewSeconds)
    if (baseStage === "needs_advance" && currentIndex >= currentRound.endIndex) {
      stage = roundSummaryEndsAt && nowMs < Date.parse(roundSummaryEndsAt) ? "round_summary" : "needs_advance"
    }

    if (stage === "round_summary" && !allowRoundSummaryAdvance) {
      return {
        ok: true,
        advanced: false,
        finished: false,
        stage,
      } satisfies AdvanceRoomIfReadyResult
    }

    if (stage !== "needs_advance" && !(allowRoundSummaryAdvance && stage === "round_summary")) {
      return {
        ok: true,
        advanced: false,
        finished: false,
        stage,
      } satisfies AdvanceRoomIfReadyResult
    }
  }

  const nextIndex = isHeadsUp && stage === "round_summary" ? currentRound.endIndex + 1 : currentIndex + 1

  if (nextIndex >= ids.length) {
    const finishRes = await supabaseAdmin
      .from("rooms")
      .update({ phase: "finished", heads_up_state: {} })
      .eq("id", room.id)
      .eq("phase", "running")
      .select("id")

    if (finishRes.error) {
      return {
        ok: false,
        advanced: false,
        error: "Could not finish game",
        status: 500,
      } satisfies AdvanceRoomIfReadyResult
    }

    return {
      ok: true,
      advanced: Array.isArray(finishRes.data) && finishRes.data.length > 0,
      finished: true,
      stage: "finished",
    } satisfies AdvanceRoomIfReadyResult
  }

  const nextRound = findRoundForQuestionIndex(nextIndex, roundPlan)
  const nextIsHeadsUp = String(nextRound?.behaviourType ?? "").trim().toLowerCase() === "heads_up"

  const updatePayload: Record<string, unknown> = {
    question_index: nextIndex,
  }

  if (nextIsHeadsUp) {
    const playersRes = await supabaseAdmin
      .from("players")
      .select("id, name, team_name, joined_at")
      .eq("room_id", room.id)
      .order("joined_at", { ascending: true })

    if (playersRes.error) {
      return {
        ok: false,
        advanced: false,
        error: playersRes.error.message,
        status: 500,
      } satisfies AdvanceRoomIfReadyResult
    }

    updatePayload.countdown_start_at = null
    updatePayload.open_at = null
    updatePayload.close_at = null
    updatePayload.reveal_at = null
    updatePayload.next_at = null
    updatePayload.heads_up_state = serialiseHeadsUpState(
      createHeadsUpReadyState({
        roundIndex: nextRound.index,
        players: playersRes.data ?? [],
        gameMode: room.game_mode,
        teamNames: room.team_names,
      })
    )
  } else {
    const roomTimes = buildQuestionTimesForRound({ now: new Date(), room, round: nextRound })
    updatePayload.countdown_start_at = roomTimes.openAt.toISOString()
    updatePayload.open_at = roomTimes.openAt.toISOString()
    updatePayload.close_at = roomTimes.closeAt.toISOString()
    updatePayload.reveal_at = roomTimes.revealAt.toISOString()
    updatePayload.next_at = roomTimes.nextAt.toISOString()
    updatePayload.heads_up_state = {}
  }

  const updateRes = await supabaseAdmin
    .from("rooms")
    .update(updatePayload)
    .eq("id", room.id)
    .eq("phase", "running")
    .eq("question_index", currentIndex)
    .select("id")

  if (updateRes.error) {
    return {
      ok: false,
      advanced: false,
      error: "Could not advance room",
      status: 500,
    } satisfies AdvanceRoomIfReadyResult
  }

  return {
    ok: true,
    advanced: Array.isArray(updateRes.data) && updateRes.data.length > 0,
    finished: false,
    stage: nextIsHeadsUp ? "heads_up_ready" : "open",
  } satisfies AdvanceRoomIfReadyResult
}
