"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import JoinFeedPanel from "@/components/JoinFeedPanel";
import QRTile from "@/components/ui/QRTile";
import JokerBadge from "@/components/JokerBadge";
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

function fmt(n: number) {
  if (!Number.isFinite(n)) return "0";
  return String(n);
}

export default function DisplayPage() {
  const params = useParams<{ code?: string }>();
  const code = String(params?.code ?? "").toUpperCase();

  const [state, setState] = useState<RoomState | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [playedForQ, setPlayedForQ] = useState<string | null>(null);
  const [roundTransitionQuestionIndex, setRoundTransitionQuestionIndex] = useState<number | null>(null);

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
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;

      setState(data);

      if (data?.stage === "needs_advance") {
        await fetch("/api/room/advance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
      }
    }

    tick();
    const id = window.setInterval(tick, 500);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [code]);

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

  if (!code) return null;
  if (!state) return null;

  const stage = String(state.stage ?? "");
  const status = statusText(stage);
  const q = state.question;
  const isAudioQ = q?.roundType === "audio";
  const isPictureQ = q?.roundType === "picture";
  const isTextQ = q?.answerType === "text";
  const showJoin = state.phase === "lobby";
  const finished = state.phase === "finished";
  const currentRound = state?.rounds?.current ?? null;
  const questionNumber = Number(state.questionIndex ?? 0) + 1;
  const questionCount = Number(state.questionCount ?? 0);
  const questionStats = state?.questionStats ?? null;
  const roundStats = state?.roundStats ?? null;

  const suppressStaleQuestionBetweenRounds =
    !showJoin &&
    !finished &&
    stage !== "round_summary" &&
    roundTransitionQuestionIndex !== null &&
    Number(state?.questionIndex ?? -1) === roundTransitionQuestionIndex;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <audio ref={audioRef} />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs text-[var(--muted-foreground)]">Room</div>
          <div className="text-2xl font-semibold tracking-wide">{code}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {status ? (
            <span className={`rounded-full border px-3 py-1 text-sm ${pillClass(stage)}`}>{status}</span>
          ) : null}

          {state.phase === "running" && currentRound ? (
            <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-sm text-[var(--muted-foreground)]">
              R{Number(currentRound.number ?? 0)}: {String(currentRound.name ?? "")}
            </span>
          ) : null}

          {state.phase === "running" ? (
            <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-sm text-[var(--muted-foreground)]">
              Q{questionNumber} of {questionCount}
            </span>
          ) : null}
        </div>
      </div>

      {showJoin ? (
        <div className="grid gap-4 lg:grid-cols-[1fr,360px]">
          <Card>
            <CardHeader>
              <CardTitle>Players join here</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-3">
                <div className="text-sm text-[var(--muted-foreground)]">Join URL</div>
                <a className="mt-1 block break-all text-sm text-[var(--foreground)] underline underline-offset-2" href={joinUrl}>
                  {joinUrl}
                </a>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-3">
                <div className="text-sm">QR code</div>
                <QRTile value={joinUrl} size={112} />
              </div>
            </CardContent>
          </Card>

          <JoinFeedPanel players={Array.isArray(state?.players) ? state.players : []} />
        </div>
      ) : null}

      {!showJoin && !finished && stage === "round_summary" ? (
        <RoundSummaryCard
          round={currentRound}
          roundStats={roundStats}
          isLastQuestionOverall={Boolean(state?.flow?.isLastQuestionOverall)}
          roundSummaryEndsAt={state?.times?.roundSummaryEndsAt ?? null}
        />
      ) : null}

      {!showJoin && !finished && suppressStaleQuestionBetweenRounds ? (
        <Card>
          <CardContent className="py-16 text-center text-lg text-[var(--muted-foreground)]">
            Starting next round...
          </CardContent>
        </Card>
      ) : null}

      {!showJoin && !finished && stage !== "round_summary" && !suppressStaleQuestionBetweenRounds ? (
        <div className="grid gap-4 lg:grid-cols-[1fr,360px]">
          <div className="space-y-4">
            {q ? (
              <Card>
                <CardHeader>
                  <CardTitle>Question</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isPictureQ && q.imageUrl ? (
                    <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                      <img src={q.imageUrl} alt="" className="block w-full" />
                    </div>
                  ) : null}

                  <div className="text-xl font-semibold">{q.text}</div>

                  {isAudioQ && audioMode === "phones" ? (
                    <div className="text-sm text-[var(--muted-foreground)]">Audio plays on phones for this game.</div>
                  ) : null}

                  {isAudioQ && shouldPlayOnDisplay && !audioEnabled ? (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm text-[var(--muted-foreground)]">Audio for this display</div>
                        <Button variant="secondary" onClick={unlockAudio}>
                          Enable audio
                        </Button>
                      </div>
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
                      {q.options.map((opt: string, index: number) => (
                        <div key={index} className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                          <div className="text-sm font-medium text-[var(--muted-foreground)]">Option {index + 1}</div>
                          <div className="text-sm">{opt}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {isTextQ ? (
                    <div className="text-sm text-[var(--muted-foreground)]">Players type their answer on their phones.</div>
                  ) : null}

                  {stage === "reveal" && questionStats ? (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3">
                      <div className="text-sm font-semibold">This question</div>
                      <div className="mt-2 grid gap-1 text-sm text-[var(--muted-foreground)]">
                        <div>
                          Correct: {fmt(Number(questionStats.correct))}/{fmt(Number(questionStats.answered))}
                        </div>
                        <div className="flex items-center gap-2">
                          <span>Joker used: {fmt(Number(questionStats.jokerUsed))}</span>
                          {Number(questionStats.jokerUsed ?? 0) > 0 ? <JokerBadge /> : null}
                          <span className="ml-2">Joker correct: {fmt(Number(questionStats.jokerCorrect))}</span>
                        </div>
                      </div>

                      {Array.isArray(questionStats.byTeam) && questionStats.byTeam.length ? (
                        <div className="mt-3">
                          <div className="text-sm font-semibold">By team</div>
                          <div className="mt-2 grid gap-1 text-sm text-[var(--muted-foreground)]">
                            {questionStats.byTeam.map((team: any) => (
                              <div key={team.team} className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-[var(--foreground)]">{team.team}</span>
                                <span>
                                  Correct {team.correct}/{team.answered}
                                </span>
                                <span className="flex items-center gap-1">
                                  Joker {team.jokerUsed}
                                  {Number(team.jokerUsed ?? 0) > 0 ? <JokerBadge /> : null}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {stage === "reveal" && roundStats && currentRound ? (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                      <div className="text-sm font-semibold">Round so far: {String(currentRound.name ?? "")}</div>
                      <div className="mt-2 grid gap-1 text-sm text-[var(--muted-foreground)]">
                        <div>
                          Correct: {fmt(Number(roundStats.correct))}/{fmt(Number(roundStats.answered))}
                        </div>
                        <div className="flex items-center gap-2">
                          <span>Joker used: {fmt(Number(roundStats.jokerUsed))}</span>
                          {Number(roundStats.jokerUsed ?? 0) > 0 ? <JokerBadge /> : null}
                          <span className="ml-2">Joker correct: {fmt(Number(roundStats.jokerCorrect))}</span>
                        </div>
                      </div>

                      {Array.isArray(roundStats.byTeam) && roundStats.byTeam.length ? (
                        <div className="mt-3">
                          <div className="text-sm font-semibold">By team</div>
                          <div className="mt-2 grid gap-1 text-sm text-[var(--muted-foreground)]">
                            {roundStats.byTeam.map((team: any) => (
                              <div key={team.team} className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-[var(--foreground)]">{team.team}</span>
                                <span>
                                  Correct {team.correct}/{team.answered}
                                </span>
                                <span className="flex items-center gap-1">
                                  Joker {team.jokerUsed}
                                  {Number(team.jokerUsed ?? 0) > 0 ? <JokerBadge /> : null}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </div>

          <JoinFeedPanel players={Array.isArray(state?.players) ? state.players : []} />
        </div>
      ) : null}

      {finished ? (
        <GameCompletedSummary
          gameMode={String(state?.gameMode ?? "teams") === "solo" ? "solo" : "teams"}
          teamScoreMode={String(state?.teamScoreMode ?? "total") === "average" ? "average" : "total"}
          finalResults={state?.finalResults}
          title="Game completed"
        />
      ) : null}
    </main>
  );
}
