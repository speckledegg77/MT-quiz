"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type RoomState = any;

function statusText(stage: string) {
  if (stage === "countdown") return "Get ready";
  if (stage === "open") return "Answer now";
  if (stage === "wait") return "Waiting for answers";
  if (stage === "reveal") return "Reveal";
  if (stage === "needs_advance") return "Next question";
  return "";
}

function pillClass(stage: string) {
  if (stage === "open") return "bg-emerald-600/20 text-emerald-200 border-emerald-500/40";
  if (stage === "reveal") return "bg-indigo-600/20 text-indigo-200 border-indigo-500/40";
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

export default function PlayerPage() {
  const params = useParams<{ code?: string }>();
  const router = useRouter();
  const code = String(params?.code ?? "").toUpperCase();

  const [state, setState] = useState<RoomState | null>(null);

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string>("");

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [typedValue, setTypedValue] = useState("");
  const [typedSubmitted, setTypedSubmitted] = useState(false);
  const [typedIsCorrect, setTypedIsCorrect] = useState<boolean | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);

  const [lastQuestionId, setLastQuestionId] = useState<string | null>(null);

  const [audioEnabled, setAudioEnabled] = useState(false);
  const [autoplayFailed, setAutoplayFailed] = useState(false);
  const [playedForQ, setPlayedForQ] = useState<string | null>(null);
  const [preparedForQ, setPreparedForQ] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!code) return;
    setPlayerId(localStorage.getItem(`mtq_player_${code}`));
    setPlayerName(localStorage.getItem(`mtq_player_name_${code}`) ?? "");
  }, [code]);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;

    async function tick() {
      const res = await fetch(`/api/room/state?code=${code}`, { cache: "no-store" });
      const data = await res.json();
      if (!cancelled) setState(data);
    }

    tick();
    const id = setInterval(tick, 500);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [code]);

  useEffect(() => {
    const qid = state?.question?.id ?? null;
    if (!qid) return;

    if (qid !== lastQuestionId) {
      setLastQuestionId(qid);
      setSelectedIndex(null);
      setTypedValue("");
      setTypedSubmitted(false);
      setTypedIsCorrect(null);
      setAnswerError(null);

      setPlayedForQ(null);
      setPreparedForQ(null);
      setAutoplayFailed(false);
    }
  }, [state?.question?.id, lastQuestionId]);

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
    return selectedIndex === null;
  }, [state?.phase, state?.stage, q?.id, answerType, typedSubmitted, selectedIndex]);

  const scoreboard = useMemo(() => {
    const players = state?.players ?? [];
    const sorted = [...players].sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0));
    return sorted;
  }, [state]);

  const myPlayer = useMemo(() => {
    if (!playerId) return null;
    return (state?.players ?? []).find((p: any) => p.id === playerId) ?? null;
  }, [state, playerId]);

  async function answer(optionIndex: number) {
    if (!playerId || !q?.id) return;
    if (!canAnswer) return;

    setAnswerError(null);
    setSelectedIndex(optionIndex);

    await fetch("/api/room/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, playerId, questionId: q.id, optionIndex }),
    }).catch(() => {});
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
            This phone does not have a player ID for room {code}.
            Go back to Join and enter the code again.
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
              Team: <span className="text-[var(--foreground)]">{playerName}</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          {status ? (
            <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(stage)}`}>
              {status}
            </span>
          ) : null}

          {state.phase === "running" ? (
            <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs text-[var(--muted-foreground)]">
              Q{questionNumber} of {questionCount}
            </span>
          ) : null}
        </div>
      </div>

      {showLobby ? (
        <Card>
          <CardHeader>
            <CardTitle>Waiting to start</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-[var(--muted-foreground)]">
            You’ve joined. Wait for the host to start the game.
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
                      <th className="px-3 py-2 text-left font-medium">Team</th>
                      <th className="w-16 px-3 py-2 text-right font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoreboard.map((p: any, idx: number) => {
                      const isMe = p.id === playerId;
                      return (
                        <tr key={p.id} className="border-b border-[var(--border)] last:border-b-0">
                          <td className="px-3 py-2 text-[var(--muted-foreground)] tabular-nums">{idx + 1}</td>
                          <td className={`px-3 py-2 ${isMe ? "font-semibold" : "font-medium"}`}>{p.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{p.score ?? 0}</td>
                        </tr>
                      );
                    })}
                    {scoreboard.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-sm text-[var(--muted-foreground)]" colSpan={3}>
                          No players joined this game.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button variant="secondary" onClick={() => router.push(`/join?code=${code}`)}>
                Join another game
              </Button>
            </CardFooter>
          </Card>
        </div>
      ) : null}

      {!showLobby && !finished && q ? (
        <div className="grid gap-4">
          {myPlayer ? (
            <Card>
              <CardContent className="flex items-center justify-between py-4">
                <div className="text-sm text-[var(--muted-foreground)]">Your score</div>
                <div className="text-lg font-semibold tabular-nums">{myPlayer.score ?? 0}</div>
              </CardContent>
            </Card>
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
                    disabled={!canAnswer}
                    placeholder="Type your answer"
                    className="h-12 text-base"
                  />

                  <Button onClick={submitTyped} disabled={!canAnswer}>
                    Submit answer
                  </Button>

                  {typedSubmitted && !inReveal ? (
                    <div className="text-sm text-[var(--muted-foreground)]">Answer locked in.</div>
                  ) : null}

                  {inReveal && typedIsCorrect !== null ? (
                    <div className="text-sm text-[var(--muted-foreground)]">
                      {typedIsCorrect ? "You got it right." : "You got it wrong."}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="grid gap-2">
                  {(q.options ?? []).map((opt: string, i: number) => {
                    const isSelected = selectedIndex === i;
                    const isCorrect = inReveal && correctIndex !== null && i === correctIndex;
                    const isWrongSelected = inReveal && isSelected && !isCorrect;

                    const base = "rounded-xl border px-4 py-3 text-left text-sm";
                    const cls = isCorrect
                      ? "border-emerald-500/50 bg-emerald-600/15"
                      : isWrongSelected
                      ? "border-red-500/50 bg-red-600/15"
                      : isSelected && !inReveal
                      ? "border-emerald-500/30 bg-emerald-600/10"
                      : "border-[var(--border)] bg-[var(--card)]";

                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => answer(i)}
                        disabled={!canAnswer && !isSelected}
                        className={`${base} ${cls}`}
                      >
                        {opt}
                      </button>
                    );
                  })}

                  {selectedIndex !== null && !inReveal ? (
                    <div className="text-sm text-[var(--muted-foreground)]">Answer locked in.</div>
                  ) : null}

                  {inReveal && selectedIndex !== null && correctIndex !== null ? (
                    <div className="text-sm text-[var(--muted-foreground)]">
                      {selectedIndex === correctIndex ? "You got it right." : "You got it wrong."}
                    </div>
                  ) : null}
                </div>
              )}

              {inReveal ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3">
                  <div className="text-sm font-medium">Answer</div>
                  <div className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {state.reveal.answerType === "mcq" &&
                    state.reveal.answerIndex !== null &&
                    Array.isArray(q.options) &&
                    q.options[state.reveal.answerIndex]
                      ? q.options[state.reveal.answerIndex]
                      : null}
                    {state.reveal.answerType === "text" && state.reveal.answerText ? state.reveal.answerText : null}
                  </div>

                  {state.reveal.explanation ? (
                    <div className="mt-2 text-sm text-[var(--muted-foreground)]">{state.reveal.explanation}</div>
                  ) : null}
                </div>
              ) : null}

              {state.stage !== "open" && state.stage !== "reveal" ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3 text-sm text-[var(--muted-foreground)]">
                  Waiting for the next question.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Scoreboard</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--card)]">
                    <tr className="border-b border-[var(--border)]">
                      <th className="w-10 px-3 py-2 text-left font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">Team</th>
                      <th className="w-16 px-3 py-2 text-right font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoreboard.slice(0, 10).map((p: any, idx: number) => {
                      const isMe = p.id === playerId;
                      return (
                        <tr key={p.id} className="border-b border-[var(--border)] last:border-b-0">
                          <td className="px-3 py-2 text-[var(--muted-foreground)] tabular-nums">{idx + 1}</td>
                          <td className={`px-3 py-2 ${isMe ? "font-semibold" : "font-medium"}`}>{p.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{p.score ?? 0}</td>
                        </tr>
                      );
                    })}
                    {scoreboard.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-sm text-[var(--muted-foreground)]" colSpan={3}>
                          No players yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              {scoreboard.length > 10 ? (
                <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                  Showing top 10 only.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </main>
  );
}