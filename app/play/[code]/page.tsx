"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import GameCompletedSummary from "@/components/GameCompletedSummary";
import RoundSummaryCard from "@/components/RoundSummaryCard";

type RoomState = any;

function statusText(stage: string) {
  if (stage === "countdown") return "Get ready";
  if (stage === "open") return "Answer now";
  if (stage === "wait") return "Waiting for answers";
  if (stage === "reveal") return "Reveal";
  if (stage === "round_summary") return "End of round";
  if (stage === "needs_advance") return "Next question";
  return "";
}

function pillClass(stage: string) {
  if (stage === "open") return "bg-emerald-600/20 text-emerald-200 border-emerald-500/40";
  if (stage === "reveal") return "bg-indigo-600/20 text-indigo-200 border-indigo-500/40";
  if (stage === "round_summary") return "bg-violet-600/20 text-violet-200 border-violet-500/40";
  if (stage === "countdown") return "bg-amber-600/20 text-amber-200 border-amber-500/40";
  if (stage === "wait") return "bg-slate-600/20 text-slate-200 border-slate-500/40";
  return "bg-slate-600/20 text-slate-200 border-slate-500/40";
}

function TrophyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="block h-10 w-10"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      preserveAspectRatio="xMidYMid meet"
    >
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10" />
      <path d="M17 4v7a5 5 0 0 1-10 0V4" />
      <path d="M5 9h2a3 3 0 0 0 3 3" />
      <path d="M19 9h-2a3 3 0 0 1-3 3" />
    </svg>
  );
}

function formatScore(n: number) {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function PlayerPage() {
  const params = useParams<{ code?: string }>();
  const router = useRouter();
  const code = String(params?.code ?? "").toUpperCase();

  const [state, setState] = useState<RoomState | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string>("");
  const [teamName, setTeamName] = useState<string>("");

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [submittedIndex, setSubmittedIndex] = useState<number | null>(null);
  const [mcqSubmitting, setMcqSubmitting] = useState(false);
  const [mcqAutoSubmitted, setMcqAutoSubmitted] = useState(false);

  const [typedValue, setTypedValue] = useState("");
  const [typedSubmitted, setTypedSubmitted] = useState(false);
  const [typedIsCorrect, setTypedIsCorrect] = useState<boolean | null>(null);

  const [answerError, setAnswerError] = useState<string | null>(null);

  // Key point: reset UI by question index, not only by question id.
  const [lastQuestionKey, setLastQuestionKey] = useState<string | null>(null);

  const [audioEnabled, setAudioEnabled] = useState(false);
  const [autoplayFailed, setAutoplayFailed] = useState(false);
  const [playedForQ, setPlayedForQ] = useState<string | null>(null);
  const [preparedForQ, setPreparedForQ] = useState<string | null>(null);

  const [jokerBusy, setJokerBusy] = useState(false);
  const [jokerError, setJokerError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoSubmitAttemptKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!code) return;
    setPlayerId(localStorage.getItem(`mtq_player_${code}`));
    setPlayerName(localStorage.getItem(`mtq_player_name_${code}`) ?? "");
    setTeamName(localStorage.getItem(`mtq_team_name_${code}`) ?? "");
  }, [code]);

  useEffect(() => {
    if (!code) return;

    let cancelled = false;

    async function tick() {
      const res = await fetch(`/api/room/state?code=${code}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!cancelled) {
        setState(data);
        if (data?.serverNow) {
          const serverNowMs = Date.parse(String(data.serverNow));
          if (Number.isFinite(serverNowMs)) {
            setServerOffsetMs(serverNowMs - Date.now());
          }
        }
      }
    }

    tick();
    const id = setInterval(tick, 500);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [code]);

  useEffect(() => {
    const id = window.setInterval(() => setLiveNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  // Reset local answer state when the question changes.
  useEffect(() => {
    const qi = state?.questionIndex;
    if (qi === undefined || qi === null) return;

    const qid = String(state?.question?.id ?? "");
    const key = `${qi}:${qid}`;

    if (key !== lastQuestionKey) {
      setLastQuestionKey(key);

      setSelectedIndex(null);
      setSubmittedIndex(null);
      setMcqSubmitting(false);
      setMcqAutoSubmitted(false);
      autoSubmitAttemptKeyRef.current = null;

      setTypedValue("");
      setTypedSubmitted(false);
      setTypedIsCorrect(null);

      setAnswerError(null);

      setPlayedForQ(null);
      setPreparedForQ(null);
      setAutoplayFailed(false);
    }
  }, [state?.questionIndex, state?.question?.id, lastQuestionKey]);

  const gameMode = String(state?.gameMode ?? "teams") === "solo" ? "solo" : "teams";
  const teamScoreMode = String(state?.teamScoreMode ?? "total") === "average" ? "average" : "total";

  const audioMode = String(state?.audioMode ?? "display");
  const shouldPlayOnPhone = audioMode === "phones" || audioMode === "both";

  const q = state?.question;
  const answerType = String(q?.answerType ?? "mcq");

  const isAudioQ = q?.roundType === "audio";
  const isPictureQ = q?.roundType === "picture";
  const isTextQ = q?.answerType === "text";

  const correctIndex = state?.reveal?.answerIndex ?? null;
  const inReveal = Boolean(state?.reveal);

  const canAnswer = useMemo(() => {
    if (state?.phase !== "running") return false;
    if (state?.stage !== "open") return false;
    if (!q?.id) return false;

    if (answerType === "text") return !typedSubmitted;
    return submittedIndex === null && !mcqSubmitting;
  }, [state?.phase, state?.stage, q?.id, answerType, typedSubmitted, submittedIndex, mcqSubmitting]);

  const players = useMemo(() => {
    return Array.isArray(state?.players) ? state.players : [];
  }, [state]);

  const myPlayer = useMemo(() => {
    if (!playerId) return null;
    return players.find((p: any) => p.id === playerId) ?? null;
  }, [players, playerId]);

  const myJokerIndex = useMemo(() => {
    const v = Number(myPlayer?.joker_round_index);
    return Number.isFinite(v) ? v : null;
  }, [myPlayer?.joker_round_index]);

  const roundsPlan = useMemo(() => {
    const plan = Array.isArray(state?.rounds?.plan) ? state.rounds.plan : null;
    if (plan && plan.length) return plan;

    const names = Array.isArray(state?.rounds?.names) ? state.rounds.names : [];
    return names.map((n: any, i: number) => ({
      index: i,
      number: i + 1,
      name: String(n ?? "").trim() || `Round ${i + 1}`,
      size: null,
    }));
  }, [state]);

  const currentRound = state?.rounds?.current ?? null;
  const isUntimedAnswers = Boolean(state?.settings?.untimedAnswers);
  const closeAtMs = state?.times?.closeAt ? Date.parse(String(state.times.closeAt)) : null;
  const adjustedNowMs = liveNowMs + serverOffsetMs;
  const secondsRemaining =
    closeAtMs && Number.isFinite(closeAtMs)
      ? Math.max(0, Math.ceil((closeAtMs - adjustedNowMs) / 1000))
      : 0;

  useEffect(() => {
    if (!playerId || !q?.id) return;
    if (answerType !== "mcq") return;
    if (state?.phase !== "running") return;
    if (state?.stage !== "open") return;
    if (isUntimedAnswers) return;
    if (selectedIndex === null) return;
    if (submittedIndex !== null) return;
    if (mcqSubmitting) return;
    if (!closeAtMs || !Number.isFinite(closeAtMs)) return;

    const millisRemaining = closeAtMs - adjustedNowMs;
    if (millisRemaining > 900) return;

    const attemptKey = `${q.id}:${selectedIndex}`;
    if (autoSubmitAttemptKeyRef.current === attemptKey) return;
    autoSubmitAttemptKeyRef.current = attemptKey;

    void submitMcqOption(selectedIndex, "auto");
  }, [
    playerId,
    q?.id,
    answerType,
    state?.phase,
    state?.stage,
    isUntimedAnswers,
    selectedIndex,
    submittedIndex,
    mcqSubmitting,
    closeAtMs,
    adjustedNowMs,
  ]);

  const teamRows = useMemo(() => {
    const byTeam = new Map<string, { label: string; total: number; size: number }>();
    for (const p of players) {
      const team = String(p.team_name ?? "").trim() || "No team";
      const entry = byTeam.get(team) ?? { label: team, total: 0, size: 0 };
      entry.total += Number(p.score ?? 0);
      entry.size += 1;
      byTeam.set(team, entry);
    }

    const rows = Array.from(byTeam.values()).map((t) => {
      const avg = t.size > 0 ? t.total / t.size : 0;
      const score = teamScoreMode === "average" ? avg : t.total;
      return { id: t.label, label: t.label, score, size: t.size, total: t.total, avg };
    });

    return rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.total !== a.total) return b.total - a.total;
      return a.label.localeCompare(b.label);
    });
  }, [players, teamScoreMode]);

  const soloRows = useMemo(() => {
    return [...players]
      .map((p: any) => ({ id: p.id, label: String(p.name ?? ""), score: Number(p.score ?? 0) }))
      .sort((a, b) => (b.score - a.score) || a.label.localeCompare(b.label));
  }, [players]);

  const scoreboardRows = gameMode === "solo" ? soloRows : teamRows;

  const myTeamRow = useMemo(() => {
    if (gameMode !== "teams") return null;
    const tn = String(myPlayer?.team_name ?? teamName ?? "").trim() || "No team";
    return teamRows.find((t) => t.label === tn) ?? null;
  }, [gameMode, myPlayer?.team_name, teamName, teamRows]);

  function pickOption(optionIndex: number) {
    if (!canAnswer) return;
    setAnswerError(null);
    setSelectedIndex(optionIndex);
  }

  async function submitMcqOption(optionIndex: number, mode: "manual" | "auto" = "manual") {
    if (!playerId || !q?.id) return false;
    if (!canAnswer) return false;
    if (!Number.isFinite(optionIndex)) return false;

    setAnswerError(null);
    setMcqSubmitting(true);

    try {
      const res = await fetch("/api/room/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, playerId, questionId: q.id, optionIndex }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setAnswerError(data?.error ?? "Could not send answer.");
        setMcqSubmitting(false);
        return false;
      }

      if (data?.accepted === false) {
        if (data?.reason === "already_answered") {
          setSubmittedIndex(-1);
          setSelectedIndex(null);
          setAnswerError("You already submitted an answer for this question.");
          setMcqSubmitting(false);
          return false;
        }

        if (mode === "auto" && data?.reason === "not_open") {
          setAnswerError("Time expired before your selected answer could be locked in.");
          setMcqSubmitting(false);
          return false;
        }

        setAnswerError("Answer not accepted.");
        setMcqSubmitting(false);
        return false;
      }

      setSubmittedIndex(optionIndex);
      setMcqAutoSubmitted(mode === "auto");
      setMcqSubmitting(false);
      return true;
    } catch {
      setAnswerError("Could not send answer.");
      setMcqSubmitting(false);
      return false;
    }
  }

  async function submitMcq() {
    if (selectedIndex === null) return;
    await submitMcqOption(selectedIndex, "manual");
  }

  async function submitTyped() {
    if (!playerId || !q?.id) return;
    if (!canAnswer) return;

    const trimmed = typedValue.trim();
    if (!trimmed) {
      setAnswerError("Type an answer first.");
      return;
    }

    setAnswerError(null);
    setTypedSubmitted(true);

    try {
      const res = await fetch("/api/room/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, playerId, questionId: q.id, answerText: trimmed }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.accepted === false) {
        setAnswerError(data?.error ?? "Answer not accepted.");
        setTypedSubmitted(false);
        return;
      }

      setTypedIsCorrect(Boolean(data?.isCorrect));
    } catch {
      setAnswerError("Could not send answer.");
      setTypedSubmitted(false);
    }
  }

  async function pickJoker(roundIndex: number) {
    if (!playerId) return;
    if (state?.phase !== "lobby") return;

    setJokerError(null);
    setJokerBusy(true);

    try {
      const res = await fetch("/api/room/joker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, playerId, jokerRoundIndex: roundIndex }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setJokerError(String(data?.error ?? "Could not save joker round."));
        setJokerBusy(false);
        return;
      }

      setJokerBusy(false);
    } catch {
      setJokerError("Could not save joker round.");
      setJokerBusy(false);
    }
  }

  async function unlockAudio() {
    setAudioEnabled(true);
    setAutoplayFailed(false);

    try {
      const AnyWindow = window as any;
      const Ctx = AnyWindow.AudioContext || AnyWindow.webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        await ctx.resume();
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        src.stop(0.01);
        await new Promise((r) => setTimeout(r, 20));
        await ctx.close();
      }
    } catch {
      // ignore
    }
  }

  function prepareClip() {
    const el = audioRef.current;
    if (!q?.audioUrl || !el) return;
    if (preparedForQ === q.id) return;

    try {
      el.pause();
      el.currentTime = 0;
    } catch {
      // ignore
    }

    el.src = q.audioUrl;
    el.preload = "auto";
    el.load();
    setPreparedForQ(q.id);
  }

  async function playClip(): Promise<boolean> {
    const el = audioRef.current;
    if (!q?.audioUrl || !el) return false;

    try {
      if (preparedForQ !== q.id) {
        el.src = q.audioUrl;
        el.preload = "auto";
        el.load();
        setPreparedForQ(q.id);
      }
      await el.play();
      return true;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    if (!shouldPlayOnPhone) return;
    if (!isAudioQ) return;
    if (!q?.audioUrl) return;
    prepareClip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPlayOnPhone, isAudioQ, q?.id, q?.audioUrl]);

  useEffect(() => {
    if (!shouldPlayOnPhone) return;
    if (!audioEnabled) return;
    if (!isAudioQ) return;
    if (state?.stage !== "open") return;
    if (!q?.audioUrl) return;
    if (playedForQ === q.id) return;

    let cancelled = false;

    async function attempt() {
      const ok = await playClip();
      if (cancelled) return;

      if (ok) {
        setPlayedForQ(q.id);
        setAutoplayFailed(false);
        return;
      }

      setAutoplayFailed(true);
    }

    attempt().catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPlayOnPhone, audioEnabled, isAudioQ, state?.stage, q?.id, q?.audioUrl, playedForQ]);

  if (!code) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <Card>
          <CardContent className="py-8 text-sm text-[var(--muted-foreground)]">
            Missing room code in the URL.
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!playerId) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Player not found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-[var(--muted-foreground)]">
            This phone does not have a player ID for room {code}. Go back to Join and enter the code again.
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button onClick={() => router.push(`/join?code=${code}`)}>Go to Join</Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  if (!state) return null;

  const stage = String(state?.stage ?? "");
  const status = statusText(stage);

  const questionNumber = Number(state.questionIndex ?? 0) + 1;
  const questionCount = Number(state.questionCount ?? 0);

  const showLobby = state.phase === "lobby";
  const finished = state.phase === "finished";

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <audio ref={audioRef} />

      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-xs text-[var(--muted-foreground)]">Room</div>
          <div className="text-lg font-semibold tracking-wide">{code}</div>
          {playerName ? (
            <div className="text-xs text-[var(--muted-foreground)]">
              Player: <span className="text-[var(--foreground)]">{playerName}</span>
              {gameMode === "teams" && teamName ? (
                <>
                  <span className="mx-2">|</span>
                  Team: <span className="text-[var(--foreground)]">{teamName}</span>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          {status ? (
            <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(stage)}`}>{status}</span>
          ) : null}

          {state.phase === "running" ? (
            <div className="flex flex-col items-end gap-2">
              {currentRound ? (
                <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs text-[var(--muted-foreground)]">
                  R{Number(currentRound.number ?? 0)}: {String(currentRound.name ?? "")}
                </span>
              ) : null}

              <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs text-[var(--muted-foreground)]">
                Q{questionNumber} of {questionCount}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {showLobby ? (
        <Card>
          <CardHeader>
            <CardTitle>Waiting to start</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-[var(--muted-foreground)]">
            <div>You have joined. Wait for the host to start the game.</div>

            {shouldPlayOnPhone ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-2">
                {!audioEnabled ? (
                  <Button onClick={unlockAudio} variant="secondary">
                    Enable audio on this phone
                  </Button>
                ) : (
                  <div>Audio enabled for this phone.</div>
                )}
              </div>
            ) : null}

            {roundsPlan.length > 0 ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-3">
                <div className="text-sm font-medium text-[var(--foreground)]">Rounds</div>
                <div className="mt-2 grid gap-1">
                  {roundsPlan.map((r: any) => (
                    <div key={r.index} className="flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate">
                        {Number(r.number)}. {String(r.name)}
                      </div>
                      {r.size ? (
                        <div className="text-xs text-[var(--muted-foreground)] tabular-nums">
                          {Number(r.size)} questions
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {roundsPlan.length > 0 ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-3">
                <div className="text-sm font-medium text-[var(--foreground)]">Pick your Joker round</div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  {roundsPlan.map((r: any) => {
                    const selected = myJokerIndex === Number(r.index);
                    return (
                      <Button
                        key={r.index}
                        variant={selected ? "primary" : "secondary"}
                        disabled={jokerBusy}
                        onClick={() => pickJoker(Number(r.index))}
                      >
                        {String(r.name)}
                      </Button>
                    );
                  })}
                </div>

                <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                  In your Joker round: correct +2. Wrong -1. No submitted answer -1.
                </div>

                {jokerError ? (
                  <div className="mt-2 rounded-lg border border-red-300 bg-red-600/10 px-3 py-2 text-sm text-red-600">
                    {jokerError}
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {finished ? (
        <GameCompletedSummary
          gameMode={gameMode}
          teamScoreMode={teamScoreMode}
          finalResults={state?.finalResults}
          highlightPlayerId={playerId}
          highlightTeamName={myTeamRow?.label ?? teamName}
        />
      ) : null}

      {!showLobby && !finished && stage === "round_summary" ? (
        <RoundSummaryCard
          round={currentRound}
          roundStats={state?.roundStats}
          isLastQuestionOverall={Boolean(state?.flow?.isLastQuestionOverall)}
          roundSummaryEndsAt={state?.times?.roundSummaryEndsAt ?? null}
        />
      ) : null}

      {!showLobby && !finished && stage !== "round_summary" && q ? (
        <div className="grid gap-4">
          {myPlayer || (state.phase === "running" && stage === "open") ? (
            <div className="grid grid-cols-2 gap-3">
              {myPlayer ? (
                <Card>
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0 text-xs text-[var(--muted-foreground)]">Your score</div>
                    <div className="shrink-0 text-base font-semibold tabular-nums sm:text-lg">
                      {myPlayer.score ?? 0}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div />
              )}

              {state.phase === "running" && stage === "open" ? (
                <Card>
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0 text-xs text-[var(--muted-foreground)]">
                      {isUntimedAnswers ? "Answer window" : "Time remaining"}
                    </div>
                    <div className="text-right text-sm font-semibold leading-tight tabular-nums sm:text-base">
                      {isUntimedAnswers ? "Waiting for host" : formatDuration(secondsRemaining)}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div />
              )}
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Question</CardTitle>
                <div className="text-sm text-[var(--muted-foreground)]">
                  {q.roundType === "audio" ? "Audio" : q.roundType === "picture" ? "Picture" : "General"}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {isPictureQ && q.imageUrl ? (
                <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--muted)]">
                  <img src={q.imageUrl} alt="" className="w-full max-h-[280px] object-contain" />
                </div>
              ) : null}

              <div className="text-base font-semibold leading-tight">{q.text}</div>

              {isAudioQ && shouldPlayOnPhone ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3">
                  {!audioEnabled ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-[var(--muted-foreground)]">Audio for this question</div>
                      <Button onClick={unlockAudio} variant="secondary" size="sm">
                        Enable audio
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-sm text-[var(--muted-foreground)]">
                        Audio enabled{autoplayFailed ? ". Tap Play clip." : "."}
                      </div>
                      <Button
                        onClick={async () => {
                          setAutoplayFailed(false);
                          await playClip();
                        }}
                        variant="secondary"
                        size="sm"
                      >
                        Play clip
                      </Button>
                    </div>
                  )}
                </div>
              ) : isAudioQ && audioMode === "display" ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3 text-sm text-[var(--muted-foreground)]">
                  Audio plays on the TV display.
                </div>
              ) : null}

              {answerError ? (
                <div className="rounded-lg border border-red-300 bg-red-600/10 px-3 py-2 text-sm text-red-600">
                  {answerError}
                </div>
              ) : null}

              {isTextQ ? (
                <div className="grid gap-2">
                  <Input
                    value={typedValue}
                    onChange={(e) => setTypedValue(e.target.value)}
                    placeholder="Type your answer"
                    disabled={!canAnswer}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="secondary" onClick={() => setTypedValue("")} disabled={!canAnswer || !typedValue.trim()}>
                      Clear
                    </Button>
                    <Button onClick={submitTyped} disabled={!canAnswer || !typedValue.trim()}>
                      Submit
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2">
                  {Array.isArray(q.options) ? (
                    <>
                      {q.options.map((opt: string, idx: number) => {
                        const selected = selectedIndex === idx;
                        const submitted = submittedIndex !== null;

                        let cls = "rounded-xl border px-3 py-3 text-left text-sm transition-colors";
                        cls += " border-[var(--border)] hover:bg-emerald-600/10";

                        if (selected && !submitted) cls += " bg-emerald-600/15 border-emerald-500/40";
                        if (submitted) cls += " opacity-80 cursor-not-allowed";

                        if (inReveal && correctIndex === idx) cls += " bg-emerald-600/10 border-emerald-600/30";
                        if (inReveal && submittedIndex === idx && correctIndex !== idx) cls += " bg-red-600/10 border-red-600/30";

                        return (
                          <button
                            key={idx}
                            className={cls}
                            onClick={() => pickOption(idx)}
                            disabled={!canAnswer || mcqSubmitting}
                          >
                            <div className="font-medium text-[var(--foreground)]">Option {idx + 1}</div>
                            <div className="mt-1 text-[var(--muted-foreground)]">{opt}</div>
                          </button>
                        );
                      })}

                      {mcqAutoSubmitted && submittedIndex !== null && !inReveal ? (
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-200">
                          Time expired, so your selected answer was submitted automatically.
                        </div>
                      ) : null}

                      {!inReveal ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setSelectedIndex(null);
                              setAnswerError(null);
                            }}
                            disabled={!canAnswer || selectedIndex === null}
                          >
                            Clear
                          </Button>

                          <Button onClick={submitMcq} disabled={!canAnswer || selectedIndex === null}>
                            {mcqSubmitting ? "Submitting..." : "Submit"}
                          </Button>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </main>
  );
}