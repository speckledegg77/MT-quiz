"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import GameCompletedSummary from "@/components/GameCompletedSummary";
import RoundSummaryCard from "@/components/RoundSummaryCard";
import PageShell from "@/components/PageShell";
import QRTile from "@/components/ui/QRTile";
import { getRoundBehaviourBadgeClass, getRoundBehaviourLabel, getRunBadgeLabel, getStagePillClass, getStageStatusText, isInfiniteFinalStage, isInfiniteModeFromState } from "@/lib/gameMode";
import { shouldSuppressQuestionBetweenRounds } from "@/lib/roundFlow";

type RoomState = any;

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

export default function DisplayPage() {
  const params = useParams<{ code?: string }>();
  const code = String(params?.code ?? "").toUpperCase();

  const [state, setState] = useState<RoomState | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [playedForQ, setPlayedForQ] = useState<string | null>(null);
  const [roundTransitionQuestionIndex, setRoundTransitionQuestionIndex] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const feedbackAudioContextRef = useRef<AudioContext | null>(null);
  const lastHeadsUpCountdownSecondRef = useRef<number | null>(null);
  const lastHeadsUpCountdownStageRef = useRef<string | null>(null);

  async function unlockAudio() {
    setAudioEnabled(true);
  }

  function stopClip(reset = true) {
    const el = audioRef.current;
    if (!el) return;

    try {
      el.pause();
      if (reset) el.currentTime = 0;
    } catch {
      // ignore
    }
  }

  async function playClip() {
    const q = state?.question;
    const el = audioRef.current;
    if (!q?.audioUrl || !el) return;

    try {
      el.pause();
      el.src = q.audioUrl;
      el.load();
      await el.play();
    } catch {
      // ignore
    }
  }


  async function ensureHeadsUpAudioReady() {
    try {
      const anyWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
      const Ctx = anyWindow.AudioContext || anyWindow.webkitAudioContext;
      if (!Ctx) return null;
      const ctx = feedbackAudioContextRef.current ?? new Ctx();
      feedbackAudioContextRef.current = ctx;
      await ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }

  async function playHeadsUpTimerCue(kind: "tick" | "end") {
    try {
      const ctx = await ensureHeadsUpAudioReady();
      if (!ctx) return;

      const pulse = (frequency: number, start: number, duration: number, type: OscillatorType, volume: number) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
      };

      const start = ctx.currentTime + 0.01;
      if (kind === "tick") {
        pulse(1320, start, 0.07, "square", 0.045);
      } else {
        pulse(784, start, 0.09, "triangle", 0.06);
        pulse(622, start + 0.1, 0.12, "triangle", 0.055);
        pulse(440, start + 0.24, 0.24, "sawtooth", 0.07);
      }
    } catch {
      // ignore
    }
  }

  const refreshState = useCallback(async () => {
    if (!code) return null;

    const res = await fetch(`/api/room/state?code=${code}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setState(data);

    if (data?.stage === "needs_advance") {
      await fetch("/api/room/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
    }

    return data;
  }, [code]);

  useEffect(() => {
    if (!code) return;

    let cancelled = false;

    async function tick() {
      const data = await refreshState();
      if (cancelled || !data) return;
    }

    tick();
    const pollMs = state?.phase === "running" ? 250 : 500;
    const id = window.setInterval(tick, pollMs);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [code, refreshState, state?.phase]);

  useEffect(() => {
    const qi = Number(state?.questionIndex ?? NaN);
    if (!Number.isFinite(qi)) return;

    if (state?.phase === "lobby" || state?.phase === "finished") {
      setRoundTransitionQuestionIndex(null);
      return;
    }

    if (state?.stage === "round_summary") {
      setRoundTransitionQuestionIndex(qi);
      return;
    }

    if (roundTransitionQuestionIndex !== null && qi !== roundTransitionQuestionIndex) {
      setRoundTransitionQuestionIndex(null);
    }
  }, [state?.stage, state?.phase, state?.questionIndex, roundTransitionQuestionIndex]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const joinUrl = useMemo(() => (code && origin ? `${origin}/join?code=${code}` : ""), [code, origin]);

  const audioMode = String(state?.audioMode ?? "display");
  const shouldPlayOnDisplay = audioMode === "display" || audioMode === "both";

  useEffect(() => {
    const q = state?.question;
    if (!q) return;
    if (!shouldPlayOnDisplay) return;
    if (!audioEnabled) return;
    if (q.roundType !== "audio") return;
    if (state?.stage !== "open") return;
    if (!q.audioUrl) return;
    if (playedForQ === q.id) return;

    setPlayedForQ(q.id);
    playClip().catch(() => {});
  }, [state, audioEnabled, playedForQ, shouldPlayOnDisplay]);

  useEffect(() => {
    const q = state?.question;
    const shouldKeepPlaying =
      state?.phase === "running" &&
      state?.stage === "open" &&
      shouldPlayOnDisplay &&
      audioEnabled &&
      q?.roundType === "audio" &&
      Boolean(q?.audioUrl);

    if (!shouldKeepPlaying) {
      stopClip();
    }
  }, [state?.phase, state?.stage, state?.question?.id, state?.question?.audioUrl, state?.question?.roundType, shouldPlayOnDisplay, audioEnabled]);

  useEffect(() => {
    return () => {
      stopClip();
    };
  }, []);

  useEffect(() => {
    const resumeAudio = () => {
      void ensureHeadsUpAudioReady();
    };
    window.addEventListener("pointerdown", resumeAudio);
    window.addEventListener("keydown", resumeAudio);
    return () => {
      window.removeEventListener("pointerdown", resumeAudio);
      window.removeEventListener("keydown", resumeAudio);
    };
  }, []);

  useEffect(() => {
    const currentStage = String(state?.stage ?? "");
    const shouldPlayCountdownCue =
      String(state?.rounds?.current?.behaviourType ?? "").trim().toLowerCase() === "heads_up" &&
      currentStage === "heads_up_live";

    if (!shouldPlayCountdownCue) {
      lastHeadsUpCountdownSecondRef.current = null;
      lastHeadsUpCountdownStageRef.current = currentStage;
      return;
    }

    const closeAtMs = state?.times?.closeAt ? Date.parse(String(state.times.closeAt)) : Number.NaN;
    const currentSecondsRemaining = Number.isFinite(closeAtMs)
      ? Math.max(0, Math.ceil((closeAtMs - Date.now()) / 1000))
      : 0;

    if (!Number.isFinite(currentSecondsRemaining)) return;

    const currentSecond = Math.max(0, Math.floor(currentSecondsRemaining));
    const previousSecond = lastHeadsUpCountdownSecondRef.current;
    const previousStage = lastHeadsUpCountdownStageRef.current;
    lastHeadsUpCountdownSecondRef.current = currentSecond;
    lastHeadsUpCountdownStageRef.current = currentStage;

    if (previousStage !== "heads_up_live") return;
    if (previousSecond === currentSecond) return;

    if (currentSecond > 0 && currentSecond <= 5) {
      void playHeadsUpTimerCue("tick");
      return;
    }

    if (currentSecond === 0 && previousSecond !== 0) {
      void playHeadsUpTimerCue("end");
    }
  }, [state]);

  useEffect(() => {
    return () => {
      try {
        feedbackAudioContextRef.current?.close();
      } catch {
        // ignore
      }
      feedbackAudioContextRef.current = null;
    };
  }, []);

  if (!code) return null;
  if (!state) return null;

  const stage = String(state.stage ?? "");
  const isInfiniteMode = isInfiniteModeFromState(state);
  const showInfiniteFinalStage = isInfiniteFinalStage(stage, {
    isInfiniteMode,
    isLastQuestionOverall: Boolean(state?.flow?.isLastQuestionOverall),
  });
  const status = getStageStatusText(stage, showInfiniteFinalStage);
  const q = state.question;
  const isAudioQ = q?.roundType === "audio";
  const isPictureQ = q?.roundType === "picture";
  const isTextQ = q?.answerType === "text";
  const showJoin = state.phase === "lobby";
  const finished = state.phase === "finished";
  const currentRound = state?.rounds?.current ?? null;
  const isQuickfireRound = String(currentRound?.behaviourType ?? "").trim().toLowerCase() === "quickfire";
  const isHeadsUpRound = String(currentRound?.behaviourType ?? "").trim().toLowerCase() === "heads_up";
  const progressLabel = String(state?.progress?.label ?? "");
  const questionNumber = Number(state.questionIndex ?? 0) + 1;
  const questionCount = Number(state.questionCount ?? 0);
  const roundStats = state?.roundStats ?? null;
  const headsUp = state?.headsUp ?? null;
  const headsUpShowLabel = useMemo(() => {
    const explicitLabel = String(q?.meta?.primaryShowDisplayName ?? "").trim();
    if (explicitLabel) return explicitLabel;

    const showKey = String(q?.meta?.primaryShowKey ?? "").trim();
    if (!showKey) return "";

    return showKey
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }, [q?.meta?.primaryShowDisplayName, q?.meta?.primaryShowKey]);
  const closeAtMs = state?.times?.closeAt ? Date.parse(String(state.times.closeAt)) : Number.NaN;
  const headsUpTurnSeconds = Number(state?.headsUp?.turnSeconds ?? 0);
  const secondsRemaining = Number.isFinite(closeAtMs)
    ? Math.max(0, Math.ceil((closeAtMs - Date.now()) / 1000))
    : stage === "heads_up_ready" && Number.isFinite(headsUpTurnSeconds) && headsUpTurnSeconds > 0
      ? headsUpTurnSeconds
      : 0;
  const headsUpReviewAutoAdvanceAtMs = state?.headsUp?.reviewAutoAdvanceAt ? Date.parse(String(state.headsUp.reviewAutoAdvanceAt)) : Number.NaN;
  const headsUpReviewCountdownSeconds = Number.isFinite(headsUpReviewAutoAdvanceAtMs)
    ? Math.max(0, Math.ceil((headsUpReviewAutoAdvanceAtMs - Date.now()) / 1000))
    : 0;

  const suppressStaleQuestionBetweenRounds = shouldSuppressQuestionBetweenRounds({
    phase: state?.phase,
    stage,
    questionIndex: state?.questionIndex,
    roundTransitionQuestionIndex,
  });

  const correctIndex = Number.isFinite(Number(state?.reveal?.answerIndex))
    ? Number(state?.reveal?.answerIndex)
    : null;
  const revealAnswerText = String(state?.reveal?.answerText ?? "").trim();
  const correctAnswerText =
    q?.answerType === "mcq"
      ? correctIndex !== null && Array.isArray(q?.options)
        ? String(q.options[correctIndex] ?? "")
        : revealAnswerText
      : revealAnswerText;

  return (
    <PageShell width="wide">
      <audio ref={audioRef} />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Room</div>
          <div className="text-2xl font-semibold tracking-wide">{code}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {status ? (
            <span className={`rounded-full border px-3 py-1 text-sm ${getStagePillClass(stage)}`}>{status}</span>
          ) : null}

          {state.phase === "running" && currentRound ? (
            <span className={`rounded-full border px-3 py-1 text-sm ${isInfiniteMode ? "border-sky-500/40 bg-sky-600/10 text-sky-200" : "border-border bg-card text-muted-foreground"}`}>
              {getRunBadgeLabel({ isInfiniteMode, currentRound })}
            </span>
          ) : null}

          {state.phase === "running" && currentRound && !isInfiniteMode ? (
            <span className={`rounded-full border px-3 py-1 text-sm ${getRoundBehaviourBadgeClass(currentRound.behaviourType)}`}>
              {getRoundBehaviourLabel(currentRound.behaviourType)}
            </span>
          ) : null}

          {state.phase === "running" ? (
            <span className="rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground">
              {progressLabel || `Q${questionNumber} of ${questionCount}`}
            </span>
          ) : null}
        </div>
      </div>

      {showJoin ? (
        <Card>
          <CardHeader>
            <CardTitle>Players join here</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[1fr,240px] lg:items-center">
            <div className="space-y-3">
              <div className="text-base">Players can join on their phones before the game starts.</div>
              <div className="rounded-xl border border-border bg-muted px-3 py-3">
                <div className="text-sm text-muted-foreground">Join URL</div>
                <a
                  className="mt-1 block break-all text-sm text-foreground underline underline-offset-2"
                  href={joinUrl}
                >
                  {joinUrl}
                </a>
              </div>
              <div className="text-sm text-muted-foreground">
                Start the game from the host screen when everyone is ready.
              </div>
            </div>

            <div className="flex justify-center lg:justify-end">
              <QRTile value={joinUrl} size={160} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!showJoin && !finished && stage === "round_summary" ? (
        <div className="space-y-4">
          {isHeadsUpRound ? (
            <Card>
              <CardContent className="py-6">
                <div className="rounded-xl border border-amber-500/30 bg-amber-600/10 px-5 py-4 text-center">
                  <div className="text-xs uppercase tracking-[0.24em] text-amber-200">Heads Up round complete</div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">
                    {String(state?.headsUp?.roundCompleteReason ?? "") === "card_pool_exhausted" ? "No more cards left in this round" : "All turns complete"}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {String(state?.headsUp?.roundCompleteReason ?? "") === "card_pool_exhausted"
                      ? "The host will need to continue to the next round. Add more active cards to the selected pack next time if you want more turns."
                      : "Waiting for the host to continue."}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
          <RoundSummaryCard
            round={currentRound}
            roundStats={roundStats}
            isLastQuestionOverall={Boolean(state?.flow?.isLastQuestionOverall)}
            roundSummaryEndsAt={state?.times?.roundSummaryEndsAt ?? null}
            gameMode={String(state?.gameMode ?? "teams") === "solo" ? "solo" : "teams"}
            roundReview={state?.roundReview}
            isInfiniteMode={isInfiniteMode}
          />
        </div>
      ) : null}

      {!showJoin && !finished && suppressStaleQuestionBetweenRounds ? (
        <Card>
          <CardContent className="py-16 text-center text-lg text-muted-foreground">
            Starting next round...
          </CardContent>
        </Card>
      ) : null}

      {!showJoin && !finished && stage !== "round_summary" && !suppressStaleQuestionBetweenRounds ? (
        <div className="space-y-4">
          {q ? (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>{isHeadsUpRound ? "Card" : "Question"}</CardTitle>
                  {isQuickfireRound ? (
                    <span className="rounded-full border border-violet-500/40 bg-violet-600/10 px-3 py-1 text-sm text-violet-200">
                      Quickfire
                    </span>
                  ) : null}
                  {isHeadsUpRound ? (
                    <span className="rounded-full border border-amber-500/40 bg-amber-600/10 px-3 py-1 text-sm text-amber-200">
                      Heads Up
                    </span>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isPictureQ && q.imageUrl ? (
                  <div className="overflow-hidden rounded-xl border border-border">
                    <img src={q.imageUrl} alt="" className="block w-full" />
                  </div>
                ) : null}

                {isQuickfireRound ? (
                  <div className="rounded-xl border border-violet-500/30 bg-violet-600/10 px-4 py-3 text-sm">
                    <div className="font-medium text-foreground">Quickfire round</div>
                    <div className="mt-1 text-muted-foreground">
                      No reveal appears after each question. The round review at the end shows the answer, who got it
                      right, and who was fastest.
                    </div>
                  </div>
                ) : null}

                {isHeadsUpRound ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-600/10 px-4 py-3 text-sm">
                    <div className="font-medium text-foreground">Heads Up turn</div>
                    <div className="mt-1 text-muted-foreground">
                      {headsUp?.tvDisplayMode === "show_clue"
                        ? "The TV is showing the live clue for the active team or the room."
                        : "The TV is hidden to the clue while the turn is live."}
                    </div>
                  </div>
                ) : null}

                {isHeadsUpRound ? (
                  <div className="rounded-2xl border border-border bg-card px-5 py-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Active player</div>
                        <div className="mt-1 text-2xl font-semibold text-foreground">{headsUp?.activeGuesserName || "Waiting to start"}</div>
                        {headsUp?.activeTeamName ? <div className="mt-1 text-sm text-muted-foreground">Team {headsUp.activeTeamName}</div> : null}
                      </div>
                      <div className="rounded-2xl border border-amber-500/40 bg-amber-600/10 px-4 py-3 text-right">
                        <div className="text-xs uppercase tracking-[0.2em] text-amber-200">Timer</div>
                        <div className="mt-1 text-3xl font-semibold tabular-nums text-foreground">{formatDuration(secondsRemaining)}</div>
                      </div>
                    </div>
                    {stage === "heads_up_live" && headsUp?.tvDisplayMode === "show_clue" ? (
                      <div className="mt-6 rounded-3xl border border-amber-500/30 bg-amber-600/10 px-6 py-10 text-center">
                        <div className="flex items-start justify-between gap-4 text-left">
                          <div className="text-xs uppercase tracking-[0.24em] text-amber-200">Live clue</div>
                          {headsUpShowLabel ? (
                            <div className="rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-sm font-medium leading-none text-amber-100">
                              {headsUpShowLabel}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-4 whitespace-pre-line text-4xl font-semibold leading-tight text-foreground">{q.text}</div>
                      </div>
                    ) : (
                      <div className="mt-6 rounded-3xl border border-border bg-muted px-6 py-10 text-center">
                        <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{stage === "heads_up_review" ? "Turn review" : "Timer only"}</div>
                        <div className="mt-4 text-2xl font-semibold leading-tight text-foreground">
                          {stage === "heads_up_ready"
                            ? "Start the turn when the guesser is ready"
                            : stage === "heads_up_review"
                              ? "The host is reviewing this turn"
                              : "Keep the clue hidden from the guesser"}
                        </div>
                      </div>
                    )}
                    {stage === "heads_up_review" ? (
                      <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-600/10 px-4 py-4 text-center text-sm">
                        <div className="font-medium text-foreground">
                          {headsUp?.willAdvanceToNextTurn
                            ? `Next player: ${String(headsUp?.nextGuesserName ?? "The next player")}${headsUp?.nextTeamName ? ` · Team ${String(headsUp.nextTeamName)}` : ""}`
                            : "Ending Heads Up round"}
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          {headsUp?.willAdvanceToNextTurn
                            ? `Moving on in ${headsUpReviewCountdownSeconds}s unless the host pauses to correct the turn.`
                            : `Finishing the round in ${headsUpReviewCountdownSeconds}s.`}
                        </div>
                      </div>
                    ) : null}
                    {stage === "heads_up_review" && Array.isArray(headsUp?.currentTurnActions) && headsUp.currentTurnActions.length ? (
                      <div className="mt-6 grid gap-2">
                        {headsUp.currentTurnActions.map((item: any) => (
                          <div key={item.questionId} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-base text-foreground">{item.questionText}</div>
                              <div className="text-xs text-muted-foreground">{[item.itemType, item.difficulty].filter(Boolean).join(" · ") || "Heads Up card"}</div>
                            </div>
                            <span className={`rounded-full border px-3 py-1 text-sm ${item.action === "correct" ? "border-emerald-500/40 bg-emerald-600/10 text-emerald-200" : "border-slate-500/40 bg-slate-600/10 text-slate-200"}`}>
                              {item.action === "correct" ? "Correct" : "Pass"}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="whitespace-pre-line text-xl font-semibold">{q.text}</div>
                )}

                {isAudioQ && audioMode === "phones" ? (
                  <div className="text-sm text-muted-foreground">Audio plays on phones for this game.</div>
                ) : null}

                {isAudioQ && shouldPlayOnDisplay && !audioEnabled ? (
                  <div className="rounded-xl border border-border bg-muted px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-muted-foreground">Audio for this display</div>
                      <Button variant="secondary" onClick={unlockAudio}>
                        Enable audio
                      </Button>
                    </div>
                  </div>
                ) : null}

                {isAudioQ && shouldPlayOnDisplay && audioEnabled && q.audioUrl ? (
                  <div className="rounded-xl border border-border bg-muted px-3 py-2">
                    <div className="text-sm text-muted-foreground">Audio clip</div>
                    <div className="mt-2">
                      <Button variant="secondary" onClick={() => playClip().catch(() => {})}>
                        Play again
                      </Button>
                    </div>
                  </div>
                ) : null}

                {q.answerType === "mcq" && Array.isArray(q.options) && q.options.length ? (
                  <div className="grid gap-2">
                    {q.options.map((opt: string, index: number) => {
                      const isCorrect = stage === "reveal" && correctIndex === index;

                      return (
                        <div
                          key={index}
                          className={[
                            "rounded-xl border px-3 py-2",
                            isCorrect
                              ? "border-emerald-600/40 bg-emerald-600/10"
                              : "border-border bg-card",
                          ].join(" ")}
                        >
                          <div className="text-sm">{opt}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {isHeadsUpRound ? null : isTextQ ? (
                  <div className="text-sm text-muted-foreground">Players type their answer on their phones.</div>
                ) : null}

                {stage === "reveal" && correctAnswerText ? (
                  <div className="rounded-xl border border-emerald-600/30 bg-emerald-600/10 p-4">
                    <div className="text-sm font-medium text-emerald-200">Correct answer</div>
                    <div className="mt-1 text-base text-foreground">{correctAnswerText}</div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {finished ? (
        <GameCompletedSummary
          gameMode={String(state?.gameMode ?? "teams") === "solo" ? "solo" : "teams"}
          teamScoreMode={String(state?.teamScoreMode ?? "total") === "average" ? "average" : "total"}
          finalResults={state?.finalResults}
          title="Game completed"
          isInfiniteMode={isInfiniteMode}
          finalQuestionReview={state?.finalQuestionReview}
        />
      ) : null}
    </PageShell>
  );
}
