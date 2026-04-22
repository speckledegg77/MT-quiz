"use client"

import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

export default function HostLiveControls(props: any) {
  const {
    roomSummaryText, stagePill, startError, startOk, resetError, resetOk, forceCloseError, roomCode,
    roomIsInfinite, roomModeSummary, roomProgressLabel, roomJokerSummary, startGame, canStart, startLabel,
    resetRoom, resetting, roomIsSpotlight, sendSpotlightAction, spotlightHostButtons, forcingClose, roomStage,
    roomState, roomSpotlight, spotlightReviewCountdownSeconds, spotlightRoundCompleteReason, continueGame,
    canAdvanceSpotlightSummary, canContinue, continueLabel, endGameNow, canEndGame, endingGame, clearRoom,
  } = props
  return (
<Card>
  <CardHeader>
    <div className="flex items-start justify-between gap-3">
      <div>
        <CardTitle>Host controls</CardTitle>
        <div className="mt-1 text-sm text-muted-foreground">{roomSummaryText}</div>
      </div>
      <div className="rounded-full border border-border px-3 py-1 text-xs text-foreground">{stagePill}</div>
    </div>
  </CardHeader>
  <CardContent className="space-y-4">
    {startError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{startError}</div> : null}
    {startOk ? <div className="whitespace-pre-line rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{startOk}</div> : null}
    {resetError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{resetError}</div> : null}
    {resetOk ? <div className="whitespace-pre-line rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{resetOk}</div> : null}
    {forceCloseError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{forceCloseError}</div> : null}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">Room code</div><div className="mt-1 text-2xl font-semibold tracking-widest text-foreground">{roomCode}</div></div>
      <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">Current stage</div><div className="mt-1 text-lg font-semibold text-foreground">{stagePill}</div></div>
      <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">Mode</div><div className={`mt-1 inline-flex rounded-full border px-3 py-1 text-sm ${roomIsInfinite ? "border-sky-500/40 bg-sky-600/10 text-sky-200" : "border-border bg-card text-foreground"}`}>{roomModeSummary}</div></div>
      <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">Progress</div><div className="mt-1 text-lg font-semibold text-foreground">{roomProgressLabel || "Waiting to start"}</div><div className="mt-1 text-xs text-muted-foreground">{roomJokerSummary}</div></div>
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      <Button onClick={startGame} disabled={!canStart}>{startLabel}</Button>
      <Button variant="secondary" onClick={resetRoom} disabled={resetting}>{resetting ? "Resetting..." : "Reset room"}</Button>
    </div>
    {roomIsSpotlight ? (
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Button variant="secondary" onClick={() => sendSpotlightAction("host_start_turn")} disabled={!spotlightHostButtons?.canStartTurn}>
            {forcingClose && roomStage === "spotlight_ready" ? "Starting..." : "Force start turn"}
          </Button>
          <Button variant="secondary" onClick={() => sendSpotlightAction("host_undo")} disabled={!spotlightHostButtons?.canUndo}>
            {forcingClose && roomStage === "spotlight_live" ? "Working..." : "Undo last action"}
          </Button>
          <Button variant="secondary" onClick={() => sendSpotlightAction("host_end_turn")} disabled={!spotlightHostButtons?.canEndTurn}>
            {forcingClose && roomStage === "spotlight_live" ? "Ending..." : "End turn"}
          </Button>
          <Button onClick={() => sendSpotlightAction("host_confirm_turn")} disabled={!spotlightHostButtons?.canConfirmTurn}>
            {forcingClose && roomStage === "spotlight_review" ? "Moving..." : roomStage === "spotlight_review" ? "Move on now" : roomState?.flow?.isLastQuestionOverall ? "Finish round now" : "Move to next player now"}
          </Button>
        </div>
        {roomStage === "spotlight_review" ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-600/10 px-3 py-2 text-sm text-amber-100">
            {roomSpotlight?.willAdvanceToNextTurn
              ? `Moving to ${String(roomSpotlight?.nextGuesserName ?? "the next player")}${roomSpotlight?.nextTeamName ? ` from Team ${String(roomSpotlight.nextTeamName)}` : ""} in ${spotlightReviewCountdownSeconds}s unless you move on now or correct the turn log first.`
              : `Finishing the Spotlight round in ${spotlightReviewCountdownSeconds}s unless you move on now or correct the turn log first.`}
          </div>
        ) : null}
        {roomStage === "round_summary" ? (
          <div className={`rounded-xl border px-3 py-2 text-sm ${spotlightRoundCompleteReason === "card_pool_exhausted" ? "border-amber-500/30 bg-amber-600/10 text-amber-100" : "border-border bg-card text-muted-foreground"}`}>
            {spotlightRoundCompleteReason === "card_pool_exhausted"
              ? `This Spotlight round used all ${Math.max(0, Number(roomSpotlight?.cardPoolSize ?? 0))} active cards in its selected pack before another player turn could begin. Continue to the next round, or add more active cards to that pack for a longer Spotlight round.`
              : "This Spotlight round is complete. Continue when you are ready."}
          </div>
        ) : null}
        {roomStage === "round_summary" ? (
          <Button onClick={continueGame} disabled={!canAdvanceSpotlightSummary}>
            {forcingClose ? "Moving on..." : Boolean(roomState?.flow?.isLastQuestionOverall) ? (roomIsInfinite ? "Finish game" : "Finish now") : "Continue to next round"}
          </Button>
        ) : null}
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">Active turn</div>
            <div className="mt-1 text-lg font-semibold text-foreground">{roomSpotlight?.activeGuesserName || "No guesser selected"}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {roomSpotlight?.activeTeamName ? `Team ${roomSpotlight.activeTeamName}` : roomState?.gameMode === "solo" ? "Solo mode" : "No active team"}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Turn {Math.max(1, Number(roomSpotlight?.currentTurnIndex ?? 0) + 1)} of {Math.max(0, Number(roomSpotlight?.totalTurns ?? 0))}. TV: {roomSpotlight?.tvDisplayMode === "show_clue" ? "show clue" : "timer only"}.
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">Current turn log</div>
            {Array.isArray(roomSpotlight?.currentTurnActions) && roomSpotlight.currentTurnActions.length ? (
              <div className="mt-2 space-y-2">
                {roomSpotlight.currentTurnActions.map((item: any) => (
                  <div key={item.questionId} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-foreground">{item.questionText}</div>
                      <div className="text-xs text-muted-foreground">{[item.itemType, item.difficulty].filter(Boolean).join(" · ") || "Spotlight card"}</div>
                    </div>
                    {roomStage === "spotlight_review" ? (
                      <select
                        value={item.action}
                        onChange={(e) => sendSpotlightAction("host_review_set_action", { questionId: item.questionId, reviewAction: e.target.value })}
                        className="rounded-lg border border-border bg-card px-2 py-1 text-xs"
                      >
                        <option value="correct">Correct</option>
                        <option value="pass">Pass</option>
                      </select>
                    ) : (
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${item.action === "correct" ? "border-emerald-500/40 bg-emerald-600/10 text-emerald-200" : "border-slate-500/40 bg-slate-600/10 text-slate-200"}`}>
                        {item.action === "correct" ? "Correct" : "Pass"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-sm text-muted-foreground">No cards logged yet for this turn.</div>
            )}
          </div>
        </div>
      </div>
    ) : (
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Button variant="secondary" onClick={continueGame} disabled={!canContinue}>{continueLabel}</Button>
        {roomIsInfinite ? (
          <Button variant="danger" onClick={endGameNow} disabled={!canEndGame}>
            {endingGame ? "Ending..." : "End game now"}
          </Button>
        ) : null}
        <div className="flex items-center rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          {roomIsInfinite
            ? "Infinite mode has no Joker round. Use End game now to stop the run early, or let it finish when the question pool runs out."
            : "Round review advances automatically after the set time. Use the button to move on sooner."}
        </div>
      </div>
    )}
    <div className="flex justify-end"><Button variant="ghost" onClick={clearRoom}>Create another room</Button></div>
  </CardContent>
</Card>
  )
}
