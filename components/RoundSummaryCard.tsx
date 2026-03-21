"use client"

import { useEffect, useMemo, useState } from "react"

import JokerBadge from "@/components/JokerBadge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { getRoundBehaviourBadgeClass, getRoundBehaviourLabel, getStageStatusText } from "@/lib/gameMode"

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

type QuickfireReviewQuestion = {
  questionId: string
  questionIndex: number
  questionNumberInRound: number
  questionText: string
  correctAnswer: string
  correctPlayerIds: string[]
  correctPlayerNames: string[]
  fastestCorrectPlayerId: string | null
  fastestCorrectPlayerName: string | null
}

type Props = {
  round:
    | {
        index: number
        number: number
        name: string
        behaviourType?: "standard" | "quickfire"
      }
    | null
    | undefined
  roundStats:
    | {
        answered?: number
        correct?: number
        jokerUsed?: number
        jokerCorrect?: number
        byTeam?: TeamRow[]
      }
    | null
    | undefined
  roundReview?:
    | {
        behaviourType?: "standard" | "quickfire"
        questions?: QuickfireReviewQuestion[]
      }
    | null
    | undefined
  gameMode?: "teams" | "solo"
  isLastQuestionOverall?: boolean
  roundSummaryEndsAt?: string | number | Date | null | undefined
  isInfiniteMode?: boolean
  summaryQuestionCount?: number | null
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

function formatCorrectNames(question: QuickfireReviewQuestion) {
  if (!Array.isArray(question.correctPlayerNames) || question.correctPlayerNames.length === 0) {
    return "no-one"
  }

  return question.correctPlayerNames
    .map((name, index) => {
      const playerId = String(question.correctPlayerIds[index] ?? "")
      return playerId && playerId === question.fastestCorrectPlayerId ? `${name}⚡` : name
    })
    .join(", ")
}

export default function RoundSummaryCard({
  round,
  roundStats,
  roundReview,
  gameMode = "teams",
  isLastQuestionOverall = false,
  roundSummaryEndsAt,
  isInfiniteMode = false,
  summaryQuestionCount = null,
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
    const flattened = rows.flatMap((team) =>
      Array.isArray(team.playersList)
        ? team.playersList.map((player) => ({
            ...player,
            team: team.team,
          }))
        : []
    )

    return flattened.sort((a, b) => {
      const scoreDiff = Number(b.totalScore ?? 0) - Number(a.totalScore ?? 0)
      if (scoreDiff !== 0) return scoreDiff
      return String(a.name ?? "").localeCompare(String(b.name ?? ""))
    })
  }, [roundStats?.byTeam])

  const teamRows = Array.isArray(roundStats?.byTeam) ? roundStats.byTeam : []
  const isQuickfire = round?.behaviourType === "quickfire" || roundReview?.behaviourType === "quickfire"
  const quickfireQuestions = Array.isArray(roundReview?.questions) ? roundReview.questions : []
  const fastestAwardCount = quickfireQuestions.filter((question) => question.fastestCorrectPlayerName).length
  const infiniteQuestionsAsked = Math.max(0, Math.floor(Number(summaryQuestionCount ?? 0) || 0))

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{getStageStatusText("round_summary", isInfiniteMode)}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <CardTitle>{isInfiniteMode ? "Infinite run" : `Round ${Number(round?.number ?? 0)}`}</CardTitle>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  getRoundBehaviourBadgeClass(isQuickfire ? "quickfire" : "standard", { isInfiniteMode })
                }`}
              >
                {getRoundBehaviourLabel(isQuickfire ? "quickfire" : "standard", { isInfiniteMode })}
              </span>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {isInfiniteMode ? "Continuous question run" : String(round?.name ?? "Round summary")}
            </div>
          </div>

          {remainingSeconds !== null ? (
            <div className="rounded-xl border border-border bg-card px-3 py-2 text-right">
              <div className="text-xs text-muted-foreground">
                {isLastQuestionOverall ? "Finishing game in" : "Next round starts in"}
              </div>
              <div className="text-lg font-semibold tabular-nums">{formatDuration(remainingSeconds)}</div>
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isQuickfire ? (
          <div className="rounded-xl border border-violet-500/30 bg-violet-600/10 px-4 py-3 text-sm">
            <div className="font-medium text-foreground">Quickfire review</div>
            <div className="mt-1 text-muted-foreground">
              There was no reveal after each question. This review shows the correct answer, who got it right, and
              who earned the fastest bonus point. The lightning mark shows the fastest correct player.
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">{isInfiniteMode ? "Questions asked" : "Correct"}</div>
            <div className="mt-1 text-lg font-semibold">
              {isInfiniteMode
                ? fmt(infiniteQuestionsAsked)
                : `${fmt(Number(roundStats?.correct ?? 0))}/${fmt(Number(roundStats?.answered ?? 0))}`}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">{isInfiniteMode ? "Correct answers" : isQuickfire ? "Fastest bonuses" : "Joker usage"}</div>
            <div className="mt-1 text-lg font-semibold">
              {isInfiniteMode ? fmt(Number(roundStats?.correct ?? 0)) : isQuickfire ? fmt(fastestAwardCount) : fmt(Number(roundStats?.jokerUsed ?? 0))}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {isInfiniteMode
                ? "Unanswered questions do not count as correct."
                : isQuickfire
                  ? "One bonus point goes to the fastest correct player on each question."
                  : `Joker correct: ${fmt(Number(roundStats?.jokerCorrect ?? 0))}`}
            </div>
          </div>
        </div>

        {isQuickfire && quickfireQuestions.length ? (
          <div className="space-y-3">
            <div className="text-sm font-medium text-foreground">Question review</div>

            <div className="space-y-3">
              {quickfireQuestions.map((question) => (
                <div key={question.questionId} className="rounded-xl border border-border bg-card px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-relaxed text-foreground">
                        Q{question.questionNumberInRound}. {question.questionText}
                      </div>
                    </div>

                    {question.fastestCorrectPlayerName ? (
                      <span className="shrink-0 rounded-full border border-violet-500/40 bg-violet-600/10 px-2 py-0.5 text-[11px] text-violet-200">
                        Fastest bonus
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Answer</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                    {question.correctAnswer || "No answer recorded"}
                  </div>

                  <div className="mt-3 text-sm text-muted-foreground">Correct: {formatCorrectNames(question)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {gameMode === "teams" ? (
          teamRows.length ? (
            <div className="space-y-3">
              <div className="text-sm font-medium text-foreground">By team</div>

              {teamRows.map((team) => (
                <div key={team.team} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{team.team}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {isQuickfire || isInfiniteMode
                          ? `Correct ${fmt(Number(team.correct ?? 0))}/${fmt(Number(team.answered ?? 0))}`
                          : `Correct ${fmt(Number(team.correct ?? 0))}/${fmt(Number(team.answered ?? 0))} | Joker ${fmt(Number(team.jokerUsed ?? 0))}`}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Team score so far</div>
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
                          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="truncate text-sm text-foreground">{player.name}</div>
                            {!isInfiniteMode && player.usedJokerInScope ? <JokerBadge /> : null}
                          </div>

                          <div className="shrink-0 text-sm font-semibold tabular-nums">{fmt(Number(player.totalScore ?? 0))}</div>
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
            <div className="text-sm font-medium text-foreground">Players</div>

            <div className="space-y-2">
              {soloPlayers.map((player) => (
                <div
                  key={player.id ?? player.name}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="truncate text-sm text-foreground">{player.name}</div>
                    {!isInfiniteMode && player.usedJokerInScope ? <JokerBadge /> : null}
                  </div>

                  <div className="shrink-0 text-sm font-semibold tabular-nums">{fmt(Number(player.totalScore ?? 0))}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {remainingSeconds === null ? (
          <div className="text-sm text-muted-foreground">
            {isLastQuestionOverall ? "Waiting for the host to finish the game." : "Waiting for the next round to start."}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
