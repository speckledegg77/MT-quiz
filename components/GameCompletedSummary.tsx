import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

type FinalRoundResult = {
  index: number
  number: number
  name: string
  score: number
  jokerUsed: boolean
}

type FinalPlayerResult = {
  id: string
  name: string
  team: string
  totalScore: number
  rounds: FinalRoundResult[]
}

type FinalTeamResult = {
  team: string
  totalScore: number
  averageScore: number
  playerCount: number
  players: FinalPlayerResult[]
}

type FinalResults = {
  rounds: Array<{ index: number; number: number; name: string }>
  players: FinalPlayerResult[]
  teams: FinalTeamResult[]
}

type Props = {
  gameMode: "teams" | "solo"
  teamScoreMode: "total" | "average"
  finalResults: FinalResults | null | undefined
  highlightPlayerId?: string | null
  highlightTeamName?: string | null
  title?: string
}

function formatScore(n: number) {
  if (!Number.isFinite(n)) return "0"
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function formatSignedScore(n: number) {
  if (!Number.isFinite(n) || n === 0) return "0"
  return n > 0 ? `+${n}` : String(n)
}

function sortPlayers(a: FinalPlayerResult, b: FinalPlayerResult) {
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
  return a.name.localeCompare(b.name)
}

export default function GameCompletedSummary({
  gameMode,
  teamScoreMode,
  finalResults,
  highlightPlayerId,
  highlightTeamName,
  title = "Game completed",
}: Props) {
  const rounds = Array.isArray(finalResults?.rounds) ? finalResults?.rounds : []
  const players = Array.isArray(finalResults?.players) ? [...(finalResults?.players ?? [])].sort(sortPlayers) : []
  const teams = Array.isArray(finalResults?.teams) ? [...(finalResults?.teams ?? [])] : []

  teams.sort((a, b) => {
    const aScore = teamScoreMode === "average" ? a.averageScore : a.totalScore
    const bScore = teamScoreMode === "average" ? b.averageScore : b.totalScore
    if (bScore !== aScore) return bScore - aScore
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
    return a.team.localeCompare(b.team)
  })

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
            <div className="text-sm text-[var(--muted-foreground)]">Final scores</div>
            <div className="text-base font-semibold">Thanks for playing</div>
          </div>

          {gameMode === "teams" ? (
            <div className="grid gap-4">
              {teams.map((team) => {
                const teamDisplayScore = teamScoreMode === "average" ? team.averageScore : team.totalScore
                const isHighlightedTeam = team.team === highlightTeamName

                return (
                  <div key={team.team} className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                      <div>
                        <div className={`font-semibold ${isHighlightedTeam ? "text-[var(--foreground)]" : ""}`}>{team.team}</div>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {team.playerCount} players
                          {teamScoreMode === "average" ? ` • ${formatScore(team.totalScore)} total` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-[var(--muted-foreground)]">
                          Team score{teamScoreMode === "average" ? " (average)" : ""}
                        </div>
                        <div className="text-lg font-semibold tabular-nums">{formatScore(teamDisplayScore)}</div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-[var(--muted)]">
                          <tr className="border-b border-[var(--border)]">
                            <th className="px-3 py-2 text-left font-medium">Player</th>
                            <th className="px-3 py-2 text-right font-medium">Total</th>
                            {rounds.map((round) => (
                              <th key={round.index} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                                {round.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...team.players].sort(sortPlayers).map((player) => {
                            const isHighlightedPlayer = player.id === highlightPlayerId
                            return (
                              <tr key={player.id} className="border-b border-[var(--border)] last:border-b-0">
                                <td className={`px-3 py-2 ${isHighlightedPlayer ? "font-semibold" : "font-medium"}`}>
                                  {player.name}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatScore(player.totalScore)}</td>
                                {player.rounds.map((round) => (
                                  <td key={round.index} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                                    {formatSignedScore(round.score)}
                                    {round.jokerUsed ? <span className="ml-1">🃏</span> : null}
                                  </td>
                                ))}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--muted)]">
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-3 py-2 text-left font-medium">Player</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    {rounds.map((round) => (
                      <th key={round.index} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        {round.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => {
                    const isHighlightedPlayer = player.id === highlightPlayerId
                    return (
                      <tr key={player.id} className="border-b border-[var(--border)] last:border-b-0">
                        <td className={`px-3 py-2 ${isHighlightedPlayer ? "font-semibold" : "font-medium"}`}>
                          {player.name}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatScore(player.totalScore)}</td>
                        {player.rounds.map((round) => (
                          <td key={round.index} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                            {formatSignedScore(round.score)}
                            {round.jokerUsed ? <span className="ml-1">🃏</span> : null}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
