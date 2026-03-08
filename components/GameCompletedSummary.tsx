import JokerBadge from "@/components/JokerBadge"
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

function formatScore(value: number) {
  if (!Number.isFinite(value)) return "0"
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function formatSignedScore(value: number) {
  if (!Number.isFinite(value) || value === 0) return "0"
  return value > 0 ? `+${value}` : String(value)
}

function sortPlayers(a: FinalPlayerResult, b: FinalPlayerResult) {
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
  return a.name.localeCompare(b.name)
}

function getJokerLabel(rounds: FinalRoundResult[]) {
  const jokerRound = rounds.find((round) => round.jokerUsed)
  return jokerRound ? `R${jokerRound.number}` : "None"
}

function PlayerCard({
  player,
  rounds,
  isHighlighted,
}: {
  player: FinalPlayerResult
  rounds: Array<{ index: number; number: number; name: string }>
  isHighlighted: boolean
}) {
  return (
    <div
      className={[
        "rounded-3xl border bg-slate-950/30 p-4 sm:p-5",
        isHighlighted ? "border-emerald-400/70 ring-1 ring-emerald-400/40" : "border-white/10",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xl font-semibold text-white">{player.name}</div>
          <div className="mt-1 text-sm text-slate-300">Joker: {getJokerLabel(player.rounds)}</div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-xs uppercase tracking-wide text-slate-400">Total</div>
          <div className="text-3xl font-bold text-white">{formatScore(player.totalScore)}</div>
        </div>
      </div>

      <details className="mt-4 rounded-2xl border border-white/10 bg-slate-950/25 px-4 py-3">
        <summary className="cursor-pointer list-none text-base font-medium text-white">
          <div className="flex items-center justify-between gap-3">
            <span>Round breakdown</span>
            <span className="text-xs uppercase tracking-wide text-slate-400">Tap to open</span>
          </div>
        </summary>

        <div className="mt-4 space-y-2">
          {rounds.map((round) => {
            const playerRound = player.rounds.find((item) => item.index === round.index)
            const score = playerRound?.score ?? 0
            const jokerUsed = Boolean(playerRound?.jokerUsed)

            return (
              <div
                key={`${player.id}-${round.index}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-white">{round.name}</div>
                  <div className="text-xs text-slate-400">Round {round.number}</div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {jokerUsed ? (
                    <span className="inline-flex items-center rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-xs font-medium text-amber-200">
                      <JokerBadge />
                      <span className="ml-1">Joker</span>
                    </span>
                  ) : null}
                  <span className="text-base font-semibold text-white">{formatSignedScore(score)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </details>
    </div>
  )
}

export default function GameCompletedSummary({
  gameMode,
  teamScoreMode,
  finalResults,
  highlightPlayerId,
  highlightTeamName,
  title = "Game completed",
}: Props) {
  const rounds = Array.isArray(finalResults?.rounds) ? finalResults.rounds : []
  const players = Array.isArray(finalResults?.players) ? [...finalResults.players].sort(sortPlayers) : []
  const teams = Array.isArray(finalResults?.teams) ? [...finalResults.teams] : []

  teams.sort((a, b) => {
    const aScore = teamScoreMode === "average" ? a.averageScore : a.totalScore
    const bScore = teamScoreMode === "average" ? b.averageScore : b.totalScore
    if (bScore !== aScore) return bScore - aScore
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
    return a.team.localeCompare(b.team)
  })

  const winningTeams = gameMode === "teams" && teams.length > 0
    ? teams.filter((team) => {
        const top = teams[0]
        const topScore = teamScoreMode === "average" ? top.averageScore : top.totalScore
        const teamScore = teamScoreMode === "average" ? team.averageScore : team.totalScore
        return teamScore === topScore
      })
    : []

  const winningPlayers = gameMode === "solo" && players.length > 0
    ? players.filter((player) => player.totalScore === players[0].totalScore)
    : []

  const winnerLabel = gameMode === "teams"
    ? winningTeams.length > 1
      ? "Joint winners"
      : "Winning team"
    : winningPlayers.length > 1
      ? "Joint winners"
      : "Winner"

  const winnerNames = gameMode === "teams"
    ? winningTeams.map((team) => team.team).join(", ")
    : winningPlayers.map((player) => player.name).join(", ")

  const winnerScore = gameMode === "teams"
    ? winningTeams.length > 0
      ? teamScoreMode === "average"
        ? winningTeams[0].averageScore
        : winningTeams[0].totalScore
      : 0
    : winningPlayers.length > 0
      ? winningPlayers[0].totalScore
      : 0

  return (
    <Card className="rounded-[2rem] border-white/10 bg-slate-900/70 shadow-2xl backdrop-blur">
      <CardHeader className="border-b border-white/10 pb-6">
        <CardTitle className="text-3xl font-bold text-white">{title}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:space-y-6 sm:p-6">
        <div className="rounded-3xl border border-white/10 bg-slate-950/25 p-5">
          <div className="text-sm text-slate-400">{winnerLabel}</div>
          <div className="mt-1 text-2xl font-semibold text-white">{winnerNames || "No winner available"}</div>
          {winnerNames ? (
            <div className="mt-2 text-sm text-slate-300">
              Final score: {formatScore(winnerScore)}
              {gameMode === "teams" && teamScoreMode === "average" ? " average points per player" : ""}
            </div>
          ) : null}
        </div>

        {gameMode === "teams" ? (
          <div className="space-y-4 sm:space-y-5">
            {teams.map((team) => {
              const teamDisplayScore = teamScoreMode === "average" ? team.averageScore : team.totalScore
              const isHighlightedTeam = team.team === highlightTeamName

              return (
                <section
                  key={team.team}
                  className={[
                    "rounded-3xl border p-4 sm:p-5",
                    isHighlightedTeam
                      ? "border-emerald-400/70 bg-emerald-400/5 ring-1 ring-emerald-400/40"
                      : "border-cyan-400/40 bg-slate-950/20",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-2xl font-semibold text-white">{team.team}</div>
                      <div className="mt-1 text-sm text-slate-300">
                        {team.playerCount} {team.playerCount === 1 ? "player" : "players"}
                        {teamScoreMode === "average" ? ` | ${formatScore(team.totalScore)} total` : ""}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        Team score{teamScoreMode === "average" ? " (average)" : ""}
                      </div>
                      <div className="text-4xl font-bold text-white">{formatScore(teamDisplayScore)}</div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {[...team.players].sort(sortPlayers).map((player) => (
                      <PlayerCard
                        key={player.id}
                        player={player}
                        rounds={rounds}
                        isHighlighted={player.id === highlightPlayerId}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {players.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                rounds={rounds}
                isHighlighted={player.id === highlightPlayerId}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
