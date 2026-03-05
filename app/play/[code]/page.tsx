"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type RoomState = any;

function TrophyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="block h-12 w-12"
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

function statusText(stage: string) {
  if (stage === "countdown") return "Get ready";
  if (stage === "open") return "Answer now";
  if (stage === "wait") return "Waiting";
  if (stage === "reveal") return "Reveal";
  if (stage === "needs_advance") return "Next question";
  return "";
}

function pillClass(stage: string) {
  if (stage === "open") return "bg-emerald-600/10 text-emerald-700 border-emerald-600/20 dark:text-emerald-200";
  if (stage === "reveal") return "bg-indigo-600/10 text-indigo-700 border-indigo-600/20 dark:text-indigo-200";
  if (stage === "countdown") return "bg-amber-600/10 text-amber-700 border-amber-600/20 dark:text-amber-200";
  if (stage === "wait") return "bg-slate-600/10 text-slate-700 border-slate-600/20 dark:text-slate-200";
  return "bg-slate-600/10 text-slate-700 border-slate-600/20 dark:text-slate-200";
}

export default function PlayerPage() {
  const params = useParams<{ code?: string }>();
  const code = String(params?.code ?? "").toUpperCase();

  const [state, setState] = useState<RoomState | null>(null);

  const [audioEnabled, setAudioEnabled] = useState(false);
  const [playedForQ, setPlayedForQ] = useState<string | null>(null);
  const [preparedForQ, setPreparedForQ] = useState<string | null>(null);
  const [autoplayFailed, setAutoplayFailed] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [submittedIndex, setSubmittedIndex] = useState<number | null>(null);
  const [mcqSubmitting, setMcqSubmitting] = useState(false);

  const [typedValue, setTypedValue] = useState("");
  const [typedSubmitted, setTypedSubmitted] = useState(false);
  const [typedIsCorrect, setTypedIsCorrect] = useState<boolean | null>(null);

  const [answerError, setAnswerError] = useState<string | null>(null);

  const [jokerBusy, setJokerBusy] = useState(false);
  const [jokerError, setJokerError] = useState<string | null>(null);

  const lastQuestionId = useMemo(() => String(state?.question?.id ?? ""), [state?.question?.id]);

  useEffect(() => {
    if (!code) return;

    const pid = localStorage.getItem(`mtq_player_${code}`);
    const pn = localStorage.getItem(`mtq_player_name_${code}`);
    const tn = localStorage.getItem(`mtq_team_name_${code}`);

    setPlayerId(pid);
    setPlayerName(pn);
    setTeamName(tn);
  }, [code]);

  async function unlockAudio() {
    setAudioEnabled(true);
  }

  async function prepareClip() {
    const q = state?.question;
    const el = audioRef.current;
    if (!q?.audioUrl || !el) return;

    try {
      el.pause();
      el.src = q.audioUrl;
      el.load();
    } catch {
      // ignore
    }
  }

  async function playClip() {
    const el = audioRef.current;
    if (!el) return;

    try {
      await el.play();
    } catch {
      setAutoplayFailed(true);
    }
  }

  useEffect(() => {
    if (!code) return;

    let cancelled = false;

    async function tick() {
      const res = await fetch(`/api/room/state?code=${code}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!cancelled) setState(data);
    }

    tick();
    const id = setInterval(tick, 500);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [code]);

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

  const roundsPlan = Array.isArray(state?.rounds?.plan) ? state.rounds.plan : [];
  const currentRound = state?.rounds?.current ?? null;

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
    const v = myPlayer?.joker_round_index;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }, [myPlayer?.joker_round_index]);

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

  function formatScore(n: number) {
    if (!Number.isFinite(n)) return "0";
    const rounded = Math.round(n * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  useEffect(() => {
    if (!state?.question?.id) return;

    if (lastQuestionId && state.question.id !== lastQuestionId) {
      setSelectedIndex(null);
      setSubmittedIndex(null);
      setMcqSubmitting(false);

      setTypedValue("");
      setTypedSubmitted(false);
      setTypedIsCorrect(null);

      setAnswerError(null);

      setPlayedForQ(null);
      setPreparedForQ(null);
      setAutoplayFailed(false);
    }
  }, [state?.question?.id, lastQuestionId]);

  useEffect(() => {
    const qid = String(state?.question?.id ?? "");
    if (!qid) return;
    if (!shouldPlayOnPhone) return;
    if (!audioEnabled) return;
    if (!isAudioQ) return;
    if (state?.stage !== "open") return;
    if (preparedForQ === qid) return;

    setPreparedForQ(qid);
    prepareClip().catch(() => {});
  }, [state, shouldPlayOnPhone, audioEnabled, isAudioQ, preparedForQ]);

  useEffect(() => {
    const qid = String(state?.question?.id ?? "");
    if (!qid) return;
    if (!shouldPlayOnPhone) return;
    if (!audioEnabled) return;
    if (!isAudioQ) return;
    if (state?.stage !== "open") return;
    if (playedForQ === qid) return;
    if (autoplayFailed) return;

    setPlayedForQ(qid);
    playClip().catch(() => {});
  }, [state, shouldPlayOnPhone, audioEnabled, isAudioQ, playedForQ, autoplayFailed]);

  const stage = String(state?.stage ?? "");
  const status = statusText(stage);

  const questionNumber = Number(state?.questionIndex ?? 0) + 1;
  const questionCount = Number(state?.questionCount ?? 0);

  const showLobby = state?.phase === "lobby";
  const finished = state?.phase === "finished";

  function pickOption(optionIndex: number) {
    if (!canAnswer) return;
    setAnswerError(null);
    setSelectedIndex(optionIndex);
  }

  async function submitMcq() {
    if (!playerId || !q?.id) return;
    if (!canAnswer) return;
    if (selectedIndex === null) return;

    setAnswerError(null);
    setMcqSubmitting(true);

    try {
      const res = await fetch("/api/room/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, playerId, questionId: q.id, optionIndex: selectedIndex }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setAnswerError(data?.error ?? "Could not send answer.");
        setMcqSubmitting(false);
        return;
      }

      if (data?.accepted === false) {
        if (data?.reason === "already_answered") {
          setSubmittedIndex(-1);
          setSelectedIndex(null);
          setAnswerError("You already submitted an answer for this question.");
          setMcqSubmitting(false);
          return;
        }
        setAnswerError("Could not send answer.");
        setMcqSubmitting(false);
        return;
      }

      setSubmittedIndex(selectedIndex);
      setMcqSubmitting(false);
    } catch {
      setAnswerError("Could not send answer.");
      setMcqSubmitting(false);
    }
  }

  async function submitText() {
    if (!playerId || !q?.id) return;
    if (!canAnswer) return;
    const clean = typedValue.trim();
    if (!clean) return;

    setAnswerError(null);

    try {
      const res = await fetch("/api/room/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, playerId, questionId: q.id, answerText: clean }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setAnswerError(data?.error ?? "Could not send answer.");
        return;
      }

      if (data?.accepted === false) {
        if (data?.reason === "already_answered") {
          setTypedSubmitted(true);
          setAnswerError("You already submitted an answer for this question.");
          return;
        }
        setAnswerError("Could not send answer.");
        return;
      }

      setTypedSubmitted(true);
      setTypedIsCorrect(Boolean(data?.isCorrect));
    } catch {
      setAnswerError("Could not send answer.");
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

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <audio ref={audioRef} />

      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-sm text-[var(--muted-foreground)]">Room</div>
          <div className="text-lg font-semibold tracking-wide">{code}</div>
          {playerName ? (
            <div className="text-xs text-[var(--muted-foreground)]">
              Player: <span className="text-[var(--foreground)]">{playerName}</span>
              {gameMode === "teams" && teamName ? (
                <>
                  <span className="mx-2">•</span>
                  Team: <span className="text-[var(--foreground)]">{teamName}</span>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          {status ? (
            <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(stage)}`}>
              {status}
            </span>
          ) : null}

          {state?.phase === "running" ? (
            <div className="flex flex-wrap justify-end gap-2">
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
            <div>You’ve joined. Wait for the host to start the game.</div>

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
                      <div className="text-xs text-[var(--muted-foreground)] tabular-nums">
                        {Number(r.size)} questions
                      </div>
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

                {myJokerIndex !== null ? (
                  <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                    Your current Joker:{" "}
                    <span className="text-[var(--foreground)]">
                      {String(roundsPlan.find((r: any) => Number(r.index) === myJokerIndex)?.name ?? `Round ${myJokerIndex + 1}`)}
                    </span>
                  </div>
                ) : null}

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
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Game completed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-[56px,1fr] items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4">
                <div className="grid h-14 w-14 place-items-center text-[var(--foreground)]">
                  <TrophyIcon />
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-[var(--muted-foreground)]">Final scores</div>
                  <div className="text-base font-semibold">Thanks for playing</div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--card)]">
                    <tr className="border-b border-[var(--border)]">
                      <th className="w-10 px-3 py-2 text-left font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">{gameMode === "solo" ? "Player" : "Team"}</th>
                      <th className="w-20 px-3 py-2 text-right font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoreboardRows.map((r: any, idx: number) => {
                      const isMe = gameMode === "solo" ? r.id === playerId : r.label === myTeamRow?.label;
                      return (
                        <tr key={r.id} className="border-b border-[var(--border)] last:border-b-0">
                          <td className="px-3 py-2 text-[var(--muted-foreground)] tabular-nums">{idx + 1}</td>
                          <td className={`px-3 py-2 ${isMe ? "font-semibold" : "font-medium"}`}>
                            {r.label}
                            {gameMode === "teams" ? (
                              <span className="ml-2 text-xs text-[var(--muted-foreground)]">{r.size} players</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatScore(Number(r.score ?? 0))}</td>
                        </tr>
                      );
                    })}
                    {scoreboardRows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-sm text-[var(--muted-foreground)]" colSpan={3}>
                          No scores yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {state?.phase === "running" && q ? (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Question</CardTitle>
              {currentRound ? (
                <div className="text-sm text-[var(--muted-foreground)]">
                  Round {Number(currentRound.number ?? 0)}: {String(currentRound.name ?? "")}
                </div>
              ) : null}
            </CardHeader>

            <CardContent className="space-y-4">
              {isPictureQ && q.imageUrl ? (
                <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                  <img src={q.imageUrl} alt="" className="block w-full" />
                </div>
              ) : null}

              <div className="text-base font-semibold">{q.text}</div>

              {isAudioQ && audioMode === "display" ? (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm text-[var(--muted-foreground)]">
                  Audio plays on the TV display for this game.
                </div>
              ) : null}

              {isAudioQ && shouldPlayOnPhone ? (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-2">
                  {!audioEnabled ? (
                    <Button onClick={unlockAudio} variant="secondary">
                      Enable audio on this phone
                    </Button>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-[var(--muted-foreground)]">
                        Audio enabled.
                      </div>
                      <Button
                        onClick={() => {
                          setAutoplayFailed(false);
                          playClip().catch(() => {});
                        }}
                        variant="secondary"
                      >
                        Play
                      </Button>
                    </div>
                  )}

                  {autoplayFailed ? (
                    <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                      Tap Play to start audio.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {answerType === "mcq" && Array.isArray(q.options) ? (
                <div className="grid gap-2">
                  {q.options.map((opt: string, idx: number) => {
                    const selected = selectedIndex === idx;
                    const submitted = submittedIndex !== null;
                    const isCorrectChoice = inReveal && correctIndex === idx;
                    const isMyChoice = inReveal && submittedIndex === idx;

                    let cls = "rounded-xl border px-3 py-3 text-left text-sm transition-colors";
                    cls += " border-[var(--border)]";

                    if (selected && !submitted) cls += " bg-[var(--muted)]";
                    if (submitted) cls += " opacity-80 cursor-not-allowed";

                    if (inReveal && isCorrectChoice) cls += " bg-emerald-600/10 border-emerald-600/30";
                    if (inReveal && isMyChoice && !isCorrectChoice) cls += " bg-red-600/10 border-red-600/30";

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
                        {mcqSubmitting ? "Submitting…" : "Submit"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {answerType === "text" ? (
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
                    <Button onClick={submitText} disabled={!canAnswer || !typedValue.trim()}>
                      Submit
                    </Button>
                  </div>

                  {typedSubmitted ? (
                    <div className="text-sm text-[var(--muted-foreground)]">
                      Answer submitted.
                    </div>
                  ) : null}

                  {typedSubmitted && typedIsCorrect !== null ? (
                    <div className={`text-sm ${typedIsCorrect ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}`}>
                      {typedIsCorrect ? "Correct" : "Wrong"}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {answerError ? (
                <div className="rounded-lg border border-red-300 bg-red-600/10 px-3 py-2 text-sm text-red-600">
                  {answerError}
                </div>
              ) : null}
            </CardContent>

            {inReveal ? (
              <CardFooter className="flex flex-col items-start gap-2">
                <div className="text-sm text-[var(--muted-foreground)]">Answer</div>
                {state?.reveal?.answerType === "mcq" ? (
                  <div className="text-base font-semibold text-[var(--foreground)]">
                    Option {Number(correctIndex ?? 0) + 1}
                  </div>
                ) : (
                  <div className="text-base font-semibold text-[var(--foreground)]">
                    {String(state?.reveal?.answerText ?? "")}
                  </div>
                )}
                {state?.reveal?.explanation ? (
                  <div className="text-sm text-[var(--muted-foreground)]">{String(state.reveal.explanation)}</div>
                ) : null}
              </CardFooter>
            ) : null}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Scoreboard</CardTitle>
              {gameMode === "teams" && teamScoreMode === "average" ? (
                <div className="text-sm text-[var(--muted-foreground)]">Showing average points per player.</div>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--card)]">
                    <tr className="border-b border-[var(--border)]">
                      <th className="w-10 px-3 py-2 text-left font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">{gameMode === "solo" ? "Player" : "Team"}</th>
                      <th className="w-20 px-3 py-2 text-right font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoreboardRows.slice(0, 10).map((r: any, idx: number) => {
                      const isMe = gameMode === "solo" ? r.id === playerId : r.label === myTeamRow?.label;
                      return (
                        <tr key={r.id} className="border-b border-[var(--border)] last:border-b-0">
                          <td className="px-3 py-2 text-[var(--muted-foreground)] tabular-nums">{idx + 1}</td>
                          <td className={`px-3 py-2 ${isMe ? "font-semibold" : "font-medium"}`}>
                            {r.label}
                            {gameMode === "teams" ? (
                              <span className="ml-2 text-xs text-[var(--muted-foreground)]">{r.size} players</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatScore(Number(r.score ?? 0))}</td>
                        </tr>
                      );
                    })}
                    {scoreboardRows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-sm text-[var(--muted-foreground)]" colSpan={3}>
                          No scores yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {scoreboardRows.length > 10 ? (
                <div className="text-xs text-[var(--muted-foreground)]">
                  Showing top 10 of {scoreboardRows.length}.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </main>
  );
}