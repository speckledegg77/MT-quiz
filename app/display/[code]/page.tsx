"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import JoinFeedPanel from "@/components/JoinFeedPanel";

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

  const gameMode = String(state?.gameMode ?? "teams") === "solo" ? "solo" : "teams";
  const teamScoreMode = String(state?.teamScoreMode ?? "total") === "average" ? "average" : "total";

  const currentRound = state?.rounds?.current ?? null;

  function formatScore(n: number) {
    if (!Number.isFinite(n)) return "0";
    const rounded = Math.round(n * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  const scoreboard = useMemo(() => {
    const players: any[] = Array.isArray(state?.players) ? state.players : [];

    if (gameMode === "solo") {
      return [...players]
        .map((p) => ({ id: p.id, label: String(p.name ?? ""), score: Number(p.score ?? 0), size: 1 }))
        .sort((a, b) => (b.score - a.score) || a.label.localeCompare(b.label));
    }

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
  }, [state, gameMode, teamScoreMode]);

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
            <>
              {currentRound ? (
                <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-sm text-[var(--muted-foreground)]">
                  R{Number(currentRound.number ?? 0)}: {String(currentRound.name ?? "")}
                </span>
              ) : null}

              <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-sm text-[var(--muted-foreground)]">
                Q{questionNumber} of {questionCount}
              </span>
            </>
          ) : null}

          {shouldPlayOnDisplay && !audioEnabled ? (
            <Button onClick={unlockAudio} variant="secondary">
              Enable audio
            </Button>
          ) : null}
        </div>
      </div>

      {finished ? (
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
                  {scoreboard.map((r: any, idx: number) => (
                    <tr key={r.id} className="border-b border-[var(--border)] last:border-b-0">
                      <td className="px-3 py-2 text-[var(--muted-foreground)] tabular-nums">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium">
                        {r.label}
                        {gameMode === "teams" ? (
                          <span className="ml-2 text-xs text-[var(--muted-foreground)]">{r.size} players</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatScore(Number(r.score ?? 0))}</td>
                    </tr>
                  ))}
                  {scoreboard.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-sm text-[var(--muted-foreground)]" colSpan={3}>
                        No players found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="text-sm text-[var(--muted-foreground)]">
              Start a new room from the Host page.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr,360px]">
          <div className="space-y-4">
            {showJoin ? (
              <Card>
                <CardHeader>
                  <CardTitle>Waiting to start</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-[var(--muted-foreground)]">
                  <div>Players join at</div>
                  {joinUrl ? (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                      <a href={joinUrl} className="break-all underline">
                        {joinUrl}
                      </a>
                    </div>
                  ) : (
                    <div>Join link not available.</div>
                  )}
                  <div>The host starts the game from Host.</div>
                  {joinUrl ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2">
                      <div className="text-sm">QR code</div>
                      <QRCodeSVG value={joinUrl} size={96} />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {q ? (
              <Card>
                <CardHeader>
                  <CardTitle>Question</CardTitle>
                  <div className="text-sm text-[var(--muted-foreground)]">
                    {q.roundType === "audio" ? "Audio" : q.roundType === "picture" ? "Picture" : "General"}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {isPictureQ && q.imageUrl ? (
                    <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                      <img src={q.imageUrl} alt="" className="block w-full" />
                    </div>
                  ) : null}

                  <div className="text-xl font-semibold">{q.text}</div>

                  {isAudioQ && audioMode === "phones" ? (
                    <div className="text-sm text-[var(--muted-foreground)]">
                      Audio plays on phones for this game.
                    </div>
                  ) : null}

                  {isAudioQ && shouldPlayOnDisplay && audioEnabled && q.audioUrl ? (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2">
                      <div className="text-sm text-[var(--muted-foreground)]">Audio clip</div>
                      <div className="mt-2">
                        <Button variant="secondary" onClick={() => playClip().catch(() => {})}>
                          Play again
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {q.answerType === "mcq" && Array.isArray(q.options) && q.options.length ? (
                    <div className="grid gap-2">
                      {q.options.map((opt: string, i: number) => (
                        <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                          <div className="text-sm font-medium text-[var(--muted-foreground)]">Option {i + 1}</div>
                          <div className="text-sm">{opt}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {isTextQ ? (
                    <div className="text-sm text-[var(--muted-foreground)]">
                      Players type their answer on their phones.
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Scoreboard</CardTitle>
                {gameMode === "teams" && teamScoreMode === "average" ? (
                  <div className="text-sm text-[var(--muted-foreground)]">Showing average points per player.</div>
                ) : null}
              </CardHeader>

              <CardContent className="space-y-3">
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
                      {scoreboard.map((r: any, idx: number) => (
                        <tr key={r.id} className="border-b border-[var(--border)] last:border-b-0">
                          <td className="px-3 py-2 text-[var(--muted-foreground)] tabular-nums">{idx + 1}</td>
                          <td className="px-3 py-2 font-medium">
                            {r.label}
                            {gameMode === "teams" ? (
                              <span className="ml-2 text-xs text-[var(--muted-foreground)]">{r.size} players</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatScore(Number(r.score ?? 0))}</td>
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

                <div className="text-sm text-[var(--muted-foreground)]">Scores update as questions complete.</div>

                <div className="text-sm text-[var(--muted-foreground)]">
                  Room link{" "}
                  {joinUrl ? (
                    <>
                      <div className="mt-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                        <a href={joinUrl} className="break-all underline">
                          {joinUrl}
                        </a>
                      </div>
                    </>
                  ) : (
                    "Join link not available."
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <JoinFeedPanel players={Array.isArray(state?.players) ? state.players : []} />
          </div>
        </div>
      )}
    </main>
  );
}