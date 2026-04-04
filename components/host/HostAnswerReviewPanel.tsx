"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

type ReviewAnswerRow = {
  answerId: string
  playerId: string
  playerName: string
  teamName: string | null
  receivedAt: string | null
  jokerActive: boolean
  original: {
    isCorrect: boolean
    scoreDelta: number
  }
  effective: {
    isCorrect: boolean
    scoreDelta: number
  }
  override: {
    overriddenIsCorrect: boolean
    overriddenScoreDelta: number
    reason: string | null
    createdAt: string
    updatedAt: string
  } | null
  submission: {
    optionIndex: number | null
    optionLabel: string | null
    optionText: string | null
    answerText: string | null
    displayText: string
    normalisedAnswerText: string | null
  }
}

type ReviewQuestionRow = {
  questionId: string
  questionIndex: number
  questionNumber: number
  questionNumberInRound: number
  isCurrentQuestion: boolean
  answerType: "mcq" | "text"
  questionText: string
  correctAnswer: string
  acceptedAnswers: string[]
  explanation: string
  answers: ReviewAnswerRow[]
}

type ReviewRoundRow = {
  roundIndex: number
  roundNumber: number
  roundName: string
  behaviourType: "standard" | "quickfire" | "heads_up"
  isCurrentRound: boolean
  questions: ReviewQuestionRow[]
}

type ReviewResponse = {
  ok?: boolean
  error?: string
  room?: {
    id: string
    code: string
    phase: string
    questionIndex: number
    currentRoundIndex: number | null
  }
  review?: {
    totalAnsweredQuestions: number
    rounds: ReviewRoundRow[]
  }
}

type Props = {
  roomCode: string
  roomPhase: string
}

function formatWhen(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function statusClasses(isCorrect: boolean) {
  return isCorrect
    ? "border-emerald-500/40 bg-emerald-600/10 text-emerald-200"
    : "border-red-500/40 bg-red-600/10 text-red-200"
}

function roundOptionLabel(round: ReviewRoundRow) {
  return `Round ${round.roundNumber}: ${round.roundName}`
}

export default function HostAnswerReviewPanel({ roomCode, roomPhase }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ReviewResponse | null>(null)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({})
  const [selectedRoundIndex, setSelectedRoundIndex] = useState<string>("")

  const reviewRounds = data?.review?.rounds ?? []
  const totalQuestions = Math.max(0, Number(data?.review?.totalAnsweredQuestions ?? 0) || 0)

  async function loadReview({ background = false }: { background?: boolean } = {}) {
    if (!roomCode) return

    if (background) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }
    setError(null)

    try {
      const res = await fetch(`/api/room/review?code=${encodeURIComponent(roomCode)}`, { cache: "no-store" })
      const json: ReviewResponse = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(String(json?.error ?? "Could not load answer review."))
        return
      }
      setData(json)
    } catch {
      setError("Could not load answer review.")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    if (!isOpen || !roomCode) return
    loadReview()
  }, [isOpen, roomCode])

  useEffect(() => {
    if (!isOpen || !roomCode) return
    if (!(roomPhase === "running" || roomPhase === "finished")) return

    const id = window.setInterval(() => {
      loadReview({ background: true })
    }, 5000)

    return () => window.clearInterval(id)
  }, [isOpen, roomCode, roomPhase])

  useEffect(() => {
    if (reviewRounds.length === 0) {
      setSelectedRoundIndex("")
      return
    }

    const stillExists = reviewRounds.some((round) => String(round.roundIndex) === selectedRoundIndex)
    if (stillExists) return

    const currentRound = reviewRounds.find((round) => round.isCurrentRound)
    const fallbackRound = currentRound ?? reviewRounds[reviewRounds.length - 1]
    setSelectedRoundIndex(String(fallbackRound.roundIndex))
  }, [reviewRounds, selectedRoundIndex])

  const currentRoundNumber = useMemo(() => {
    const current = reviewRounds.find((round) => round.isCurrentRound)
    return current?.roundNumber ?? null
  }, [reviewRounds])

  const selectedRound = useMemo(() => {
    if (!selectedRoundIndex) return null
    return reviewRounds.find((round) => String(round.roundIndex) === selectedRoundIndex) ?? null
  }, [reviewRounds, selectedRoundIndex])

  async function applyOverride(answerId: string, resolution: "accept" | "reject" | "restore") {
    if (!roomCode) return
    setSavingIds((prev) => ({ ...prev, [answerId]: true }))
    setError(null)

    try {
      const res = await fetch("/api/room/review/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: roomCode,
          answerId,
          resolution,
          reason: resolution === "restore" ? "" : String(reasons[answerId] ?? "").trim(),
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(String(json?.error ?? "Could not save that review change."))
        return
      }

      await loadReview({ background: true })
    } catch {
      setError("Could not save that review change.")
    } finally {
      setSavingIds((prev) => {
        const next = { ...prev }
        delete next[answerId]
        return next
      })
    }
  }

  if (!(roomPhase === "running" || roomPhase === "finished")) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Answer review</CardTitle>
            <div className="mt-1 text-sm text-muted-foreground">
              Open this when you need to review challenged answers. Text answers can be accepted, rejected, or restored for this room only.
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setIsOpen((prev) => !prev)}>
            {isOpen ? "Hide review" : "Open review"}
          </Button>
        </div>
      </CardHeader>

      {isOpen ? (
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <div className="rounded-full border border-border px-3 py-1">
              {totalQuestions} question{totalQuestions === 1 ? "" : "s"} with answers
            </div>
            {currentRoundNumber ? (
              <div className="rounded-full border border-border px-3 py-1">Current round: {currentRoundNumber}</div>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => loadReview()} disabled={isLoading || isRefreshing}>
              {isLoading || isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            This is a room-only adjudication tool. It changes scores for the current game but does not edit the question bank.
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {error}
            </div>
          ) : null}

          {isLoading && !data ? (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Loading answer review...</div>
          ) : null}

          {!isLoading && data && reviewRounds.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              No submitted answers are available to review yet.
            </div>
          ) : null}

          {reviewRounds.length > 0 ? (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div>
                  <div className="text-sm font-medium text-foreground">Round</div>
                  <select
                    value={selectedRoundIndex}
                    onChange={(event) => setSelectedRoundIndex(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
                  >
                    {reviewRounds.map((round) => (
                      <option key={round.roundIndex} value={String(round.roundIndex)}>
                        {roundOptionLabel(round)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-xs text-muted-foreground md:text-right">
                  Review one round at a time so the host screen stays easier to scan.
                </div>
              </div>

              {selectedRound ? (
                <details className="rounded-xl border border-border bg-card" open>
                  <summary className="cursor-pointer list-none px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-foreground">{roundOptionLabel(selectedRound)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {selectedRound.questions.length} answered question{selectedRound.questions.length === 1 ? "" : "s"}
                          {selectedRound.isCurrentRound ? " in the current round." : "."}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedRound.isCurrentRound ? (
                          <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-sky-200">
                            Current
                          </span>
                        ) : null}
                        <div className="rounded-full border border-border px-3 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          {String(selectedRound.behaviourType ?? "standard").replace(/_/g, " ")}
                        </div>
                      </div>
                    </div>
                  </summary>

                  <div className="space-y-3 border-t border-border px-4 py-4">
                    {selectedRound.questions.map((question) => (
                      <div key={question.questionId} className="rounded-xl border border-border bg-background p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">
                              Q{question.questionNumber}. {question.questionText}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Round position: {question.questionNumberInRound}. Correct answer: {question.correctAnswer || "No answer stored."}
                            </div>
                            {question.answerType === "text" && question.acceptedAnswers.length > 0 ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                Accepted alternatives: {question.acceptedAnswers.join(", ")}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            {question.isCurrentQuestion ? (
                              <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-sky-200">
                                Live
                              </span>
                            ) : null}
                            <div className="rounded-full border border-border px-3 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                              {question.answerType === "text" ? "Text" : "MCQ"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 space-y-3">
                          {question.answers.map((answer) => {
                            const busy = Boolean(savingIds[answer.answerId])
                            const isOverridden = Boolean(answer.override)
                            return (
                              <div key={answer.answerId} className="rounded-xl border border-border bg-card p-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-medium text-foreground">
                                      {answer.playerName}
                                      {answer.teamName ? <span className="text-muted-foreground"> · {answer.teamName}</span> : null}
                                    </div>
                                    <div className="mt-1 text-sm text-foreground">
                                      Submitted: {answer.submission.displayText || "No answer text stored."}
                                    </div>
                                    {question.answerType === "text" ? (
                                      <div className="mt-1 text-xs text-muted-foreground">
                                        Normalised: {answer.submission.normalisedAnswerText || "Blank"}
                                      </div>
                                    ) : null}
                                    {answer.receivedAt ? (
                                      <div className="mt-1 text-xs text-muted-foreground">Sent at {formatWhen(answer.receivedAt)}</div>
                                    ) : null}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClasses(answer.effective.isCorrect)}`}>
                                      {answer.effective.isCorrect ? "Correct" : "Wrong"}
                                    </span>
                                    {answer.jokerActive ? (
                                      <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">Joker</span>
                                    ) : null}
                                    {isOverridden ? (
                                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200">Overridden</span>
                                    ) : null}
                                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                                      Score {answer.effective.scoreDelta >= 0 ? `+${answer.effective.scoreDelta}` : String(answer.effective.scoreDelta)}
                                    </span>
                                  </div>
                                </div>

                                {isOverridden ? (
                                  <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">
                                    Originally {answer.original.isCorrect ? "correct" : "wrong"} with {answer.original.scoreDelta >= 0 ? `+${answer.original.scoreDelta}` : String(answer.original.scoreDelta)}.
                                    {answer.override?.reason ? ` Reason: ${answer.override.reason}` : ""}
                                  </div>
                                ) : null}

                                {question.answerType === "text" ? (
                                  <div className="mt-3 space-y-2">
                                    <input
                                      value={reasons[answer.answerId] ?? answer.override?.reason ?? ""}
                                      onChange={(event) => setReasons((prev) => ({ ...prev, [answer.answerId]: event.target.value }))}
                                      placeholder="Optional reason for this override"
                                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                                    />
                                    <div className="flex flex-wrap gap-2">
                                      <Button variant="secondary" size="sm" onClick={() => applyOverride(answer.answerId, "accept")} disabled={busy || answer.effective.isCorrect}>
                                        {busy ? "Saving..." : "Accept answer"}
                                      </Button>
                                      <Button variant="secondary" size="sm" onClick={() => applyOverride(answer.answerId, "reject")} disabled={busy || !answer.effective.isCorrect}>
                                        {busy ? "Saving..." : "Reject answer"}
                                      </Button>
                                      <Button variant="ghost" size="sm" onClick={() => applyOverride(answer.answerId, "restore")} disabled={busy || !isOverridden}>
                                        {busy ? "Saving..." : "Restore original"}
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mt-3 text-xs text-muted-foreground">
                                    MCQ answers are shown for review only in this version.
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  )
}
