"use client"

import { useEffect, useMemo, useState } from "react"
import JokerBadge from "@/components/JokerBadge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

type Props = {
  round: {
    index: number
    number: number
    name: string
  } | null | undefined
  roundStats: any
  isLastQuestionOverall?: boolean
  roundSummaryEndsAt?: string | null
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return "0"
  return String(n)
}

function secondsUntil(endsAt?: string | null) {
  if (!endsAt) return null
  const endMs = Date.parse(endsAt)
  if (!Number.isFinite(endMs)) return null
  return Math.max(0, Math.ceil((endMs - Date.now()) / 1000))
}

export default function RoundSummaryCard({
  round,
  roundStats,
  isLastQuestionOverall = false,
  roundSummaryEndsAt = null,
}: Props) {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(() => secondsUntil(roundSummaryEndsAt))

  useEffect(() => {
    setSecondsRemaining(secondsUntil(roundSummaryEndsAt))

    if (!roundSummaryEndsAt) return

    const id = window.setInterval(() => {
      setSecondsRemaining(secondsUntil(roundSummaryEndsAt))
    }, 250)

    return () => window.clearInterval(id)
  }, [roundSummaryEndsAt])

  const footerText = useMemo(() => {
    if (secondsRemaining !== null) {
      if (secondsRemaining <= 0) return "Continuing…"
      return isLastQuestionOverall
        ? `Finishing automatically in ${secondsRemaining}s.`
        : `Next round starts automatically in ${secondsRemaining}s.`
    }

    return isLastQuestionOverall
      ? "Waiting for the host to finish the game."
      : "Waiting for the host to start the next round."
  }, [isLastQuestionOverall, secondsRemaining])

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

        {Array.isArray(roundStats?.byTeam) && roundStats.byTeam.length ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="text-sm font-semibold">By team</div>
            <div className="mt-2 grid gap-2 text-sm text-[var(--muted-foreground)]">
              {roundStats.byTeam.map((team: any) => (
                <div key={team.team} className="rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-2">
                  <div className="font-medium text-[var(--foreground)]">{team.team}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <span>
                      Correct {fmt(Number(team.correct ?? 0))}/{fmt(Number(team.answered ?? 0))}
                    </span>
                    <span className="flex items-center gap-1">
                      Joker {fmt(Number(team.jokerUsed ?? 0))}
                      {Number(team.jokerUsed ?? 0) > 0 ? <JokerBadge /> : null}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="text-sm text-[var(--muted-foreground)]">{footerText}</div>
      </CardContent>
    </Card>
  )
}
