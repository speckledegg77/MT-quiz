"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";

type RoomState = any;

function Trophy() {
  return (
    <svg
      viewBox="0 0 64 64"
      width="72"
      height="72"
      aria-hidden="true"
      className="opacity-90"
    >
      <path
        d="M20 10h24v10c0 10-8 18-18 18S8 30 8 20V10h12Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M22 12h20v8c0 9-7 16-16 16S10 29 10 20v-8h12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M10 14H4v6c0 7 5 12 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M54 14h6v6c0 7-5 12-12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M26 36v7c0 2-2 4-4 5v4h20v-4c-2-1-4-3-4-5v-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M20 56h24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

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

export default function DisplayPage() {
  const params = useParams<{ code?: string }>();
  const code = String(params?.code ?? "").toUpperCase();

  const [state, setState] = useState<RoomState | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [playedForQ, setPlayedForQ] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function unlockAudio() {
    setAudioEnabled(true);
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

  useEffect(() => {
    if (!code) return;

    let cancelled = false;

    async function tick() {
      const res = await fetch(`/api/room/state?code=${code}`, { cache: "no-store" });
      const data = await res.json();
      if (!cancelled) setState(data);

      if (data?.stage === "needs_advance") {
        await fetch("/api/room/advance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
      }
    }

    tick();
    const id = setInterval(tick, 500);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [code]);

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

  const scoreboard = useMemo(() => {
    const players = state?.players ?? [];
    return [...players].sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0));
  }, [state]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const joinUrl = useMemo(() => {
    if (!code || !origin) return "";
    return `${origin}/join?code=${code}`;
  }, [code, origin]);

  if (!code) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Card>
          <CardContent className="py-8 text-sm text-[var(--muted-foreground)]">
            Missing room code in the URL.
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!state) return null;

  const showJoin = state.phase === "lobby";
  const finished = state.phase === "finished";

  const q = state.question;
  const isAudioQ = q?.roundType === "audio";
  const isPictureQ = q?.roundType === "picture";
  const isTextQ = q?.answerType === "text";

  const stage = String(state.stage ?? "");
  const status = statusText(stage);

  const questionNumber = Number(state.questionIndex ?? 0) + 1;
  const questionCount = Number(state.questionCount ?? 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <audio ref={audioRef} />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm text-[var(--muted-foreground)]">Room</div>
          <div className="text-2xl font-semibold tracking-wide">{code}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {status ? (
            <span className={`rounded-full border px-3 py-1 text-sm ${pillClass(stage)}`}>
              {status}
            </span>
          ) : null}

          {state.phase === "running" ? (
            <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-sm text-[var(--muted-foreground)]">
              Q{questionNumber} of {questionCount}
            </span>
          ) : null}

          {shouldPlayOnDisplay && !audioEnabled ? (
            <Button variant="secondary" onClick={unlockAudio}>
              Enable audio
            </Button>
          ) : null}
        </div>
      </div>

      {finished ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Game completed</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4">
              <div className="flex h-16 w-16 items-center justify-center text-[var(--foreground)]">
                <Trophy />
              </div>
              <div className="min-w-0">
                  <div className="text-sm text-[var(--muted-foreground)]">Final scores</div>
                  <div className="text-lg font-semibold">Thanks for playing</div>
                  <div className="text-sm text-[var(--muted-foreground)]">
                    Start a new room from the Host page.
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--card)]">
                    <tr className="border-b border-[var(--border)]">
                      <th className="w-12 px-3 py-2 text-left font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">Team</th>
                      <th className="w-20 px-3 py-2 text-right font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoreboard.map((p: any, idx: number) => (
                      <tr key={p.id} className="border-b border-[var(--border)] last:border-b-0">
                        <td className="px-3 py-2 text-[var(--muted-foreground)] tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.score ?? 0}</td>
                      </tr>
                    ))}
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
              <a href="/host" className="underline text-sm text-[var(--muted-foreground)]">
                Back to Host
              </a>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Room link</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {joinUrl ? (
                <>
                  <div className="text-sm text-[var(--muted-foreground)]">Players join at</div>
                  <a className="break-all text-sm underline" href={joinUrl}>
                    {joinUrl}
                  </a>
                  <div className="flex justify-center py-4">
                    <QRCodeSVG value={joinUrl} size={240} />
                  </div>
                </>
              ) : (
                <div className="text-sm text-[var(--muted-foreground)]">Join link not available.</div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 grid gap-4">
            {showJoin ? (
              <Card>
                <CardHeader>
                  <CardTitle>Waiting to start</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 lg:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-sm text-[var(--muted-foreground)]">Players join at</div>
                    <a className="break-all text-sm underline" href={joinUrl}>
                      {joinUrl}
                    </a>
                    <div className="text-sm text-[var(--muted-foreground)]">The host starts the game from Host.</div>
                  </div>
                  <div className="flex items-center justify-center py-2">
                    {joinUrl ? <QRCodeSVG value={joinUrl} size={220} /> : null}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {q ? (
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>Question</CardTitle>
                    <div className="text-sm text-[var(--muted-foreground)]">
                      {q.roundType === "audio" ? "Audio" : q.roundType === "picture" ? "Picture" : "General"}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {isPictureQ && q.imageUrl ? (
                    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--muted)]">
                      <img src={q.imageUrl} alt="" className="w-full max-h-[360px] object-contain" />
                    </div>
                  ) : null}

                  <div className="text-xl font-semibold leading-tight">{q.text}</div>

                  {isAudioQ && audioMode === "phones" ? (
                    <div className="text-sm text-[var(--muted-foreground)]">
                      Audio plays on phones for this game.
                    </div>
                  ) : null}

                  {isAudioQ && shouldPlayOnDisplay && audioEnabled && q.audioUrl ? (
                    <div>
                      <Button onClick={() => playClip()} variant="secondary">
                        Play clip
                      </Button>
                    </div>
                  ) : null}

                  {isTextQ ? (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4 text-sm text-[var(--muted-foreground)]">
                      Players type their answer on their phone.
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {(q.options ?? []).map((opt: string, i: number) => {
                        const revealIndex = state?.reveal?.answerIndex;
                        const inReveal = Boolean(state?.reveal && revealIndex !== null && revealIndex !== undefined);

                        const isCorrect = inReveal && i === revealIndex;
                        const base = "rounded-xl border px-4 py-3 text-left";
                        const cls = isCorrect
                          ? "border-emerald-500/50 bg-emerald-600/15"
                          : "border-[var(--border)] bg-[var(--card)]";

                        return (
                          <div key={i} className={`${base} ${cls}`}>
                            <div className="text-sm">{opt}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {state?.reveal ? (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4">
                      <div className="text-sm font-medium">Answer</div>
                      <div className="mt-1 text-sm text-[var(--muted-foreground)]">
                        {state.reveal.answerType === "mcq" &&
                        state.reveal.answerIndex !== null &&
                        Array.isArray(q.options) &&
                        q.options[state.reveal.answerIndex]
                          ? q.options[state.reveal.answerIndex]
                          : null}
                        {state.reveal.answerType === "text" && state.reveal.answerText
                          ? state.reveal.answerText
                          : null}
                      </div>

                      {state.reveal.explanation ? (
                        <div className="mt-3 text-sm text-[var(--muted-foreground)]">
                          {state.reveal.explanation}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </div>

          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Scoreboard</CardTitle>
            </CardHeader>

            <CardContent>
              <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--card)]">
                    <tr className="border-b border-[var(--border)]">
                      <th className="w-12 px-3 py-2 text-left font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">Team</th>
                      <th className="w-20 px-3 py-2 text-right font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoreboard.map((p: any, idx: number) => (
                      <tr key={p.id} className="border-b border-[var(--border)] last:border-b-0">
                        <td className="px-3 py-2 text-[var(--muted-foreground)] tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.score ?? 0}</td>
                      </tr>
                    ))}
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
            </CardContent>

            <CardFooter className="text-xs text-[var(--muted-foreground)]">
              Scores update when answers lock in.
            </CardFooter>
          </Card>
        </div>
      )}
    </main>
  );
}