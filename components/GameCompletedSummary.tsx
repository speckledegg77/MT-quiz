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

type RoundPlan = {
  index: number
  number: number
  name: string
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

function sortRounds<T extends { index: number }>(items: T[]) {
  return [...items].sort((a, b) => a.index - b.index)
}

function getPlayerRounds(player: FinalPlayerResult, roundsPlan: RoundPlan[]) {
  const byIndex = new Map<number, FinalRoundResult>()
  for (const round of Array.isArray(player.rounds) ? player.rounds : []) {
    byIndex.set(Number(round.index), round)
  }

  return roundsPlan.map((round) => {
    const found = byIndex.get(Number(round.index))
    return {
      index: Number(round.index),
      number: Number(round.number),
      name: String(round.name ?? `Round ${Number(round.number)}`),
      score: Number(found?.score ?? 0),
      jokerUsed: Boolean(found?.jokerUsed),
    }
  })
}

function getJokerRoundLabel(player: FinalPlayerResult, roundsPlan: RoundPlan[]) {
  const jokerRound = getPlayerRounds(player, roundsPlan).find((round) => round.jokerUsed)
  if (!jokerRound) return "No Joker used"
  return `R${jokerRound.number}`
}

function ScorePill({ score }: { score: number }) {
  const positive = score > 0
  const negative = score < 0

  return (
    <span
      className={[
        "inline-flex min-w-14 items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums",
        positive ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "",
        negative ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300" : "",
        !positive && !negative ? "border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]" : "",
      ].join(" ")}
    >
      {formatSignedScore(score)}
    </span>
  )
}

function RoundChips({ player, roundsPlan }: { player: FinalPlayerResult; roundsPlan: RoundPlan[] }) {
  const rounds = getPlayerRounds(player, roundsPlan)

  return (
    <div className="flex flex-wrap gap-2">
      {rounds.map((round) => (
        <div
          key={round.index}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1 text-xs"
        >
          <span className="font-medium text-[var(--foreground)]">R{round.number}</span>
          <span className="tabular-nums text-[var(--muted-foreground)]">{formatSignedScore(round.score)}</span>
          {round.jokerUsed ? <span aria-label="Joker used">🃏</span> : null}
        </div>
      ))}
    </div>
  )
}

function MobilePlayerCard({
  player,
  roundsPlan,
  isHighlighted,
}: {
  player: FinalPlayerResult
  roundsPlan: RoundPlan[]
  isHighlighted: boolean
}) {
  const rounds = getPlayerRounds(player, roundsPlan)

  return (
    <div
      className={[
        "rounded-xl border bg-[var(--card)] p-3",
        isHighlighted ? "border-emerald-500/40" : "border-[var(--border)]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--foreground)]">{player.name}</div>
          <div className="mt-1 text-xs text-[var(--muted-foreground)]">Joker: {getJokerRoundLabel(player, roundsPlan)}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">Total</div>
          <div className="text-base font-semibold tabular-nums">{formatScore(player.totalScore)}</div>
        </div>
      </div>

      <div className="mt-3">
        <RoundChips player={player} roundsPlan={roundsPlan} />
      </div>

      <details className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]">
        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-[var(--foreground)]">
          Round breakdown
        </summary>
        <div className="space-y-2 border-t border-[var(--border)] px-3 py-3">
          {rounds.map((round) => (
            <div key={round.index} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--card)] px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-[var(--foreground)]">
                  R{round.number} {round.jokerUsed ? <span className="ml-1">🃏</span> : null}
                </div>
                <div className="truncate text-xs text-[var(--muted-foreground)]">{round.name}</div>
              </div>
              <ScorePill score={round.score} />
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

function DesktopSoloTable({
  players,
  roundsPlan,
  highlightPlayerId,
}: {
  players: FinalPlayerResult[]
  roundsPlan: RoundPlan[]
  highlightPlayerId?: string | null
}) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)] md:block">
      <table className="min-w-full text-sm">
        <thead className="bg-[var(--muted)]">
          <tr className="border-b border-[var(--border)]">
            <th className="px-3 py-2 text-left font-medium">Player</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
            {roundsPlan.map((round) => (
              <th key={round.index} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                {round.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const isHighlighted = player.id === highlightPlayerId
            const playerRounds = getPlayerRounds(player, roundsPlan)

            return (
              <tr key={player.id} className="border-b border-[var(--border)] last:border-b-0">
                <td className={`px-3 py-2 ${isHighlighted ? "font-semibold" : "font-medium"}`}>{player.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatScore(player.totalScore)}</td>
                {playerRounds.map((round) => (
                  <td key={round.index} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
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
  )
}

function DesktopTeamTables({
  teams,
  teamScoreMode,
  roundsPlan,
  highlightPlayerId,
  highlightTeamName,
}: {
  teams: FinalTeamResult[]
  teamScoreMode: "total" | "average"
  roundsPlan: RoundPlan[]
  highlightPlayerId?: string | null
  highlightTeamName?: string | null
}) {
  return (
    <div className="hidden grid-cols-1 gap-4 md:grid">
      {teams.map((team) => {
        const teamDisplayScore = teamScoreMode === "average" ? team.averageScore : team.totalScore
        const isHighlightedTeam = team.team === highlightTeamName
        const players = sortPlayersArray(team.players)

        return (
          <div key={team.team} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div>
                <div className={`font-semibold ${isHighlightedTeam ? "text-emerald-600 dark:text-emerald-300" : "text-[var(--foreground)]"}`}>
                  {team.team}
                </div>
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
                    {roundsPlan.map((round) => (
                      <th key={round.index} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                        {round.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => {
                    const isHighlightedPlayer = player.id === highlightPlayerId
                    const playerRounds = getPlayerRounds(player, roundsPlan)

                    return (
                      <tr key={player.id} className="border-b border-[var(--border)] last:border-b-0">
                        <td className={`px-3 py-2 ${isHighlightedPlayer ? "font-semibold" : "font-medium"}`}>{player.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatScore(player.totalScore)}</td>
                        {playerRounds.map((round) => (
                          <td key={round.index} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
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
  )
}

function sortPlayersArray(players: FinalPlayerResult[]) {
  return [...players].sort(sortPlayers)
}

export default function GameCompletedSummary({
  gameMode,
  teamScoreMode,
  finalResults,
  highlightPlayerId,
  highlightTeamName,
  title = "Game completed",
}: Props) {
  const roundsPlan = sortRounds(
    Array.isArray(finalResults?.rounds)
      ? finalResults.rounds.map((round) => ({
          index: Number(round.index),
          number: Number(round.number),
          name: String(round.name ?? `Round ${Number(round.number)}`),
        }))
      : [],
  )

  const players = Array.isArray(finalResults?.players) ? sortPlayersArray(finalResults.players) : []
  const teams = Array.isArray(finalResults?.teams) ? [...finalResults.teams] : []

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
            <>
              <div className="grid gap-4 md:hidden">
                {teams.map((team) => {
                  const teamDisplayScore = teamScoreMode === "average" ? team.averageScore : team.totalScore
                  const isHighlightedTeam = team.team === highlightTeamName
                  const players = sortPlayersArray(team.players)

                  return (
                    <div
                      key={team.team}
                      className={[
                        "rounded-xl border bg-[var(--card)] p-3",
                        isHighlightedTeam ? "border-emerald-500/40" : "border-[var(--border)]",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold text-[var(--foreground)]">{team.team}</div>
                          <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                            {team.playerCount} players
                            {teamScoreMode === "average" ? ` • ${formatScore(team.totalScore)} total` : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                            Team score{teamScoreMode === "average" ? " avg" : ""}
                          </div>
                          <div className="text-lg font-semibold tabular-nums">{formatScore(teamDisplayScore)}</div>
                        </div>
                      </div>

                      <div className="mt-3 space-y-3">
                        {players.map((player) => (
                          <MobilePlayerCard
                            key={player.id}
                            player={player}
                            roundsPlan={roundsPlan}
                            isHighlighted={player.id === highlightPlayerId}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              <DesktopTeamTables
                teams={teams}
                teamScoreMode={teamScoreMode}
                roundsPlan={roundsPlan}
                highlightPlayerId={highlightPlayerId}
                highlightTeamName={highlightTeamName}
              />
            </>
          ) : (
            <>
              <div className="grid gap-3 md:hidden">
                {players.map((player) => (
                  <MobilePlayerCard
                    key={player.id}
                    player={player}
                    roundsPlan={roundsPlan}
                    isHighlighted={player.id === highlightPlayerId}
                  />
                ))}
              </div>

              <DesktopSoloTable players={players} roundsPlan={roundsPlan} highlightPlayerId={highlightPlayerId} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
