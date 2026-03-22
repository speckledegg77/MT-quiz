export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { getQuestionById } from "@/lib/questionBank"
import { createHeadsUpReadyState, deriveHeadsUpStage, getHeadsUpReadyTurnMeta, getHeadsUpTurnSeconds, normaliseHeadsUpRoomState, serialiseHeadsUpState, type HeadsUpActionKind, type HeadsUpCompletedTurn, type HeadsUpRoomState } from "@/lib/headsUpGameplay"
import { findRoundForQuestionIndex, getEffectiveRoomRoundPlan, materialiseRoundPlan } from "@/lib/roomRoundPlan"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + Math.max(0, Math.floor(Number(seconds ?? 0)) || 0) * 1000)
}

function normaliseAction(raw: unknown) {
  const value = String(raw ?? "").trim().toLowerCase()
  return value as
    | "host_start_turn"
    | "guesser_start_turn"
    | "guesser_correct"
    | "guesser_pass"
    | "host_undo"
    | "host_end_turn"
    | "host_review_set_action"
    | "host_confirm_turn"
}

function findQuestionIndex(questionIds: string[], questionId: string) {
  return questionIds.findIndex((value) => String(value ?? "") === String(questionId ?? ""))
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

async function applyScoreDelta(playerId: string | null | undefined, delta: number) {
  const safePlayerId = String(playerId ?? "").trim()
  if (!safePlayerId || !Number.isFinite(delta) || delta === 0) return
  await supabaseAdmin.rpc("increment_player_score_by", { p_player_id: safePlayerId, p_delta: Math.floor(delta) })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const code = String(body.code ?? "").trim().toUpperCase()
  const action = normaliseAction(body.action)
  const playerId = String(body.playerId ?? "").trim()
  const questionId = String(body.questionId ?? "").trim()
  const reviewAction = String(body.reviewAction ?? "").trim().toLowerCase() === "pass" ? "pass" : "correct"

  if (!code || !action) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 })
  }

  const roomRes = await supabaseAdmin.from("rooms").select("*").eq("code", code).single()
  if (roomRes.error || !roomRes.data) return NextResponse.json({ error: "Room not found." }, { status: 404 })
  const room = roomRes.data
  if (room.phase !== "running") return NextResponse.json({ error: "Room is not running." }, { status: 400 })

  const playersRes = await supabaseAdmin
    .from("players")
    .select("id, name, team_name, joined_at")
    .eq("room_id", room.id)
    .order("joined_at", { ascending: true })

  if (playersRes.error) return NextResponse.json({ error: playersRes.error.message }, { status: 500 })
  const players = playersRes.data ?? []

  const roundPlan = materialiseRoundPlan(getEffectiveRoomRoundPlan(room))
  const currentIndex = Math.max(0, Math.floor(Number(room.question_index ?? 0)) || 0)
  const currentRound = findRoundForQuestionIndex(currentIndex, roundPlan)
  if (String(currentRound?.behaviourType ?? "").trim().toLowerCase() !== "heads_up") {
    return NextResponse.json({ error: "Heads Up controls are only available in a Heads Up round." }, { status: 400 })
  }

  const questionIds = currentRound.questionIds.map(String)
  const currentQuestionId = String(questionIds[Math.max(0, currentIndex - currentRound.startIndex)] ?? room.question_ids?.[currentIndex] ?? "") || String((Array.isArray(room.question_ids) ? room.question_ids[currentIndex] : "") ?? "")
  const currentState = getCurrentHeadsUpState(room, currentRound, players)
  const derivedStage = deriveHeadsUpStage({
    roomPhase: room.phase,
    round: currentRound,
    rawState: currentState,
    nowMs: Date.now(),
    closeAt: room.close_at,
  })

  if (action === "host_start_turn" || action === "guesser_start_turn") {
    if (derivedStage !== "heads_up_ready") return NextResponse.json({ error: "The turn is not ready to start." }, { status: 400 })
    if (currentState.currentTurnIndex >= currentState.turnOrderPlayerIds.length || currentIndex > currentRound.endIndex) {
      const nextState: HeadsUpRoomState = { ...currentState, status: "round_summary" }
      const updateRes = await supabaseAdmin
        .from("rooms")
        .update({ heads_up_state: serialiseHeadsUpState(nextState), open_at: null, close_at: null, reveal_at: null, next_at: null })
        .eq("id", room.id)
      if (updateRes.error) return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
      return NextResponse.json({ ok: true, stage: "round_summary" })
    }

    const readyTurn = getHeadsUpReadyTurnMeta({
      turnOrderPlayerIds: currentState.turnOrderPlayerIds,
      currentTurnIndex: currentState.currentTurnIndex,
      players,
    })

    if (!readyTurn.activeGuesserId) {
      return NextResponse.json({ error: "Could not find the next guesser for this turn." }, { status: 400 })
    }

    if (action === "guesser_start_turn" && (!playerId || playerId !== readyTurn.activeGuesserId)) {
      return NextResponse.json({ error: "Only the selected guesser can start this turn." }, { status: 403 })
    }

    const now = new Date()
    const closeAt = addSeconds(now, getHeadsUpTurnSeconds(currentRound))
    const nextState: HeadsUpRoomState = {
      ...currentState,
      status: "live",
      activeGuesserId: readyTurn.activeGuesserId,
      activeTeamName: readyTurn.activeTeamName,
      turnStartedAt: now.toISOString(),
      turnEndsAt: closeAt.toISOString(),
      currentTurnActions: [],
    }

    const updateRes = await supabaseAdmin
      .from("rooms")
      .update({
        countdown_start_at: now.toISOString(),
        open_at: now.toISOString(),
        close_at: closeAt.toISOString(),
        reveal_at: null,
        next_at: null,
        heads_up_state: serialiseHeadsUpState(nextState),
      })
      .eq("id", room.id)

    if (updateRes.error) return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
    return NextResponse.json({ ok: true, stage: "heads_up_live" })
  }

  if (action === "guesser_correct" || action === "guesser_pass") {
    if (derivedStage !== "heads_up_live") return NextResponse.json({ error: "The turn is not live." }, { status: 400 })
    if (!playerId || playerId !== String(currentState.activeGuesserId ?? "")) {
      return NextResponse.json({ error: "Only the active guesser can do that." }, { status: 403 })
    }
    if (!currentQuestionId) return NextResponse.json({ error: "No current card." }, { status: 400 })

    const now = new Date()
    const actionValue: HeadsUpActionKind = action === "guesser_pass" ? "pass" : "correct"
    const nextActions = [...currentState.currentTurnActions, { questionId: currentQuestionId, action: actionValue, at: now.toISOString() }]
    const nextQuestionIndex = Math.min(currentIndex + 1, currentRound.endIndex + 1)
    const reachedEndOfPool = nextQuestionIndex > currentRound.endIndex

    if (actionValue === "correct") {
      await applyScoreDelta(currentState.activeGuesserId, 1)
    }

    const nextState: HeadsUpRoomState = {
      ...currentState,
      currentTurnActions: nextActions,
      status: reachedEndOfPool ? "review" : "live",
    }

    const updatePayload: Record<string, unknown> = {
      question_index: reachedEndOfPool ? currentIndex : nextQuestionIndex,
      heads_up_state: serialiseHeadsUpState(nextState),
    }

    if (reachedEndOfPool) {
      updatePayload.close_at = now.toISOString()
      updatePayload.reveal_at = null
      updatePayload.next_at = null
    }

    const updateRes = await supabaseAdmin.from("rooms").update(updatePayload).eq("id", room.id)
    if (updateRes.error) return NextResponse.json({ error: updateRes.error.message }, { status: 500 })

    return NextResponse.json({ ok: true, stage: reachedEndOfPool ? "heads_up_review" : "heads_up_live" })
  }

  if (action === "host_undo") {
    if (derivedStage !== "heads_up_live") return NextResponse.json({ error: "Undo is only available during the live turn." }, { status: 400 })
    const lastAction = currentState.currentTurnActions[currentState.currentTurnActions.length - 1]
    if (!lastAction) return NextResponse.json({ error: "There is nothing to undo." }, { status: 400 })

    if (lastAction.action === "correct") {
      await applyScoreDelta(currentState.activeGuesserId, -1)
    }

    const restoredQuestionIndex = findQuestionIndex(Array.isArray(room.question_ids) ? room.question_ids.map(String) : questionIds, lastAction.questionId)
    const nextState: HeadsUpRoomState = {
      ...currentState,
      currentTurnActions: currentState.currentTurnActions.slice(0, -1),
    }

    const updateRes = await supabaseAdmin
      .from("rooms")
      .update({
        question_index: restoredQuestionIndex >= 0 ? restoredQuestionIndex : currentIndex,
        heads_up_state: serialiseHeadsUpState(nextState),
      })
      .eq("id", room.id)

    if (updateRes.error) return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
    return NextResponse.json({ ok: true, stage: "heads_up_live" })
  }

  if (action === "host_end_turn") {
    if (derivedStage !== "heads_up_live") return NextResponse.json({ error: "The turn is not live." }, { status: 400 })
    const now = new Date().toISOString()
    const nextState: HeadsUpRoomState = {
      ...currentState,
      status: "review",
    }
    const updateRes = await supabaseAdmin
      .from("rooms")
      .update({ close_at: now, reveal_at: null, next_at: null, heads_up_state: serialiseHeadsUpState(nextState) })
      .eq("id", room.id)
    if (updateRes.error) return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
    return NextResponse.json({ ok: true, stage: "heads_up_review" })
  }

  if (action === "host_review_set_action") {
    if (derivedStage !== "heads_up_review") return NextResponse.json({ error: "The turn is not in review." }, { status: 400 })
    if (!questionId) return NextResponse.json({ error: "Missing questionId." }, { status: 400 })
    const actionIndex = currentState.currentTurnActions.findIndex((item) => String(item.questionId ?? "") === questionId)
    if (actionIndex < 0) return NextResponse.json({ error: "That card is not in the current turn log." }, { status: 400 })

    const previous = currentState.currentTurnActions[actionIndex]
    const nextActions = [...currentState.currentTurnActions]
    nextActions[actionIndex] = { ...previous, action: reviewAction }

    if (previous.action !== reviewAction) {
      await applyScoreDelta(currentState.activeGuesserId, previous.action === "correct" ? -1 : 1)
    }

    const updateRes = await supabaseAdmin
      .from("rooms")
      .update({ heads_up_state: serialiseHeadsUpState({ ...currentState, status: "review", currentTurnActions: nextActions }) })
      .eq("id", room.id)

    if (updateRes.error) return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
    return NextResponse.json({ ok: true, stage: "heads_up_review" })
  }

  if (action === "host_confirm_turn") {
    if (derivedStage !== "heads_up_review") return NextResponse.json({ error: "The turn is not in review." }, { status: 400 })

    const completedTurn: HeadsUpCompletedTurn = {
      turnIndex: currentState.currentTurnIndex,
      activeGuesserId: String(currentState.activeGuesserId ?? "").trim(),
      activeTeamName: currentState.activeTeamName,
      startedAt: currentState.turnStartedAt,
      endedAt: new Date().toISOString(),
      actions: currentState.currentTurnActions,
    }

    const nextTurnIndex = currentState.currentTurnIndex + 1
    const lastActionQuestionId = currentState.currentTurnActions[currentState.currentTurnActions.length - 1]?.questionId ?? null
    const lastActionQuestionIndex = lastActionQuestionId ? findQuestionIndex(Array.isArray(room.question_ids) ? room.question_ids.map(String) : questionIds, lastActionQuestionId) : -1
    const roundComplete = nextTurnIndex >= currentState.turnOrderPlayerIds.length || lastActionQuestionIndex >= currentRound.endIndex
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
        open_at: null,
        close_at: null,
        reveal_at: null,
        next_at: null,
        heads_up_state: serialiseHeadsUpState(nextState),
      })
      .eq("id", room.id)

    if (updateRes.error) return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
    return NextResponse.json({ ok: true, stage: roundComplete ? "round_summary" : "heads_up_ready" })
  }

  return NextResponse.json({ error: "Unsupported Heads Up action." }, { status: 400 })
}
