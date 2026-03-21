"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"

import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import GameCompletedSummary from "@/components/GameCompletedSummary"
import RoundSummaryCard from "@/components/RoundSummaryCard"
import PageShell from "@/components/PageShell"
import { getGameProgressLabel, getRunBadgeLabel, getStageStatusText, isInfiniteFinalStage, isInfiniteModeFromState } from "@/lib/gameMode"

type RoomState = any

function pillClass(stage: string) {
  if (stage === "open") return "bg-emerald-600/20 text-emerald-200 border-emerald-500/40"
  if (stage === "reveal") return "bg-indigo-600/20 text-indigo-200 border-indigo-500/40"
  if (stage === "round_summary") return "bg-violet-600/20 text-violet-200 border-violet-500/40"
  if (stage === "countdown") return "bg-amber-600/20 text-amber-200 border-amber-500/40"
  if (stage === "wait") return "bg-slate-600/20 text-slate-200 border-slate-500/40"
  return "bg-slate-600/20 text-slate-200 border-slate-500/40"
}

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function roundModeLabel(behaviourType: unknown) {
  return String(behaviourType ?? "").trim().toLowerCase() === "quickfire" ? "Quickfire" : "Standard"
}

function roundModeBadgeClass(behaviourType: unknown) {
  return String(behaviourType ?? "").trim().toLowerCase() === "quickfire"
    ? "border-violet-500/40 bg-violet-600/10 text-violet-200"
    : "border-emerald-500/40 bg-emerald-600/10 text-emerald-200"
}

export default function PlayerPage() {
  const params = useParams<{ code?: string }>()
  const router = useRouter()
  const code = String(params?.code ?? "").toUpperCase()

  const [state, setState] = useState<RoomState | null>(null)
  const [serverOffsetMs, setServerOffsetMs] = useState(0)
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now())

  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState("")
  const [teamName, setTeamName] = useState("")

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [submittedIndex, setSubmittedIndex] = useState<number | null>(null)
  const [mcqSubmitting, setMcqSubmitting] = useState(false)
  const [mcqAutoSubmitted, setMcqAutoSubmitted] = useState(false)

  const [typedValue, setTypedValue] = useState("")
  const [typedSubmitted, setTypedSubmitted] = useState(false)
  const [typedIsCorrect, setTypedIsCorrect] = useState<boolean | null>(null)

  const [answerError, setAnswerError] = useState<string | null>(null)
  const [lastQuestionKey, setLastQuestionKey] = useState<string | null>(null)
  const [roundTransitionQuestionIndex, setRoundTransitionQuestionIndex] = useState<number | null>(null)

  const [audioEnabled, setAudioEnabled] = useState(false)
  const [autoplayFailed, setAutoplayFailed] = useState(false)
  const [playedForQ, setPlayedForQ] = useState<string | null>(null)
  const [preparedForQ, setPreparedForQ] = useState<string | null>(null)

  const [jokerBusy, setJokerBusy] = useState(false)
  const [jokerError, setJokerError] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const autoSubmitAttemptKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!code) return
    setPlayerId(localStorage.getItem(`mtq_player_${code}`))
    setPlayerName(localStorage.getItem(`mtq_player_name_${code}`) ?? "")
    setTeamName(localStorage.getItem(`mtq_team_name_${code}`) ?? "")
  }, [code])

  const refreshState = useCallback(async () => {
    if (!code) return null

    const res = await fetch(`/api/room/state?code=${code}`, { cache: "no-store" })
    const data = await res.json().catch(() => ({}))

    setState(data)
    if (data?.serverNow) {
      const serverNowMs = Date.parse(String(data.serverNow))
      if (Number.isFinite(serverNowMs)) {
        setServerOffsetMs(serverNowMs - Date.now())
      }
    }

    return data
  }, [code])

  useEffect(() => {
    if (!code) return

    let cancelled = false

    async function tick() {
      const data = await refreshState()
      if (cancelled || !data) return
    }

    tick()
    const pollMs = state?.phase === "running" ? 250 : 500
    const id = window.setInterval(tick, pollMs)

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [code, refreshState, state?.phase])

  useEffect(() => {
    const id = window.setInterval(() => setLiveNowMs(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const qi = state?.questionIndex
    if (qi === undefined || qi === null) return

    const qid = String(state?.question?.id ?? "")
    const key = `${qi}:${qid}`

    if (key !== lastQuestionKey) {
      setLastQuestionKey(key)

      setSelectedIndex(null)
      setSubmittedIndex(null)
      setMcqSubmitting(false)
      setMcqAutoSubmitted(false)
      autoSubmitAttemptKeyRef.current = null

      setTypedValue("")
      setTypedSubmitted(false)
      setTypedIsCorrect(null)

      setAnswerError(null)

      setPlayedForQ(null)
      setPreparedForQ(null)
      setAutoplayFailed(false)
    }
  }, [state?.questionIndex, state?.question?.id, lastQuestionKey])

  useEffect(() => {
    const qi = Number(state?.questionIndex ?? NaN)
    if (!Number.isFinite(qi)) return

    if (state?.phase === "lobby" || state?.phase === "finished") {
      setRoundTransitionQuestionIndex(null)
      return
    }

    if (state?.stage === "round_summary") {
      setRoundTransitionQuestionIndex(qi)
      return
    }

    if (roundTransitionQuestionIndex !== null && qi !== roundTransitionQuestionIndex) {
      setRoundTransitionQuestionIndex(null)
    }
  }, [state?.stage, state?.phase, state?.questionIndex, roundTransitionQuestionIndex])

  const gameMode = String(state?.gameMode ?? "teams") === "solo" ? "solo" : "teams"
  const teamScoreMode = String(state?.teamScoreMode ?? "total") === "average" ? "average" : "total"

  const audioMode = String(state?.audioMode ?? "display")
  const shouldPlayOnPhone = audioMode === "phones" || audioMode === "both"

  const q = state?.question
  const answerType = String(q?.answerType ?? "mcq")

  const isAudioQ = q?.roundType === "audio"
  const isPictureQ = q?.roundType === "picture"
  const isTextQ = q?.answerType === "text"

  const correctIndex = Number.isFinite(Number(state?.reveal?.answerIndex))
    ? Number(state?.reveal?.answerIndex)
    : null
  const revealAnswerText = String(state?.reveal?.answerText ?? "").trim()
  const inReveal = Boolean(state?.reveal)

  const canAnswer = useMemo(() => {
    if (state?.phase !== "running") return false
    if (state?.stage !== "open") return false
    if (!q?.id) return false

    if (answerType === "text") return !typedSubmitted
    return submittedIndex === null && !mcqSubmitting
  }, [state?.phase, state?.stage, q?.id, answerType, typedSubmitted, submittedIndex, mcqSubmitting])

  const players = useMemo(() => {
    return Array.isArray(state?.players) ? state.players : []
  }, [state])

  const myPlayer = useMemo(() => {
    if (!playerId) return null
    return players.find((p: any) => p.id === playerId) ?? null
  }, [players, playerId])

  const myJokerIndex = useMemo(() => {
    const value = Number(myPlayer?.joker_round_index)
    return Number.isFinite(value) ? value : null
  }, [myPlayer?.joker_round_index])

  const roundsPlan = useMemo(() => {
    const plan = Array.isArray(state?.rounds?.plan) ? state.rounds.plan : null
    if (plan && plan.length) return plan

    const names = Array.isArray(state?.rounds?.names) ? state.rounds.names : []
    return names.map((name: any, index: number) => ({
      index,
      number: index + 1,
      name: String(name ?? "").trim() || `Round ${index + 1}`,
      size: null,
      jokerEligible: true,
      countsTowardsScore: true,
    }))
  }, [state])

  const jokerEligibleRounds = useMemo(() => {
    return roundsPlan.filter((round: any) => round?.jokerEligible !== false)
  }, [roundsPlan])

  const jokerEligibleCount = useMemo(() => {
    const explicitCount = Number(state?.rounds?.jokerEligibleCount)
    if (Number.isFinite(explicitCount)) return explicitCount
    return jokerEligibleRounds.length
  }, [state?.rounds?.jokerEligibleCount, jokerEligibleRounds])

  const jokerEnabled = useMemo(() => {
    if (typeof state?.rounds?.jokerEnabled === "boolean") {
      return state.rounds.jokerEnabled
    }
    return jokerEligibleCount >= 2
  }, [state?.rounds?.jokerEnabled, jokerEligibleCount])

  const currentRound = state?.rounds?.current ?? null
  const isQuickfireRound = String(currentRound?.behaviourType ?? "").trim().toLowerCase() === "quickfire"
  const isUntimedAnswers = Boolean(state?.settings?.untimedAnswers)

  const actualCloseAtMs = state?.times?.closeAt ? Date.parse(String(state.times.closeAt)) : null
  const displayCloseAtRaw =
    state?.times?.displayCloseAt ?? state?.times?.visibleCloseAt ?? state?.times?.closeAt ?? null
  const displayCloseAtMs = displayCloseAtRaw ? Date.parse(String(displayCloseAtRaw)) : null
  const adjustedNowMs = liveNowMs + serverOffsetMs

  const secondsRemaining =
    displayCloseAtMs && Number.isFinite(displayCloseAtMs)
      ? Math.max(0, Math.ceil((displayCloseAtMs - adjustedNowMs) / 1000))
      : 0

  useEffect(() => {
    if (!playerId || !q?.id) return
    if (answerType !== "mcq") return
    if (state?.phase !== "running") return
    if (state?.stage !== "open") return
    if (isUntimedAnswers) return
    if (selectedIndex === null) return
    if (submittedIndex !== null) return
    if (mcqSubmitting) return
    if (!actualCloseAtMs || !Number.isFinite(actualCloseAtMs)) return

    const millisRemaining = actualCloseAtMs - adjustedNowMs
    if (millisRemaining > 200) return

    const attemptKey = `${q.id}:${selectedIndex}`
    if (autoSubmitAttemptKeyRef.current === attemptKey) return
    autoSubmitAttemptKeyRef.current = attemptKey

    void submitMcqOption(selectedIndex, "auto")
  }, [
    playerId,
    q?.id,
    answerType,
    state?.phase,
    state?.stage,
    isUntimedAnswers,
    selectedIndex,
    submittedIndex,
    mcqSubmitting,
    actualCloseAtMs,
    adjustedNowMs,
  ])

  const teamRows = useMemo(() => {
    const byTeam = new Map<string, { label: string; total: number; size: number }>()

    for (const player of players) {
      const team = String(player.team_name ?? "").trim() || "No team"
      const entry = byTeam.get(team) ?? { label: team, total: 0, size: 0 }
      entry.total += Number(player.score ?? 0)
      entry.size += 1
      byTeam.set(team, entry)
    }

    const rows = Array.from(byTeam.values()).map((team) => {
      const average = team.size > 0 ? team.total / team.size : 0
      const score = teamScoreMode === "average" ? average : team.total
      return {
        id: team.label,
        label: team.label,
        score,
        size: team.size,
        total: team.total,
        average,
      }
    })

    return rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.total !== a.total) return b.total - a.total
      return a.label.localeCompare(b.label)
    })
  }, [players, teamScoreMode])

  const myTeamRow = useMemo(() => {
    if (gameMode !== "teams") return null
    const resolvedTeamName = String(myPlayer?.team_name ?? teamName ?? "").trim() || "No team"
    return teamRows.find((team) => team.label === resolvedTeamName) ?? null
  }, [gameMode, myPlayer?.team_name, teamName, teamRows])

  function applyClosedQuestionState(data: any) {
    if (!data?.questionClosed) return

    setState((prev: any) => {
      if (!prev) return prev
      return {
        ...prev,
        serverNow: data?.serverNow ?? prev.serverNow,
        stage: data?.nextStage ?? "reveal",
        times: {
          ...prev.times,
          closeAt: data?.roomTimes?.closeAt ?? prev?.times?.closeAt,
          revealAt: data?.roomTimes?.revealAt ?? prev?.times?.revealAt,
          nextAt: data?.roomTimes?.nextAt ?? prev?.times?.nextAt,
        },
        reveal: data?.reveal ?? null,
        questionStats: data?.questionStats ?? prev.questionStats,
      }
    })

    if (data?.serverNow) {
      const serverNowMs = Date.parse(String(data.serverNow))
      if (Number.isFinite(serverNowMs)) {
        setServerOffsetMs(serverNowMs - Date.now())
      }
    }
  }

  function pickOption(optionIndex: number) {
    if (!canAnswer) return
    setAnswerError(null)
    setSelectedIndex(optionIndex)
  }

  async function submitMcqOption(optionIndex: number, mode: "manual" | "auto" = "manual") {
    if (!playerId || !q?.id) return false
    if (!canAnswer) return false
    if (!Number.isFinite(optionIndex)) return false

    setAnswerError(null)
    setMcqSubmitting(true)

    try {
      const res = await fetch("/api/room/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, playerId, questionId: q.id, optionIndex }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setAnswerError(data?.error ?? "Could not send answer.")
        setMcqSubmitting(false)
        return false
      }

      if (data?.accepted === false) {
        if (data?.reason === "already_answered") {
          setSubmittedIndex(-1)
          setSelectedIndex(null)
          setAnswerError("You already submitted an answer for this question.")
          setMcqSubmitting(false)
          return false
        }

        if (mode === "auto" && data?.reason === "not_open") {
          setAnswerError("Time expired before your selected answer could be locked in.")
          setMcqSubmitting(false)
          return false
        }

        setAnswerError("Answer not accepted.")
        setMcqSubmitting(false)
        return false
      }

      setSubmittedIndex(optionIndex)
      setMcqAutoSubmitted(mode === "auto")
      setMcqSubmitting(false)

      if (data?.questionClosed) {
        applyClosedQuestionState(data)
      } else {
        void refreshState()
      }

      return true
    } catch {
      setAnswerError("Could not send answer.")
      setMcqSubmitting(false)
      return false
    }
  }

  async function submitMcq() {
    if (selectedIndex === null) return
    await submitMcqOption(selectedIndex, "manual")
  }

  async function submitTyped() {
    if (!playerId || !q?.id) return
    if (!canAnswer) return

    const trimmed = typedValue.trim()
    if (!trimmed) {
      setAnswerError("Type an answer first.")
      return
    }

    setAnswerError(null)
    setTypedSubmitted(true)

    try {
      const res = await fetch("/api/room/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, playerId, questionId: q.id, answerText: trimmed }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || data?.accepted === false) {
        setAnswerError(data?.error ?? "Answer not accepted.")
        setTypedSubmitted(false)
        return
      }

      setTypedIsCorrect(Boolean(data?.isCorrect))

      if (data?.questionClosed) {
        applyClosedQuestionState(data)
      } else {
        void refreshState()
      }
    } catch {
      setAnswerError("Could not send answer.")
      setTypedSubmitted(false)
    }
  }

  async function pickJoker(roundIndex: number) {
    if (!playerId) return
    if (state?.phase !== "lobby") return

    setJokerError(null)
    setJokerBusy(true)

    try {
      const res = await fetch("/api/room/joker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, playerId, jokerRoundIndex: roundIndex }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setJokerError(String(data?.error ?? "Could not save joker round."))
        setJokerBusy(false)
        return
      }

      setJokerBusy(false)
      void refreshState()
    } catch {
      setJokerError("Could not save joker round.")
      setJokerBusy(false)
    }
  }

  function stopClip(reset = true) {
    const el = audioRef.current
    if (!el) return

    try {
      el.pause()
      if (reset) el.currentTime = 0
    } catch {
      // ignore
    }
  }

  async function unlockAudio() {
    setAudioEnabled(true)
    setAutoplayFailed(false)

    try {
      const anyWindow = window as any
      const Ctx = anyWindow.AudioContext || anyWindow.webkitAudioContext
      if (Ctx) {
        const ctx = new Ctx()
        await ctx.resume()
        const buf = ctx.createBuffer(1, 1, 22050)
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.connect(ctx.destination)
        src.start(0)
        src.stop(0.01)
        await new Promise((resolve) => setTimeout(resolve, 20))
        await ctx.close()
      }
    } catch {
      // ignore
    }
  }

  function prepareClip() {
    const el = audioRef.current
    if (!q?.audioUrl || !el) return
    if (preparedForQ === q.id) return

    try {
      el.pause()
      el.currentTime = 0
    } catch {
      // ignore
    }

    el.src = q.audioUrl
    el.preload = "auto"
    el.load()
    setPreparedForQ(q.id)
  }

  async function playClip(): Promise<boolean> {
    const el = audioRef.current
    if (!q?.audioUrl || !el) return false

    try {
      if (preparedForQ !== q.id) {
        el.src = q.audioUrl
        el.preload = "auto"
        el.load()
        setPreparedForQ(q.id)
      }

      await el.play()
      return true
    } catch {
      return false
    }
  }

  useEffect(() => {
    if (!shouldPlayOnPhone) return
    if (!isAudioQ) return
    if (!q?.audioUrl) return
    prepareClip()
  }, [shouldPlayOnPhone, isAudioQ, q?.id, q?.audioUrl])

  useEffect(() => {
    if (!shouldPlayOnPhone) return
    if (!audioEnabled) return
    if (!isAudioQ) return
    if (state?.stage !== "open") return
    if (!q?.audioUrl) return
    if (playedForQ === q.id) return

    let cancelled = false

    async function attempt() {
      const ok = await playClip()
      if (cancelled) return

      if (ok) {
        setPlayedForQ(q.id)
        setAutoplayFailed(false)
        return
      }

      setAutoplayFailed(true)
    }

    attempt().catch(() => {})

    return () => {
      cancelled = true
    }
  }, [shouldPlayOnPhone, audioEnabled, isAudioQ, state?.stage, q?.id, q?.audioUrl, playedForQ])

  useEffect(() => {
    const shouldKeepPlaying =
      state?.phase === "running" &&
      state?.stage === "open" &&
      shouldPlayOnPhone &&
      audioEnabled &&
      isAudioQ &&
      Boolean(q?.audioUrl)

    if (!shouldKeepPlaying) {
      stopClip()
    }
  }, [state?.phase, state?.stage, q?.id, q?.audioUrl, shouldPlayOnPhone, audioEnabled, isAudioQ])

  useEffect(() => {
    return () => {
      stopClip()
    }
  }, [])

  if (!code) {
    return (
      <PageShell width="narrow" className="py-10 sm:py-12">
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Missing room code in the URL.
          </CardContent>
        </Card>
      </PageShell>
    )
  }

  if (!playerId) {
    return (
      <PageShell width="narrow" className="py-10 sm:py-12">
        <Card>
          <CardHeader>
            <CardTitle>Player not found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            This phone does not have a player ID for room {code}. Go back to Join and enter the code again.
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button onClick={() => router.push(`/join?code=${code}`)}>Go to Join</Button>
          </CardFooter>
        </Card>
      </PageShell>
    )
  }

  if (!state) return null

  const isInfiniteMode = isInfiniteModeFromState(state)

  const stage = String(state?.stage ?? "")
  const isInfiniteStageSummary = isInfiniteFinalStage(stage, {
    isInfiniteMode,
    isLastQuestionOverall: Boolean(state?.flow?.isLastQuestionOverall),
  })
  const status = getStageStatusText(stage, isInfiniteStageSummary)

  const questionNumber = Number(state?.progress?.currentQuestionNumber ?? state.questionIndex ?? 0) + (state?.progress?.currentQuestionNumber != null ? 0 : 1)
  const questionCount = Number(state?.progress?.totalQuestions ?? state.questionCount ?? 0)
  const progressLabel = getGameProgressLabel({
    isInfiniteMode,
    currentQuestionNumber: questionNumber,
    totalQuestions: questionCount,
    phase: String(state?.phase ?? ""),
  })

  const showLobby = state.phase === "lobby"
  const finished = state.phase === "finished"

  const suppressStaleQuestionBetweenRounds =
    !showLobby &&
    !finished &&
    stage !== "round_summary" &&
    roundTransitionQuestionIndex !== null &&
    Number(state?.questionIndex ?? -1) === roundTransitionQuestionIndex

  const showScoreTimerRow =
    !showLobby &&
    !finished &&
    stage !== "round_summary" &&
    (Boolean(myPlayer) || Boolean(q))

  const showTimerCard = !showLobby && !finished && stage !== "round_summary" && Boolean(q)

  let timerLabel = isUntimedAnswers
    ? isQuickfireRound
      ? "Quickfire window"
      : "Answer window"
    : isQuickfireRound
      ? "Quickfire closes in"
      : "Time remaining"
  let timerValue = isUntimedAnswers ? "Waiting for host" : formatDuration(secondsRemaining)

  if (stage !== "open") {
    timerValue = isUntimedAnswers ? "Closed" : formatDuration(secondsRemaining)
  }

  const correctAnswerText =
    answerType === "mcq"
      ? correctIndex !== null && Array.isArray(q?.options)
        ? String(q.options[correctIndex] ?? "")
        : revealAnswerText
      : revealAnswerText

  return (
    <PageShell width="narrow">
      <audio ref={audioRef} />

      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Room</div>
          <div className="text-lg font-semibold tracking-wide">{code}</div>
          {playerName ? (
            <div className="text-xs text-muted-foreground">
              Player: <span className="text-foreground">{playerName}</span>
              {gameMode === "teams" && teamName ? (
                <>
                  <span className="mx-2">|</span>
                  Team: <span className="text-foreground">{teamName}</span>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          {status ? (
            <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(stage)}`}>{status}</span>
          ) : null}

          {state.phase === "running" ? (
            <div className="flex flex-col items-end gap-2">
              {currentRound ? (
                <span className={`rounded-full border px-3 py-1 text-xs ${isInfiniteMode ? "border-sky-500/40 bg-sky-600/10 text-sky-200" : "border-border bg-card text-muted-foreground"}`}>
                  {getRunBadgeLabel({ isInfiniteMode, currentRound })}
                </span>
              ) : null}

              {!isInfiniteMode && currentRound ? (
                <span className={`rounded-full border px-3 py-1 text-xs ${roundModeBadgeClass(currentRound.behaviourType)}`}>
                  {roundModeLabel(currentRound.behaviourType)}
                </span>
              ) : null}

              <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
                {progressLabel}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {showLobby ? (
        <Card>
          <CardHeader>
            <CardTitle>Waiting to start</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div>You have joined. Wait for the host to start the game.</div>

            {shouldPlayOnPhone ? (
              <div className="rounded-lg border border-border bg-muted px-3 py-2">
                {!audioEnabled ? (
                  <Button onClick={unlockAudio} variant="secondary">
                    Enable audio on this phone
                  </Button>
                ) : (
                  <div>Audio enabled for this phone.</div>
                )}
              </div>
            ) : null}

            {roundsPlan.length > 0 ? (
              <div className="rounded-lg border border-border bg-card px-3 py-3">
                <div className="text-sm font-medium text-foreground">Rounds</div>
                <div className="mt-2 grid gap-1">
                  {roundsPlan.map((round: any) => {
                    const selected = myJokerIndex === Number(round.index)
                    const jokerEligible = round?.jokerEligible !== false

                    return (
                      <div key={round.index} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate">
                            {Number(round.number)}. {String(round.name)}
                          </div>
                          {String(round?.behaviourType ?? "").trim().toLowerCase() === "quickfire" ? (
                            <div className="mt-1 text-[11px] text-muted-foreground">Quickfire, fastest correct +1, no Joker</div>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                          {round.size ? (
                            <div className="text-xs text-muted-foreground tabular-nums">
                              {Number(round.size)} questions
                            </div>
                          ) : null}

                          {!jokerEligible ? (
                            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              No Joker
                            </span>
                          ) : null}

                          {selected ? (
                            <span className="rounded-full border border-emerald-500/40 bg-emerald-600/10 px-2 py-0.5 text-[10px] text-emerald-200">
                              Joker
                            </span>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {jokerEnabled && jokerEligibleCount >= 2 ? (
              <div className="rounded-lg border border-border bg-muted px-3 py-3">
                <div className="text-sm font-medium text-foreground">Pick your Joker round</div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  {jokerEligibleRounds.map((round: any) => {
                    const selected = myJokerIndex === Number(round.index)
                    return (
                      <Button
                        key={round.index}
                        variant={selected ? "primary" : "secondary"}
                        disabled={jokerBusy}
                        onClick={() => pickJoker(Number(round.index))}
                      >
                        {String(round.name)}
                      </Button>
                    )
                  })}
                </div>

                <div className="mt-2 text-xs text-muted-foreground">
                  In your Joker round: correct +2. Wrong -1. No submitted answer -1.
                </div>

                {jokerError ? (
                  <div className="mt-2 rounded-lg border border-red-300 bg-red-600/10 px-3 py-2 text-sm text-red-600">
                    {jokerError}
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {finished ? (
        <GameCompletedSummary
          gameMode={gameMode}
          teamScoreMode={teamScoreMode}
          finalResults={state?.finalResults}
          highlightPlayerId={playerId}
          highlightTeamName={myTeamRow?.label ?? teamName}
        />
      ) : null}

      {!showLobby && !finished && stage === "round_summary" ? (
        <RoundSummaryCard
          round={currentRound}
          roundStats={state?.roundStats}
          gameMode={gameMode}
          isLastQuestionOverall={Boolean(state?.flow?.isLastQuestionOverall)}
          roundSummaryEndsAt={state?.times?.roundSummaryEndsAt ?? null}
          roundReview={state?.roundReview}
          isInfiniteMode={isInfiniteMode}
        />
      ) : null}

      {!showLobby && !finished && suppressStaleQuestionBetweenRounds ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Starting next round...
          </CardContent>
        </Card>
      ) : null}

      {!showLobby && !finished && stage !== "round_summary" && !suppressStaleQuestionBetweenRounds && q ? (
        <div className="grid gap-4">
          {showScoreTimerRow ? (
            <div className="grid grid-cols-2 gap-3">
              {myPlayer ? (
                <Card>
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0 text-xs text-muted-foreground">Your score</div>
                    <div className="shrink-0 text-base font-semibold tabular-nums sm:text-lg">
                      {myPlayer.score ?? 0}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div />
              )}

              {showTimerCard ? (
                <Card>
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0 text-xs text-muted-foreground">{timerLabel}</div>
                    <div className="text-right text-sm font-semibold leading-tight tabular-nums sm:text-base">
                      {timerValue}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div />
              )}
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Question</CardTitle>
                <div className="text-sm text-muted-foreground">
                  {q.roundType === "audio" ? "Audio" : q.roundType === "picture" ? "Picture" : "General"}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {isPictureQ && q.imageUrl ? (
                <div className="overflow-hidden rounded-xl border border-border bg-muted">
                  <img src={q.imageUrl} alt="" className="max-h-70 w-full object-contain" />
                </div>
              ) : null}

              {isQuickfireRound ? (
                <div className="rounded-xl border border-violet-500/30 bg-violet-600/10 px-3 py-3 text-sm">
                  <div className="font-medium text-foreground">Quickfire</div>
                  <div className="mt-1 text-muted-foreground">
                    Answer fast. There is no reveal after this question. The end-of-round review will show the answer,
                    who got it right, and who was fastest.
                  </div>
                </div>
              ) : null}

              <div className="text-base font-semibold leading-tight">{q.text}</div>

              {isAudioQ && shouldPlayOnPhone ? (
                <div className="rounded-xl border border-border bg-muted p-3">
                  {!audioEnabled ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-muted-foreground">Audio for this question</div>
                      <Button onClick={unlockAudio} variant="secondary" size="sm">
                        Enable audio
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">
                        Audio enabled{autoplayFailed ? ". Tap Play clip." : "."}
                      </div>
                      <Button
                        onClick={async () => {
                          setAutoplayFailed(false)
                          await playClip()
                        }}
                        variant="secondary"
                        size="sm"
                      >
                        Play clip
                      </Button>
                    </div>
                  )}
                </div>
              ) : isAudioQ && audioMode === "display" ? (
                <div className="rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground">
                  Audio plays on the TV display.
                </div>
              ) : null}

              {answerError ? (
                <div className="rounded-lg border border-red-300 bg-red-600/10 px-3 py-2 text-sm text-red-600">
                  {answerError}
                </div>
              ) : null}

              {isTextQ ? (
                <div className="grid gap-2">
                  <Input
                    value={typedValue}
                    onChange={(e) => setTypedValue(e.target.value)}
                    placeholder="Type your answer"
                    disabled={!canAnswer}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="secondary" onClick={() => setTypedValue("")} disabled={!canAnswer || !typedValue.trim()}>
                      Clear
                    </Button>
                    <Button onClick={submitTyped} disabled={!canAnswer || !typedValue.trim()}>
                      Submit
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2">
                  {Array.isArray(q.options)
                    ? q.options.map((opt: string, idx: number) => {
                        const selected = selectedIndex === idx
                        const submitted = submittedIndex !== null

                        let cls = "rounded-xl border px-3 py-3 text-left text-sm transition-colors"
                        cls += " border-border hover:bg-emerald-600/10"

                        if (selected && !submitted) cls += " bg-emerald-600/15 border-emerald-500/40"
                        if (submitted) cls += " opacity-80 cursor-not-allowed"
                        if (inReveal && correctIndex === idx) cls += " bg-emerald-600/10 border-emerald-600/30"
                        if (inReveal && submittedIndex === idx && correctIndex !== idx) cls += " bg-red-600/10 border-red-600/30"

                        return (
                          <button
                            key={idx}
                            className={cls}
                            onClick={() => pickOption(idx)}
                            disabled={!canAnswer || mcqSubmitting}
                          >
                            <div className="text-sm text-foreground">{opt}</div>
                          </button>
                        )
                      })
                    : null}

                  {mcqAutoSubmitted && submittedIndex !== null && !inReveal ? (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-200">
                      Time expired, so your selected answer was submitted automatically.
                    </div>
                  ) : null}

                  {!inReveal ? (
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSelectedIndex(null)
                          setAnswerError(null)
                        }}
                        disabled={!canAnswer || selectedIndex === null}
                      >
                        Clear
                      </Button>

                      <Button onClick={submitMcq} disabled={!canAnswer || selectedIndex === null}>
                        {mcqSubmitting ? "Submitting..." : "Submit"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}

              {inReveal && correctAnswerText ? (
                <div className="rounded-xl border border-emerald-600/30 bg-emerald-600/10 p-3">
                  <div className="text-sm font-medium text-emerald-200">Correct answer</div>
                  <div className="mt-1 text-sm text-foreground">{correctAnswerText}</div>
                </div>
              ) : null}

              {isTextQ && typedSubmitted && typedIsCorrect !== null && !inReveal ? (
                <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Your answer has been submitted.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </PageShell>
  )
}