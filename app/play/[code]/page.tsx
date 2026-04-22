"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"

import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import GameCompletedSummary from "@/components/GameCompletedSummary"
import RoundSummaryCard from "@/components/RoundSummaryCard"
import PageShell from "@/components/PageShell"
import { getGameProgressLabel, getRoundBehaviourBadgeClass, getRoundBehaviourLabel, getRunBadgeLabel, getStagePillClass, getStageStatusText, isInfiniteFinalStage, isInfiniteModeFromState } from "@/lib/gameMode"
import { deriveClientStageFromTimes, getAnswerWindowLabel, shouldSuppressQuestionBetweenRounds } from "@/lib/roundFlow"
import { getSpotlightRole } from "@/lib/spotlightGameplay"

type RoomState = any

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
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
  const [headsUpSubmittingAction, setHeadsUpSubmittingAction] = useState<null | "start" | "correct" | "pass">(null)
  const [headsUpFeedback, setHeadsUpFeedback] = useState<null | "correct" | "pass">(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const autoSubmitAttemptKeyRef = useRef<string | null>(null)
  const headsUpFeedbackTimeoutRef = useRef<number | null>(null)
  const feedbackAudioContextRef = useRef<AudioContext | null>(null)
  const lastHeadsUpCountdownSecondRef = useRef<number | null>(null)
  const lastHeadsUpCountdownStageRef = useRef<string | null>(null)

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
      setHeadsUpSubmittingAction(null)
      setHeadsUpFeedback(null)
      if (headsUpFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(headsUpFeedbackTimeoutRef.current)
        headsUpFeedbackTimeoutRef.current = null
      }

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
  const inReveal = String(state?.stage ?? "") === "reveal" && Boolean(state?.reveal)
  const revealDidAnswerCorrectly = useMemo(() => {
    if (!inReveal) return null as boolean | null
    if (isTextQ) return typedSubmitted ? typedIsCorrect : null
    if (submittedIndex === null || correctIndex === null) return null
    return submittedIndex === correctIndex
  }, [correctIndex, inReveal, isTextQ, submittedIndex, typedIsCorrect, typedSubmitted])
  const currentRound = state?.rounds?.current ?? null
  const isQuickfireRound = String(currentRound?.behaviourType ?? "").trim().toLowerCase() === "quickfire"
  const isHeadsUpRound = String(currentRound?.behaviourType ?? "").trim().toLowerCase() === "heads_up"
  const headsUp = state?.headsUp ?? null
  const headsUpShowLabel = useMemo(() => {
    const explicitLabel = String(q?.meta?.primaryShowDisplayName ?? "").trim()
    if (explicitLabel) return explicitLabel

    const showKey = String(q?.meta?.primaryShowKey ?? "").trim()
    if (!showKey) return ""

    return showKey
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  }, [q?.meta?.primaryShowDisplayName, q?.meta?.primaryShowKey])

  const canAnswer = useMemo(() => {
    if (state?.phase !== "running") return false
    if (!(state?.stage === "open" || state?.stage === "heads_up_live")) return false
    if (!q?.id) return false

    if (isHeadsUpRound || answerType === "none") return false
    if (answerType === "text") return !typedSubmitted
    return submittedIndex === null && !mcqSubmitting
  }, [state?.phase, state?.stage, q?.id, answerType, typedSubmitted, submittedIndex, mcqSubmitting, isHeadsUpRound])

  const players = useMemo(() => {
    return Array.isArray(state?.players) ? state.players : []
  }, [state])

  const myPlayer = useMemo(() => {
    if (!playerId) return null
    return players.find((p: any) => p.id === playerId) ?? null
  }, [players, playerId])

  const headsUpRole = useMemo(() => {
    if (!isHeadsUpRound) return "spectator" as const
    return getSpotlightRole({
      playerId,
      playerTeamName: String(myPlayer?.team_name ?? teamName ?? "").trim() || null,
      activeGuesserId: String(headsUp?.activeGuesserId ?? "").trim() || null,
      activeTeamName: String(headsUp?.activeTeamName ?? "").trim() || null,
      gameMode,
    })
  }, [gameMode, headsUp?.activeGuesserId, headsUp?.activeTeamName, isHeadsUpRound, myPlayer?.team_name, playerId, teamName])


  const headsUpReviewSignature = useMemo(
    () =>
      JSON.stringify(
        Array.isArray(state?.headsUp?.currentTurnActions)
          ? state.headsUp.currentTurnActions.map((item: any) => `${String(item.questionId ?? "")}:${String(item.action ?? "")}`)
          : []
      ),
    [state?.headsUp?.currentTurnActions]
  )

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

  const isUntimedAnswers = Boolean(state?.settings?.untimedAnswers)

  const actualCloseAtMs = state?.times?.closeAt ? Date.parse(String(state.times.closeAt)) : null
  const displayCloseAtRaw =
    state?.times?.displayCloseAt ?? state?.times?.visibleCloseAt ?? state?.times?.closeAt ?? null
  const displayCloseAtMs = displayCloseAtRaw ? Date.parse(String(displayCloseAtRaw)) : null
  const adjustedNowMs = liveNowMs + serverOffsetMs

  const headsUpTurnSeconds = Number(state?.headsUp?.turnSeconds ?? 0)
  const headsUpRoundCompleteReason = String(state?.headsUp?.roundCompleteReason ?? "").trim()
  const secondsRemaining =
    displayCloseAtMs && Number.isFinite(displayCloseAtMs)
      ? Math.max(0, Math.ceil((displayCloseAtMs - adjustedNowMs) / 1000))
      : String(state?.stage ?? "") === "heads_up_ready" && Number.isFinite(headsUpTurnSeconds) && headsUpTurnSeconds > 0
        ? headsUpTurnSeconds
        : 0
  const headsUpReviewAutoAdvanceAtMs = state?.headsUp?.reviewAutoAdvanceAt ? Date.parse(String(state.headsUp.reviewAutoAdvanceAt)) : Number.NaN
  const headsUpReviewCountdownSeconds = Number.isFinite(headsUpReviewAutoAdvanceAtMs)
    ? Math.max(0, Math.ceil((headsUpReviewAutoAdvanceAtMs - adjustedNowMs) / 1000))
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
        stage: deriveClientStageFromTimes(
          data?.serverNow ?? prev?.serverNow,
          {
            closeAt: data?.roomTimes?.closeAt ?? prev?.times?.closeAt,
            revealAt: data?.roomTimes?.revealAt ?? prev?.times?.revealAt,
            nextAt: data?.roomTimes?.nextAt ?? prev?.times?.nextAt,
          },
          data?.nextStage ?? "reveal"
        ),
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

  async function ensureHeadsUpAudioReady() {
    try {
      const anyWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext }
      const Ctx = anyWindow.AudioContext || anyWindow.webkitAudioContext
      if (!Ctx) return null

      const ctx = feedbackAudioContextRef.current ?? new Ctx()
      feedbackAudioContextRef.current = ctx
      await ctx.resume()
      return ctx
    } catch {
      return null
    }
  }

  async function playHeadsUpTimerCue(kind: "tick" | "end") {
    try {
      const ctx = await ensureHeadsUpAudioReady()
      if (!ctx) return

      const pulse = (frequency: number, start: number, duration: number, type: OscillatorType, volume: number) => {
        const oscillator = ctx.createOscillator()
        const gain = ctx.createGain()
        oscillator.type = type
        oscillator.frequency.setValueAtTime(frequency, start)
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
        oscillator.connect(gain)
        gain.connect(ctx.destination)
        oscillator.start(start)
        oscillator.stop(start + duration + 0.02)
      }

      const start = ctx.currentTime + 0.01
      if (kind === "tick") {
        pulse(1320, start, 0.07, "square", 0.045)
      } else {
        pulse(784, start, 0.09, "triangle", 0.06)
        pulse(622, start + 0.1, 0.12, "triangle", 0.055)
        pulse(440, start + 0.24, 0.24, "sawtooth", 0.07)
      }
    } catch {
      // ignore
    }
  }

  async function playHeadsUpCue(kind: "correct" | "pass") {

    try {
      const ctx = await ensureHeadsUpAudioReady()
      if (!ctx) return

      const pulse = (frequency: number, start: number, duration: number, type: OscillatorType, volume: number) => {
        const oscillator = ctx.createOscillator()
        const gain = ctx.createGain()
        oscillator.type = type
        oscillator.frequency.setValueAtTime(frequency, start)
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
        oscillator.connect(gain)
        gain.connect(ctx.destination)
        oscillator.start(start)
        oscillator.stop(start + duration + 0.02)
      }

      const start = ctx.currentTime + 0.01
      if (kind === "correct") {
        pulse(880, start, 0.12, "sine", 0.14)
        pulse(1174, start + 0.12, 0.16, "triangle", 0.12)
      } else {
        pulse(392, start, 0.1, "triangle", 0.12)
        pulse(294, start + 0.08, 0.18, "sawtooth", 0.08)
      }
    } catch {
      // ignore
    }
  }

  function showHeadsUpFeedback(kind: "correct" | "pass") {
    if (headsUpFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(headsUpFeedbackTimeoutRef.current)
    }
    setHeadsUpFeedback(kind)
    void playHeadsUpCue(kind)
    headsUpFeedbackTimeoutRef.current = window.setTimeout(() => {
      setHeadsUpFeedback(null)
      headsUpFeedbackTimeoutRef.current = null
    }, 650)
  }

  async function submitHeadsUpAction(action: "guesser_start_turn" | "guesser_correct" | "guesser_pass") {
    if (!playerId || !isHeadsUpRound) return
    const pendingAction =
      action === "guesser_start_turn" ? "start" : action === "guesser_correct" ? "correct" : "pass"

    setHeadsUpSubmittingAction(pendingAction)
    setAnswerError(null)
    try {
      const res = await fetch("/api/room/spotlight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, playerId, action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAnswerError(String(data?.error ?? "Could not update Spotlight."))
        return
      }
      if (pendingAction === "correct" || pendingAction === "pass") {
        showHeadsUpFeedback(pendingAction)
      }
      await refreshState()
    } catch {
      setAnswerError("Could not update Spotlight.")
    } finally {
      setHeadsUpSubmittingAction(null)
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
      await ensureHeadsUpAudioReady()
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
      (state?.stage === "open" || state?.stage === "heads_up_live") &&
      shouldPlayOnPhone &&
      audioEnabled &&
      isAudioQ &&
      Boolean(q?.audioUrl)

    if (!shouldKeepPlaying) {
      stopClip()
    }
  }, [state?.phase, state?.stage, q?.id, q?.audioUrl, shouldPlayOnPhone, audioEnabled, isAudioQ])

  useEffect(() => {
    const resumeAudio = () => {
      void ensureHeadsUpAudioReady()
    }
    window.addEventListener("pointerdown", resumeAudio)
    window.addEventListener("keydown", resumeAudio)
    return () => {
      window.removeEventListener("pointerdown", resumeAudio)
      window.removeEventListener("keydown", resumeAudio)
    }
  }, [])

  useEffect(() => {
    const currentStage = String(state?.stage ?? "")
    const isHeadsUpBehaviour = String(state?.rounds?.current?.behaviourType ?? "").trim().toLowerCase() === "heads_up"
    const currentRole = isHeadsUpBehaviour
      ? getSpotlightRole({
          playerId,
          playerTeamName: String(myPlayer?.team_name ?? teamName ?? "").trim() || null,
          activeGuesserId: String(state?.headsUp?.activeGuesserId ?? "").trim() || null,
          activeTeamName: String(state?.headsUp?.activeTeamName ?? "").trim() || null,
          gameMode,
        })
      : "spectator"

    const shouldPlayCountdownCue =
      isHeadsUpBehaviour &&
      currentStage === "heads_up_live" &&
      (currentRole === "guesser" || currentRole === "clue_giver")

    if (!shouldPlayCountdownCue) {
      lastHeadsUpCountdownSecondRef.current = null
      lastHeadsUpCountdownStageRef.current = currentStage
      return
    }

    const closeAtMs = state?.times?.closeAt ? Date.parse(String(state.times.closeAt)) : Number.NaN
    const currentSecondsRemaining = Number.isFinite(closeAtMs)
      ? Math.max(0, Math.ceil((closeAtMs - Date.now()) / 1000))
      : 0

    if (!Number.isFinite(currentSecondsRemaining)) return

    const currentSecond = Math.max(0, Math.floor(currentSecondsRemaining))
    const previousSecond = lastHeadsUpCountdownSecondRef.current
    const previousStage = lastHeadsUpCountdownStageRef.current
    lastHeadsUpCountdownSecondRef.current = currentSecond
    lastHeadsUpCountdownStageRef.current = currentStage

    if (previousStage !== "heads_up_live") return
    if (previousSecond === currentSecond) return

    if (currentSecond > 0 && currentSecond <= 5) {
      void playHeadsUpTimerCue("tick")
      return
    }

    if (currentSecond === 0 && previousSecond !== 0) {
      void playHeadsUpTimerCue("end")
    }
  }, [gameMode, myPlayer?.team_name, playerId, state, teamName])

  useEffect(() => {
    return () => {
      stopClip()
      if (headsUpFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(headsUpFeedbackTimeoutRef.current)
      }
      try {
        feedbackAudioContextRef.current?.close()
      } catch {
        // ignore
      }
      feedbackAudioContextRef.current = null
    }
  }, [])


  useEffect(() => {
    const isReviewStage = String(state?.stage ?? "") === "heads_up_review"
    const isHeadsUpBehaviour = String(state?.rounds?.current?.behaviourType ?? "").trim().toLowerCase() === "heads_up"
    if (!code || !state || !isHeadsUpBehaviour || !isReviewStage) return

    const reviewAtMs = state?.headsUp?.reviewAutoAdvanceAt ? Date.parse(String(state.headsUp.reviewAutoAdvanceAt)) : Number.NaN
    const delayMs = Number.isFinite(reviewAtMs) ? Math.max(0, reviewAtMs - adjustedNowMs) : 4500

    const timeoutId = window.setTimeout(() => {
      fetch("/api/room/spotlight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, action: "host_confirm_turn" }),
      })
        .then(() => refreshState())
        .catch(() => {})
    }, delayMs)

    return () => window.clearTimeout(timeoutId)
  }, [adjustedNowMs, code, headsUpReviewSignature, refreshState, state?.headsUp?.currentTurnIndex, state?.headsUp?.reviewAutoAdvanceAt, state?.stage, state?.rounds?.current?.behaviourType])

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
  const isHeadsUpReadyStage = stage === "heads_up_ready"
  const isHeadsUpLiveStage = stage === "heads_up_live"
  const isHeadsUpReviewStage = stage === "heads_up_review"
  const isLiveAnswerStage = stage === "open" || isHeadsUpLiveStage
  const showInfiniteFinalStage = isInfiniteFinalStage(stage, {
    isInfiniteMode,
    isLastQuestionOverall: Boolean(state?.flow?.isLastQuestionOverall),
  })
  const status = getStageStatusText(stage, showInfiniteFinalStage)

  const questionNumber = Number(state.questionIndex ?? 0) + 1
  const questionCount = Number(state.questionCount ?? 0)
  const progressLabel = String(state?.progress?.label ?? "").trim() ||
    getGameProgressLabel({
      isInfiniteMode,
      currentQuestionNumber: questionNumber,
      totalQuestions: questionCount,
      phase: state?.phase,
    })

  const showLobby = state.phase === "lobby"
  const finished = state.phase === "finished"

  const suppressStaleQuestionBetweenRounds = shouldSuppressQuestionBetweenRounds({
    phase: state?.phase,
    stage,
    questionIndex: state?.questionIndex,
    roundTransitionQuestionIndex,
  })

  const showScoreTimerRow =
    !showLobby &&
    !finished &&
    stage !== "round_summary" &&
    (Boolean(myPlayer) || Boolean(q))

  const showTimerCard = !showLobby && !finished && stage !== "round_summary" && Boolean(q)

  let timerLabel = getAnswerWindowLabel({
    isUntimedAnswers,
    isQuickfire: isQuickfireRound,
    isHeadsUp: isHeadsUpRound,
  })
  let timerValue = isUntimedAnswers ? "No timer" : formatDuration(secondsRemaining)

  if (!isLiveAnswerStage) {
    timerValue = isUntimedAnswers ? "Closed" : formatDuration(secondsRemaining)
  }

  const correctAnswerText =
    answerType === "mcq"
      ? correctIndex !== null && Array.isArray(q?.options)
        ? String(q.options[correctIndex] ?? "")
        : revealAnswerText
      : answerType === "none"
        ? String(q?.text ?? "")
        : revealAnswerText

  return (
    <PageShell width="narrow">
      <audio ref={audioRef} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {status ? (
            <span className={`rounded-full border px-3 py-1 text-xs ${getStagePillClass(stage)}`}>{status}</span>
          ) : null}

          {state.phase === "running" && currentRound ? (
            <span className={`rounded-full border px-3 py-1 text-xs ${isInfiniteMode ? "border-sky-500/40 bg-sky-600/10 text-sky-200" : "border-border bg-card text-muted-foreground"}`}>
              {getRunBadgeLabel({ isInfiniteMode, currentRound })}
            </span>
          ) : null}

          {state.phase === "running" && !isInfiniteMode && currentRound ? (
            <span className={`rounded-full border px-3 py-1 text-xs ${getRoundBehaviourBadgeClass(currentRound.behaviourType)}`}>
              {getRoundBehaviourLabel(currentRound.behaviourType)}
            </span>
          ) : null}

          {state.phase === "running" ? (
            <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              {progressLabel || `Q${questionNumber} of ${questionCount}`}
            </span>
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
          isInfiniteMode={isInfiniteMode}
          finalQuestionReview={state?.finalQuestionReview}
        />
      ) : null}

      {!showLobby && !finished && stage === "round_summary" ? (
        <div className="grid gap-4">
          {isHeadsUpRound ? (
            <Card>
              <CardContent className="py-4">
                <div className="rounded-xl border border-amber-500/30 bg-amber-600/10 px-4 py-3 text-sm">
                  <div className="font-medium text-foreground">
                    {headsUpRoundCompleteReason === "card_pool_exhausted" ? "This Spotlight round has run out of cards." : "This Spotlight round is complete."}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {headsUpRoundCompleteReason === "card_pool_exhausted"
                      ? "Wait for the host to continue to the next round. Future Spotlight rounds need a larger card pool if you want more players to take a turn."
                      : "Wait for the host to continue when they are ready."}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
          <RoundSummaryCard
            round={currentRound}
            roundStats={state?.roundStats}
            gameMode={gameMode}
            isLastQuestionOverall={Boolean(state?.flow?.isLastQuestionOverall)}
            roundSummaryEndsAt={state?.times?.roundSummaryEndsAt ?? null}
            roundReview={state?.roundReview}
            isInfiniteMode={isInfiniteMode}
          />
        </div>
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
                <CardTitle>{isHeadsUpRound ? "Card" : "Question"}</CardTitle>
                <div className="text-sm text-muted-foreground">
                  {q.roundType === "audio" ? "Audio" : q.roundType === "picture" ? "Picture" : q.roundType === "heads_up" ? "Spotlight" : "General"}
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

              {isHeadsUpRound ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-600/10 px-3 py-3 text-sm">
                  <div className="font-medium text-foreground">Spotlight</div>
                  <div className="mt-1 text-muted-foreground">
                    {headsUpRole === "guesser"
                      ? isHeadsUpReadyStage
                        ? "You are the next guesser. Start the turn from this phone when you are ready."
                        : "You are the guesser. Use Correct and Pass while your team or the rest of the room gives clues."
                      : headsUpRole === "clue_giver"
                        ? isHeadsUpLiveStage
                          ? "You can see the live clue. Do not say the answer itself, only give clues."
                          : "Wait for the guesser to start the turn. The clue will appear here when the timer begins."
                        : "Wait for the active team or player to finish their turn."}
                  </div>
                </div>
              ) : null}

              {isHeadsUpRound ? (
                headsUpRole === "clue_giver" && isHeadsUpLiveStage ? (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-600/10 px-4 py-6 text-center">
                    <div className="flex items-start justify-between gap-3 text-left">
                      <div className="text-xs uppercase tracking-[0.2em] text-amber-200">Live clue</div>
                      {headsUpShowLabel ? (
                        <div className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium leading-none text-amber-100">
                          {headsUpShowLabel}
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-3 whitespace-pre-line text-2xl font-semibold leading-tight text-foreground sm:text-3xl">{q.text}</div>
                  </div>
                ) : headsUpRole === "guesser" ? (
                  <div className="rounded-2xl border border-border bg-muted px-4 py-5 text-center">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Guess without seeing the card</div>
                    <div className="mt-2 text-lg font-semibold text-foreground">{isHeadsUpReadyStage ? "Start the turn when you are ready, then listen to the clues." : headsUpFeedback === "correct" ? "Correct recorded. Move on to the next clue." : headsUpFeedback === "pass" ? "Pass recorded. Skip and keep moving." : "Listen to the clues and tap the result."}</div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-muted px-4 py-5 text-center">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Waiting</div>
                    <div className="mt-2 text-lg font-semibold text-foreground">{isHeadsUpReadyStage ? `${String(headsUp?.activeGuesserName ?? "Another player")} will start the turn from their phone.` : `This turn belongs to ${String(headsUp?.activeGuesserName ?? "another player")}.`}
                    </div>
                  </div>
                )
              ) : (
                <div className="whitespace-pre-line text-base font-semibold leading-tight">{q.text}</div>
              )}

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

              {isHeadsUpRound ? (
                headsUpRole === "guesser" ? (
                  <div className="grid gap-3">
                    {isHeadsUpReadyStage ? (
                      <Button
                        onClick={() => submitHeadsUpAction("guesser_start_turn")}
                        disabled={headsUpSubmittingAction !== null}
                        className="min-h-20 text-lg"
                      >
                        {headsUpSubmittingAction === "start" ? "Starting..." : "Start turn"}
                      </Button>
                    ) : (
                      <div className="grid gap-3">
                        {headsUpFeedback ? (
                          <div className={`rounded-2xl border px-4 py-3 text-center text-sm font-semibold shadow-sm transition-all ${headsUpFeedback === "correct" ? "border-emerald-500/40 bg-emerald-600/10 text-emerald-200" : "border-amber-500/40 bg-amber-600/10 text-amber-200"}`}>
                            {headsUpFeedback === "correct" ? "Correct recorded" : "Pass recorded"}
                          </div>
                        ) : null}
                        <div className="grid grid-cols-2 gap-3">
                          <Button
                            variant="secondary"
                            onClick={() => submitHeadsUpAction("guesser_pass")}
                            disabled={!isHeadsUpLiveStage || headsUpSubmittingAction !== null}
                            className={`min-h-20 text-lg ${headsUpSubmittingAction === "pass" ? "scale-[0.98] border-amber-500/40 bg-amber-600/10 text-amber-100" : ""}`}
                          >
                            {headsUpSubmittingAction === "pass" ? "Passing..." : "Pass"}
                          </Button>
                          <Button
                            onClick={() => submitHeadsUpAction("guesser_correct")}
                            disabled={!isHeadsUpLiveStage || headsUpSubmittingAction !== null}
                            className={`min-h-20 text-lg ${headsUpSubmittingAction === "correct" ? "scale-[0.98] border-emerald-500/50 bg-emerald-500 text-background" : ""}`}
                          >
                            {headsUpSubmittingAction === "correct" ? "Correct..." : "Correct"}
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="rounded-xl border border-border bg-card px-3 py-3 text-sm text-muted-foreground">
                      {isHeadsUpReadyStage
                        ? "Start the timer from this phone when you are ready to begin guessing."
                        : isHeadsUpReviewStage
                          ? "The turn is ending. The next player will be prepared automatically after the countdown below unless the host corrects something."
                          : headsUpSubmittingAction === "correct"
                            ? "Saving that correct answer now."
                            : headsUpSubmittingAction === "pass"
                              ? "Skipping that clue now."
                              : "Keep facing away from the clue and use the buttons as each guess lands."}
                    </div>
                  </div>
                ) : headsUpRole === "clue_giver" ? (
                  <div className="rounded-xl border border-border bg-card px-3 py-3 text-sm text-muted-foreground">
                    {isHeadsUpReadyStage
                      ? `Waiting for ${String(headsUp?.activeGuesserName ?? "the guesser")} to start the turn.`
                      : isHeadsUpReviewStage
                        ? "The turn has ended. Watch the countdown below for the next player unless the host makes a correction."
                        : "Give clues without saying any part of the answer on the card."}
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-card px-3 py-3 text-sm text-muted-foreground">
                    {isHeadsUpReadyStage
                      ? `Waiting for ${String(headsUp?.activeGuesserName ?? "the active player")} to start the turn.`
                      : isHeadsUpReviewStage
                        ? "The turn has ended. Watch the countdown below for the next player unless the host makes a correction."
                        : "Waiting for the active player to finish. You will get a live clue view when it is your turn to help."}
                  </div>
                )
              ) : null}

              {isHeadsUpRound && isHeadsUpReviewStage ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-600/10 px-4 py-3 text-sm">
                  <div className="font-medium text-foreground">
                    {headsUp?.willAdvanceToNextTurn
                      ? `Next player: ${String(headsUp?.nextGuesserName ?? "The next player")}${headsUp?.nextTeamName ? ` · Team ${String(headsUp.nextTeamName)}` : ""}`
                      : "Ending Spotlight round"}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {headsUp?.willAdvanceToNextTurn
                      ? `Moving on in ${headsUpReviewCountdownSeconds}s unless the host corrects the turn or skips ahead.`
                      : `Finishing the round in ${headsUpReviewCountdownSeconds}s unless the host skips ahead.`}
                  </div>
                </div>
              ) : null}

              {!isHeadsUpRound ? (
                isTextQ ? (
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

                          const showCorrectIcon = inReveal && correctIndex === idx
                          const showWrongIcon = inReveal && submittedIndex === idx && correctIndex !== idx

                          return (
                            <button
                              key={idx}
                              className={cls}
                              onClick={() => pickOption(idx)}
                              disabled={!canAnswer || mcqSubmitting}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm text-foreground">{opt}</div>
                                {showCorrectIcon ? (
                                  <span aria-label="Correct" className="shrink-0 text-base text-emerald-300">✓</span>
                                ) : showWrongIcon ? (
                                  <span aria-label="Incorrect" className="shrink-0 text-base text-red-300">✕</span>
                                ) : null}
                              </div>
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
                )
              ) : null}

              {inReveal && revealDidAnswerCorrectly !== null ? (
                <div className={`rounded-xl border p-3 ${revealDidAnswerCorrectly ? "border-emerald-600/30 bg-emerald-600/10" : "border-red-600/30 bg-red-600/10"}`}>
                  <div className={`flex items-center gap-2 text-sm font-medium ${revealDidAnswerCorrectly ? "text-emerald-200" : "text-red-200"}`}>
                    <span aria-hidden="true" className="text-base">{revealDidAnswerCorrectly ? "✓" : "✕"}</span>
                    <span>{revealDidAnswerCorrectly ? "Your answer was correct" : "Your answer was incorrect"}</span>
                  </div>
                </div>
              ) : null}

              {inReveal && correctAnswerText ? (
                <div className="rounded-xl border border-emerald-600/30 bg-emerald-600/10 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-200">
                    <span aria-hidden="true" className="text-base">✓</span>
                    <span>Correct answer</span>
                  </div>
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