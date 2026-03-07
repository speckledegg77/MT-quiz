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
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return "0"
  return String(n)
}

export default function RoundSummaryCard({ round, roundStats, isLastQuestionOverall = false }: Props) {
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

        <div className="text-sm text-[var(--muted-foreground)]">
          {isLastQuestionOverall ? "Waiting for the host to finish the game." : "Waiting for the host to start the next round."}
        </div>
      </CardContent>
    </Card>
  )
}
