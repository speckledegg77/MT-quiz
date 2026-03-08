"use client"

import { useEffect, useMemo, useState } from "react"

import JokerBadge from "@/components/JokerBadge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

type TeamPlayerRow = {
  id?: string
  name: string
  totalScore: number
  usedJokerInScope: boolean
}

type TeamRow = {
  team: string
  players: number
  answered: number
  correct: number
  jokerUsed: number
  jokerCorrect: number
  totalScoreSoFar?: number
  averageScoreSoFar?: number
  displayScoreSoFar?: number
  playersList?: TeamPlayerRow[]
}

type GameMode = "teams" | "solo"

type Props = {
  round: {
    index: number
    number: number
    name: string
  } | null | undefined
  roundStats: {
    answered?: number
    correct?: number
    jokerUsed?: number
    jokerCorrect?: number
    byTeam?: TeamRow[]
  } | null | undefined
  isLastQuestionOverall?: boolean
  roundSummaryEndsAt?: string | number | Date | null | undefined
  gameMode?: GameMode
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return "0"
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function parseEndsAt(value: Props["roundSummaryEndsAt"]) {
  if (!value) return null
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms : null
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  const ms = Date.parse(String(value))
  return Number.isFinite(ms) ? ms : null
}

export default function RoundSummaryCard({
  round,
  roundStats,
  isLastQuestionOverall = false,
  roundSummaryEndsAt,
  gameMode = "teams",
}: Props) {
  const endsAtMs = useMemo(() => parseEndsAt(roundSummaryEndsAt), [roundSummaryEndsAt])
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!endsAtMs) return
    const id = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [endsAtMs])

  const remainingSeconds = endsAtMs ? Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000)) : null

  const soloPlayers = useMemo(() => {
    const rows = Array.isArray(roundStats?.byTeam) ? roundStats.byTeam : []
    return rows
      .flatMap((team) => (Array.isArray(team.playersList) ? team.playersList : []))
      .sort((a, b) => {
        const scoreDiff = Number(b.totalScore ?? 0) - Number(a.totalScore ?? 0)
        if (scoreDiff !== 0) return scoreDiff
        return String(a.name ?? "").localeCompare(String(b.name ?? ""))
      })
  }, [roundStats])

  return (
    <Card>
      <CardHeader>
        <CardTitle>End of round</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
          <div className="text-sm text-[var(--muted-foreground)]">Round {Number(round?.number ?? 0)}</div>
          <div className="text-lg font-semibold">{String(round?.name ?? "Round summary")}</div>
        </div>

        <div className="grid gap-2 text-sm text-[var(--muted-foreground)]">
          <div>
            Correct: {fmt(Number(roundStats?.correct ?? 0))}/{fmt(Number(roundStats?.answered ?? 0))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span>Joker used: {fmt(Number(roundStats?.jokerUsed ?? 0))}</span>
            {Number(roundStats?.jokerUsed ?? 0) > 0 ? <JokerBadge /> : null}
            <span className="ml-2">Joker correct: {fmt(Number(roundStats?.jokerCorrect ?? 0))}</span>
          </div>
        </div>

        {gameMode === "teams" && Array.isArray(roundStats?.byTeam) && roundStats.byTeam.length ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="text-sm font-semibold">By team</div>
            <div className="mt-2 grid gap-3">
              {roundStats.byTeam.map((team) => (
                <div key={team.team} className="rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-[var(--foreground)]">{team.team}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--muted-foreground)]">
                        <span>
                          Correct {fmt(Number(team.correct ?? 0))}/{fmt(Number(team.answered ?? 0))}
                        </span>
                        <span className="flex items-center gap-1">
                          Joker {fmt(Number(team.jokerUsed ?? 0))}
                          {Number(team.jokerUsed ?? 0) > 0 ? <JokerBadge /> : null}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">Team score so far</div>
                      <div className="text-lg font-semibold tabular-nums text-[var(--foreground)]">
                        {fmt(Number(team.displayScoreSoFar ?? team.totalScoreSoFar ?? 0))}
                      </div>
                    </div>
                  </div>

                  {Array.isArray(team.playersList) && team.playersList.length ? (
                    <div className="mt-3 space-y-2">
                      {team.playersList.map((player) => (
                        <div
                          key={player.id ?? player.name}
                          className="flex items-center justify-between gap-3 rounded-lg bg-[var(--card)] px-3 py-2"
                        >
                          <div className="min-w-0 truncate text-sm font-medium text-[var(--foreground)]">
                            {player.name}
                            {player.usedJokerInScope ? <JokerBadge className="ml-2 align-middle" /> : null}
                          </div>
                          <div className="shrink-0 text-sm font-semibold tabular-nums text-[var(--foreground)]">
                            {fmt(Number(player.totalScore ?? 0))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {gameMode === "solo" && soloPlayers.length ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="text-sm font-semibold">Players</div>
            <div className="mt-2 space-y-2">
              {soloPlayers.map((player) => (
                <div
                  key={player.id ?? player.name}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-3"
                >
                  <div className="min-w-0 truncate text-sm font-medium text-[var(--foreground)]">
                    {player.name}
                    {player.usedJokerInScope ? <JokerBadge className="ml-2 align-middle" /> : null}
                  </div>
                  <div className="shrink-0 text-sm font-semibold tabular-nums text-[var(--foreground)]">
                    {fmt(Number(player.totalScore ?? 0))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {remainingSeconds !== null ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm">
            <div className="text-[var(--muted-foreground)]">
              {isLastQuestionOverall ? "Finishing game in" : "Next round starts in"}
            </div>
            <div className="text-xl font-semibold tabular-nums text-[var(--foreground)]">{formatDuration(remainingSeconds)}</div>
          </div>
        ) : (
          <div className="text-sm text-[var(--muted-foreground)]">
            {isLastQuestionOverall ? "Waiting for the host to finish the game." : "Waiting for the next round to start."}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
