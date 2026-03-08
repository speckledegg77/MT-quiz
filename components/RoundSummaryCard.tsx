"use client";

import { useEffect, useMemo, useState } from "react";

import JokerBadge from "@/components/JokerBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

type TeamPlayerRow = {
  id?: string;
  name: string;
  totalScore: number;
  usedJokerInScope: boolean;
};

type TeamRow = {
  team: string;
  players: number;
  answered: number;
  correct: number;
  jokerUsed: number;
  jokerCorrect: number;
  totalScoreSoFar?: number;
  averageScoreSoFar?: number;
  displayScoreSoFar?: number;
  playersList?: TeamPlayerRow[];
};

type Props = {
  round: { index: number; number: number; name: string } | null | undefined;
  roundStats:
    | {
        answered?: number;
        correct?: number;
        jokerUsed?: number;
        jokerCorrect?: number;
        byTeam?: TeamRow[];
      }
    | null
    | undefined;
  gameMode?: "teams" | "solo";
  isLastQuestionOverall?: boolean;
  roundSummaryEndsAt?: string | number | Date | null | undefined;
};

function fmt(n: number) {
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

function parseEndsAt(value: Props["roundSummaryEndsAt"]) {
  if (!value) return null;

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

export default function RoundSummaryCard({
  round,
  roundStats,
  gameMode = "teams",
  isLastQuestionOverall = false,
  roundSummaryEndsAt,
}: Props) {
  const endsAtMs = useMemo(() => parseEndsAt(roundSummaryEndsAt), [roundSummaryEndsAt]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAtMs) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [endsAtMs]);

  const remainingSeconds = endsAtMs ? Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000)) : null;

  const soloPlayers = useMemo(() => {
    const rows = Array.isArray(roundStats?.byTeam) ? roundStats.byTeam : [];
    const flattened = rows.flatMap((team) =>
      Array.isArray(team.playersList)
        ? team.playersList.map((player) => ({
            ...player,
            team: team.team,
          }))
        : [],
    );

    return flattened.sort((a, b) => {
      const scoreDiff = Number(b.totalScore ?? 0) - Number(a.totalScore ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
  }, [roundStats?.byTeam]);

  const teamRows = Array.isArray(roundStats?.byTeam) ? roundStats.byTeam : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              End of round
            </div>
            <CardTitle className="mt-1">
              Round {Number(round?.number ?? 0)}
            </CardTitle>
            <div className="mt-1 text-sm text-[var(--muted-foreground)]">
              {String(round?.name ?? "Round summary")}
            </div>
          </div>

          {remainingSeconds !== null ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-right">
              <div className="text-xs text-[var(--muted-foreground)]">
                {isLastQuestionOverall ? "Finishing game in" : "Next round starts in"}
              </div>
              <div className="text-lg font-semibold tabular-nums">
                {formatDuration(remainingSeconds)}
              </div>
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="text-xs text-[var(--muted-foreground)]">Correct</div>
            <div className="mt-1 text-lg font-semibold">
              {fmt(Number(roundStats?.correct ?? 0))}/{fmt(Number(roundStats?.answered ?? 0))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="text-xs text-[var(--muted-foreground)]">Joker usage</div>
            <div className="mt-1 text-lg font-semibold">
              {fmt(Number(roundStats?.jokerUsed ?? 0))}
            </div>
            <div className="mt-1 text-xs text-[var(--muted-foreground)]">
              Joker correct: {fmt(Number(roundStats?.jokerCorrect ?? 0))}
            </div>
          </div>
        </div>

        {gameMode === "teams" ? (
          teamRows.length ? (
            <div className="space-y-3">
              <div className="text-sm font-medium text-[var(--foreground)]">By team</div>

              {teamRows.map((team) => (
                <div
                  key={team.team}
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[var(--foreground)]">{team.team}</div>
                      <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                        Correct {fmt(Number(team.correct ?? 0))}/{fmt(Number(team.answered ?? 0))}{" "}
                        | Joker {fmt(Number(team.jokerUsed ?? 0))}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-[var(--muted-foreground)]">Team score so far</div>
                      <div className="text-lg font-semibold tabular-nums">
                        {fmt(Number(team.displayScoreSoFar ?? team.totalScoreSoFar ?? 0))}
                      </div>
                    </div>
                  </div>

                  {Array.isArray(team.playersList) && team.playersList.length ? (
                    <div className="mt-3 space-y-2">
                      {team.playersList.map((player) => (
                        <div
                          key={player.id ?? player.name}
                          className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="truncate text-sm text-[var(--foreground)]">{player.name}</div>
                            {player.usedJokerInScope ? <JokerBadge /> : null}
                          </div>

                          <div className="shrink-0 text-sm font-semibold tabular-nums">
                            {fmt(Number(player.totalScore ?? 0))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null
        ) : soloPlayers.length ? (
          <div className="space-y-3">
            <div className="text-sm font-medium text-[var(--foreground)]">Players</div>

            <div className="space-y-2">
              {soloPlayers.map((player) => (
                <div
                  key={player.id ?? player.name}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="truncate text-sm text-[var(--foreground)]">{player.name}</div>
                    {player.usedJokerInScope ? <JokerBadge /> : null}
                  </div>

                  <div className="shrink-0 text-sm font-semibold tabular-nums">
                    {fmt(Number(player.totalScore ?? 0))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {remainingSeconds === null ? (
          <div className="text-sm text-[var(--muted-foreground)]">
            {isLastQuestionOverall
              ? "Waiting for the host to finish the game."
              : "Waiting for the next round to start."}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}