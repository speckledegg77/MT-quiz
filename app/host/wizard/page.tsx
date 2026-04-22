"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import HostJoinedTeamsPanel from "@/components/HostJoinedTeamsPanel"
import PageShell from "@/components/PageShell"
import QRTile from "@/components/ui/QRTile"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { supabase } from "@/lib/supabaseClient"
import { randomTeamName } from "@/lib/teamNameSuggestions"
import { type RoundTemplateRow } from "@/lib/roundTemplates"
import {
  buildSimpleTemplatePlan,
  serialiseTemplateAsRound,
  type FeasibilitySetResult,
  type SimplePresetId,
} from "@/lib/simpleHostSetup"

const LAST_HOST_CODE_KEY = "mtq_last_host_code"

type PackRow = {
  id: string
  display_name: string
  round_type: string
  sort_order: number | null
  is_active: boolean | null
}

type FeasibilityResponse = {
  ok?: boolean
  candidateCount?: number
  templates?: FeasibilitySetResult | null
  error?: string
}

type GameMode = "teams" | "solo"
type PlaySurface = "tv_and_phones" | "phones_only"
type AudioMode = "display" | "phones" | "both"

type SetupLength = {
  id: string
  roundCount: number
  title: string
  description: string
}

const QUIZ_FEELS: Array<{
  value: SimplePresetId
  title: string
  description: string
}> = [
  {
    value: "classic",
    title: "Classic quiz",
    description: "Keeps the game closer to a standard quiz flow when the ready template pool allows it.",
  },
  {
    value: "balanced",
    title: "Balanced mix",
    description: "Mostly standard rounds, with a little Quickfire where the ready template pool supports it.",
  },
  {
    value: "quickfire_mix",
    title: "Fast mix",
    description: "Brings in more Quickfire while still trying to keep at least one standard round.",
  },
]

const SETUP_LENGTHS: SetupLength[] = [
  {
    id: "quick",
    roundCount: 3,
    title: "Quick game",
    description: "A shorter session that is good for first tests and casual hosting.",
  },
  {
    id: "standard",
    roundCount: 4,
    title: "Standard game",
    description: "A sensible default for most quiz nights.",
  },
  {
    id: "longer",
    roundCount: 5,
    title: "Longer game",
    description: "Adds an extra round for groups who want a fuller session.",
  },
]

const TV_AND_PHONE_SCREEN_EXPLANATIONS = [
  {
    title: "Host screen",
    body: "Keep this on your device. You create the room here and control the game from here.",
  },
  {
    title: "TV display",
    body: "Open this on the room screen so everyone can see the questions, timers, and scores.",
  },
  {
    title: "Player phones",
    body: "Players join with the room code or QR link on their own phones and answer there.",
  },
]

const PHONE_ONLY_SCREEN_EXPLANATIONS = [
  {
    title: "Host screen",
    body: "Keep this on your device. You create the room here and control the game from here.",
  },
  {
    title: "Player phones",
    body: "Players join with the room code or QR link on their own phones, answer there, and follow the game from there too.",
  },
]

const WIZARD_STEPS = [
  "Quiz style",
  "Solo or teams",
  "Recommended setup",
  "Create room",
  "Open and start",
]

function cleanRoomCode(input: string) {
  return String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12)
}

function rememberHostCode(code: string) {
  try {
    localStorage.setItem(LAST_HOST_CODE_KEY, code)
  } catch {
    // ignore
  }
}

function playSurfaceLabel(surface: PlaySurface) {
  if (surface === "phones_only") return "Player phones only"
  return "TV and player phones"
}

function audioModeLabel(mode: AudioMode) {
  if (mode === "phones") return "Player phones"
  if (mode === "both") return "TV and player phones"
  return "TV display"
}

function buildInitialTeams() {
  const used = new Set<string>()
  const first = randomTeamName(used)
  used.add(first)
  const second = randomTeamName(used)
  return [first, second]
}

function openInNewWindow(url: string) {
  if (!url) return
  const win = window.open(url, "_blank", "noopener,noreferrer")
  if (win) win.opener = null
}

function getNextStep(currentStep: number) {
  return Math.min(4, currentStep + 1)
}

function getPreviousStep(currentStep: number) {
  return Math.max(1, currentStep - 1)
}

function createTeamValidationMessage(gameMode: GameMode, teamNames: string[]) {
  if (gameMode !== "teams") return null

  const cleaned = teamNames.map((name) => name.trim()).filter(Boolean)
  if (cleaned.length < 2) return "Add at least two team names."

  const seen = new Set<string>()
  for (const name of cleaned) {
    const key = name.toLowerCase()
    if (seen.has(key)) return "Team names must be unique."
    seen.add(key)
  }

  return null
}

export default function HostWizardPage() {
  const router = useRouter()

  const [currentStep, setCurrentStep] = useState(1)
  const [packs, setPacks] = useState<PackRow[]>([])
  const [templates, setTemplates] = useState<RoundTemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [quizFeel, setQuizFeel] = useState<SimplePresetId>("classic")
  const [gameMode, setGameMode] = useState<GameMode>("teams")
  const [playSurface, setPlaySurface] = useState<PlaySurface>("tv_and_phones")
  const [teamNames, setTeamNames] = useState<string[]>(() => buildInitialTeams())
  const [lengthId, setLengthId] = useState<string>("standard")
  const [audioMode, setAudioMode] = useState<AudioMode>("display")

  const [feasibilityBusy, setFeasibilityBusy] = useState(false)
  const [feasibilityError, setFeasibilityError] = useState<string | null>(null)
  const [templateFeasibility, setTemplateFeasibility] = useState<FeasibilitySetResult | null>(null)
  const [candidateCount, setCandidateCount] = useState(0)

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [joinedPlayerCount, setJoinedPlayerCount] = useState(0)

  const [startBusy, setStartBusy] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const joinUrl = roomCode ? `${origin}/join?code=${roomCode}` : ""
  const displayUrl = roomCode ? `${origin}/display/${roomCode}` : ""
  const directHostUrl = roomCode ? `/host/direct?code=${roomCode}` : "/host/direct"

  const roundCount = useMemo(() => {
    return SETUP_LENGTHS.find((option) => option.id === lengthId)?.roundCount ?? 4
  }, [lengthId])

  const selectedPackIds = useMemo(() => packs.map((pack) => pack.id), [packs])

  const screenExplanations = useMemo(() => {
    return playSurface === "phones_only" ? PHONE_ONLY_SCREEN_EXPLANATIONS : TV_AND_PHONE_SCREEN_EXPLANATIONS
  }, [playSurface])

  const templateRounds = useMemo(() => {
    return templates.map((template, index) => serialiseTemplateAsRound(template, index))
  }, [templates])

  const feasibilityById = useMemo(() => {
    return new Map((templateFeasibility?.rounds ?? []).map((round) => [round.id, round]))
  }, [templateFeasibility])

  const templatePlan = useMemo(() => {
    return buildSimpleTemplatePlan({
      templates,
      feasibilityById,
      roundCount,
      preset: quizFeel,
    })
  }, [feasibilityById, quizFeel, roundCount, templates])

  const teamValidationMessage = useMemo(() => createTeamValidationMessage(gameMode, teamNames), [gameMode, teamNames])

  const createBlockReason = useMemo(() => {
    if (loading) return "Still loading the question library and ready templates."
    if (loadError) return loadError
    if (feasibilityBusy) return "Still checking which ready templates fit the current question pool."
    if (feasibilityError) return feasibilityError
    if (teamValidationMessage) return teamValidationMessage
    return templatePlan.error
  }, [feasibilityBusy, feasibilityError, loadError, loading, teamValidationMessage, templatePlan.error])

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)
      setLoadError(null)

      const [packsRes, templatesRes] = await Promise.all([
        supabase
          .from("packs")
          .select("id, display_name, round_type, sort_order, is_active")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        fetch("/api/round-templates", { cache: "no-store" })
          .then(async (res) => {
            const json = (await res.json().catch(() => ({}))) as { templates?: RoundTemplateRow[]; error?: string }
            if (!res.ok) throw new Error(json.error ?? "Could not load round templates.")
            return json.templates ?? []
          }),
      ])

      if (cancelled) return

      if (packsRes.error) {
        setLoadError(packsRes.error.message)
        setLoading(false)
        return
      }

      setPacks((packsRes.data ?? []) as PackRow[])
      setTemplates(templatesRes)
      setLoading(false)
    }

    loadData().catch((error: unknown) => {
      if (cancelled) return
      setLoadError(error instanceof Error ? error.message : "Could not load wizard data.")
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (loading) return
    if (!templates.length) {
      setTemplateFeasibility(null)
      setCandidateCount(0)
      setFeasibilityBusy(false)
      return
    }

    let cancelled = false
    setFeasibilityBusy(true)
    setFeasibilityError(null)

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/room/feasibility", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedPackIds,
            manualRounds: [],
            templateRounds,
          }),
        })

        const json = (await response.json().catch(() => ({}))) as FeasibilityResponse
        if (cancelled) return

        if (!response.ok) {
          setFeasibilityError(json.error ?? "Could not check the current question pool.")
          setTemplateFeasibility(null)
          setCandidateCount(0)
          setFeasibilityBusy(false)
          return
        }

        setTemplateFeasibility(json.templates ?? null)
        setCandidateCount(Math.max(0, Number(json.candidateCount ?? 0) || 0))
        setFeasibilityBusy(false)
      } catch (error: unknown) {
        if (cancelled) return
        setFeasibilityError(error instanceof Error ? error.message : "Could not check the current question pool.")
        setTemplateFeasibility(null)
        setCandidateCount(0)
        setFeasibilityBusy(false)
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [loading, selectedPackIds, templateRounds, templates.length])

  useEffect(() => {
    if (playSurface === "phones_only" && audioMode !== "phones") {
      setAudioMode("phones")
    }
  }, [audioMode, playSurface])

  useEffect(() => {
    if (!roomCode) {
      setJoinedPlayerCount(0)
      return
    }

    let cancelled = false

    async function tick() {
      try {
        const response = await fetch(`/api/room/state?code=${roomCode}`, { cache: "no-store" })
        const json = await response.json().catch(() => ({}))
        if (cancelled) return
        const players = Array.isArray(json?.players) ? json.players : []
        setJoinedPlayerCount(players.length)
      } catch {
        if (cancelled) return
        setJoinedPlayerCount(0)
      }
    }

    tick()
    const id = window.setInterval(tick, 1000)

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [roomCode])

  function addTeam() {
    setTeamNames((current) => {
      const used = new Set(current.map((name) => name.trim()).filter(Boolean))
      return [...current, randomTeamName(used)]
    })
  }

  async function copyJoinLink() {
    if (!joinUrl) return
    try {
      await navigator.clipboard.writeText(joinUrl)
    } catch {
      // ignore
    }
  }

  async function createRoom() {
    setCreating(true)
    setCreateError(null)

    try {
      if (createBlockReason) {
        setCreateError(createBlockReason)
        setCreating(false)
        return
      }

      const cleanTeamNames = teamNames.map((name) => name.trim()).filter(Boolean)

      const response = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildMode: "manual_rounds",
          gameMode,
          teamNames: gameMode === "teams" ? cleanTeamNames : [],
          countdownSeconds: 10,
          answerSeconds: 20,
          audioMode,
          selectedPacks: selectedPackIds,
          manualRounds: templatePlan.rounds,
        }),
      })

      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        setCreateError(String(json?.error ?? "Failed to create room."))
        setCreating(false)
        return
      }

      const code = cleanRoomCode(String(json?.code ?? ""))
      if (!code) {
        setCreateError("Room created, but no code was returned.")
        setCreating(false)
        return
      }

      rememberHostCode(code)
      setRoomCode(code)
      setCurrentStep(5)
    } catch (error: unknown) {
      setCreateError(error instanceof Error ? error.message : "Failed to create room.")
    } finally {
      setCreating(false)
    }
  }

  async function startGame() {
    if (!roomCode) return

    if (joinedPlayerCount <= 0) {
      setStartError("At least one player must join before you can start the game.")
      return
    }

    if (typeof window !== "undefined" && !window.confirm("Have all your players joined?")) {
      return
    }

    setStartBusy(true)
    setStartError(null)

    try {
      const response = await fetch("/api/room/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode }),
      })

      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        setStartError(String(json?.error ?? "Could not start the game."))
        setStartBusy(false)
        return
      }

      rememberHostCode(roomCode)
      router.push(`/host/direct?code=${roomCode}`)
      router.refresh()
    } catch (error: unknown) {
      setStartError(error instanceof Error ? error.message : "Could not start the game.")
      setStartBusy(false)
    }
  }

  function renderStepPill(stepNumber: number, label: string) {
    const isActive = currentStep === stepNumber
    const isComplete = currentStep > stepNumber || (roomCode && stepNumber < 5)

    return (
      <div
        key={label}
        className={`rounded-2xl border px-3 py-3 text-sm ${
          isActive
            ? "border-foreground bg-muted"
            : isComplete
              ? "border-border bg-card"
              : "border-border bg-card/60"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${isActive ? "border-foreground text-foreground" : "border-border text-muted-foreground"}`}>
            {isComplete ? "✓" : stepNumber}
          </span>
          <span className={isActive ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
        </div>
      </div>
    )
  }

  return (
    <PageShell width="wide">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Easy setup wizard</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Set up a game without getting lost</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              This path is for first-time and casual hosts. It builds a normal room on top of the current round-plan model, then hands you over to the existing host controls when you are ready.
            </p>
          </div>
          <Link href="/host/direct" className="text-sm font-medium text-foreground underline">
            Skip to existing host setup
          </Link>
        </div>

        <div className="grid gap-3 lg:grid-cols-5">
          {WIZARD_STEPS.map((label, index) => renderStepPill(index + 1, label))}
        </div>

        <div className={`grid gap-4 ${playSurface === "phones_only" ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
          {screenExplanations.map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{item.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {!roomCode ? (
          <Card>
            <CardHeader>
              <CardTitle>
                {currentStep === 1
                  ? "1. Choose your quiz style"
                  : currentStep === 2
                    ? "2. Choose solo or teams"
                    : currentStep === 3
                      ? "3. Choose a recommended setup"
                      : "4. Review and create the room"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {currentStep === 1 ? (
                <div className="grid gap-3 lg:grid-cols-3">
                  {QUIZ_FEELS.map((option) => {
                    const selected = quizFeel === option.value
                    return (
                      <label
                        key={option.value}
                        className={`rounded-2xl border p-4 text-sm transition-colors ${selected ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted"}`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="quiz-feel"
                            checked={selected}
                            onChange={() => setQuizFeel(option.value)}
                            className="mt-0.5"
                          />
                          <div>
                            <div className="font-medium text-foreground">{option.title}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{option.description}</div>
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              ) : null}

              {currentStep === 2 ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={`rounded-2xl border p-4 text-sm transition-colors ${gameMode === "teams" ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted"}`}>
                      <div className="flex items-start gap-3">
                        <input type="radio" name="game-mode" checked={gameMode === "teams"} onChange={() => setGameMode("teams")} className="mt-0.5" />
                        <div>
                          <div className="font-medium text-foreground">Teams</div>
                          <div className="mt-1 text-xs text-muted-foreground">Players join a team. This is the best fit for most quiz nights.</div>
                        </div>
                      </div>
                    </label>

                    <label className={`rounded-2xl border p-4 text-sm transition-colors ${gameMode === "solo" ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted"}`}>
                      <div className="flex items-start gap-3">
                        <input type="radio" name="game-mode" checked={gameMode === "solo"} onChange={() => setGameMode("solo")} className="mt-0.5" />
                        <div>
                          <div className="font-medium text-foreground">Solo</div>
                          <div className="mt-1 text-xs text-muted-foreground">Each player scores for themselves. Good for quick tests and smaller groups.</div>
                        </div>
                      </div>
                    </label>
                  </div>

                  {gameMode === "teams" ? (
                    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-foreground">Team names</div>
                          <div className="mt-1 text-xs text-muted-foreground">Players will choose one of these when they join.</div>
                        </div>
                        <Button variant="secondary" size="sm" onClick={addTeam}>
                          Add team
                        </Button>
                      </div>

                      <div className="space-y-2">
                        {teamNames.map((teamName, index) => (
                          <div key={`${index}-${teamName}`} className="flex items-center gap-2">
                            <Input
                              value={teamName}
                              onChange={(event) => {
                                const value = event.target.value
                                setTeamNames((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)))
                              }}
                              placeholder="Team name"
                            />
                            <Button
                              variant="ghost"
                              onClick={() => setTeamNames((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                              disabled={teamNames.length <= 2}
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>

                      {teamValidationMessage ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                          {teamValidationMessage}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {currentStep === 3 ? (
                <div className="space-y-5">
                  <div className="grid gap-3 lg:grid-cols-3">
                    {SETUP_LENGTHS.map((option) => {
                      const selected = lengthId === option.id
                      return (
                        <label
                          key={option.id}
                          className={`rounded-2xl border p-4 text-sm transition-colors ${selected ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted"}`}
                        >
                          <div className="flex items-start gap-3">
                            <input type="radio" name="setup-length" checked={selected} onChange={() => setLengthId(option.id)} className="mt-0.5" />
                            <div>
                              <div className="font-medium text-foreground">{option.title}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{option.description}</div>
                              <div className="mt-2 text-xs font-medium text-foreground">{option.roundCount} rounds</div>
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm font-medium text-foreground">How will people follow the game?</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={`rounded-2xl border p-4 text-sm transition-colors ${playSurface === "tv_and_phones" ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted"}`}>
                        <div className="flex items-start gap-3">
                          <input type="radio" name="play-surface" checked={playSurface === "tv_and_phones"} onChange={() => setPlaySurface("tv_and_phones")} className="mt-0.5" />
                          <div>
                            <div className="font-medium text-foreground">TV and phones</div>
                            <div className="mt-1 text-xs text-muted-foreground">Open the TV display for the room, then let players answer on their phones.</div>
                          </div>
                        </div>
                      </label>

                      <label className={`rounded-2xl border p-4 text-sm transition-colors ${playSurface === "phones_only" ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted"}`}>
                        <div className="flex items-start gap-3">
                          <input type="radio" name="play-surface" checked={playSurface === "phones_only"} onChange={() => setPlaySurface("phones_only")} className="mt-0.5" />
                          <div>
                            <div className="font-medium text-foreground">Phones only</div>
                            <div className="mt-1 text-xs text-muted-foreground">Skip the TV display and let players follow the game from their own phones.</div>
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {playSurface === "phones_only" ? (
                    <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
                      This setup does not need a TV display. Audio is set to player phones for this game.
                    </div>
                  ) : (
                    <div>
                      <div className="text-sm font-medium text-foreground">Audio</div>
                      <select
                        value={audioMode}
                        onChange={(event) => setAudioMode(event.target.value as AudioMode)}
                        className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground"
                      >
                        <option value="display">TV display only</option>
                        <option value="phones">Player phones only</option>
                        <option value="both">TV and player phones</option>
                      </select>
                      <div className="mt-1 text-xs text-muted-foreground">Leave this on TV display unless you already know you want something else.</div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-border bg-muted p-4 text-sm text-muted-foreground">
                    {feasibilityBusy
                      ? "Checking which ready templates fit the current question pool..."
                      : createBlockReason
                        ? createBlockReason
                        : `${roundCount} rounds can be built from all active packs with ${candidateCount} candidate questions in scope.`}
                  </div>
                </div>
              ) : null}

              {currentStep === 4 ? (
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle>Game summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-muted-foreground">Quiz style</span>
                            <span className="text-right font-medium text-foreground">{QUIZ_FEELS.find((option) => option.value === quizFeel)?.title ?? "Classic quiz"}</span>
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-muted-foreground">Mode</span>
                            <span className="text-right font-medium text-foreground">{gameMode === "teams" ? "Teams" : "Solo"}</span>
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-muted-foreground">Recommended setup</span>
                            <span className="text-right font-medium text-foreground">{SETUP_LENGTHS.find((option) => option.id === lengthId)?.title ?? "Standard game"}</span>
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-muted-foreground">Play format</span>
                            <span className="text-right font-medium text-foreground">{playSurfaceLabel(playSurface)}</span>
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-muted-foreground">Audio</span>
                            <span className="text-right font-medium text-foreground">{audioModeLabel(audioMode)}</span>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Planned rounds</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {templatePlan.rounds.length ? (
                            <div className="space-y-2">
                              {templatePlan.rounds.map((round, index) => (
                                <div key={round.id} className="rounded-xl border border-border bg-card px-3 py-3 text-sm">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="font-medium text-foreground">{index + 1}. {round.name}</div>
                                    <div className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                                      {round.behaviourType === "quickfire" ? "Quickfire" : "Standard"}
                                    </div>
                                  </div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {round.questionCount} questions · {round.answerSeconds}s answers · {round.roundReviewSeconds}s round review
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">No ready plan yet.</div>
                          )}

                          {templatePlan.notes.length ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                              {templatePlan.notes[0]}
                            </div>
                          ) : null}
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle>Ready to create?</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm text-muted-foreground">
                        <p>
                          {playSurface === "phones_only"
                            ? "Creating the room does not start the game. It gives you a room code and a join link for players, then hands you over to the live host controls when you are ready."
                            : "Creating the room does not start the game. It gives you a room code, a TV display link, and a join link for players."}
                        </p>
                        {createError ? (
                          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                            {createError}
                          </div>
                        ) : null}
                        {!createError && createBlockReason ? (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                            {createBlockReason}
                          </div>
                        ) : null}
                        <Button onClick={createRoom} disabled={creating || Boolean(createBlockReason)} className="w-full">
                          {creating ? "Creating..." : "Create room"}
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{playSurface === "phones_only" ? "5. Get players joined and start" : "5. Open the right screens"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_160px] lg:items-center">
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-foreground">Room code</div>
                      <div className="text-3xl font-semibold tracking-[0.25em] text-foreground">{roomCode}</div>
                      <div className="text-sm text-muted-foreground">Players join this room on their phones.</div>
                    </div>
                    <div className="flex justify-start lg:justify-end">
                      <QRTile value={joinUrl} size={140} />
                    </div>
                  </div>

                  <div className={`grid gap-3 ${playSurface === "phones_only" ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
                    <div className="rounded-2xl border border-border bg-card p-4 text-sm">
                      <div className="font-medium text-foreground">Host screen</div>
                      <div className="mt-1 text-muted-foreground">Keep this wizard open for now, then switch to the full host controls when you are ready.</div>
                    </div>
                    {playSurface === "phones_only" ? null : (
                      <div className="rounded-2xl border border-border bg-card p-4 text-sm">
                        <div className="font-medium text-foreground">TV display</div>
                        <div className="mt-1 text-muted-foreground">Open the TV display on the room screen before you start.</div>
                      </div>
                    )}
                    <div className="rounded-2xl border border-border bg-card p-4 text-sm">
                      <div className="font-medium text-foreground">Player phones</div>
                      <div className="mt-1 text-muted-foreground">Players use the code or QR to join on their own phones.</div>
                    </div>
                  </div>

                  <div className={`grid gap-2 ${playSurface === "phones_only" ? "sm:grid-cols-1" : "sm:grid-cols-2"}`}>
                    {playSurface === "phones_only" ? null : <Button onClick={() => openInNewWindow(displayUrl)}>Open TV display</Button>}
                    <Button variant={playSurface === "phones_only" ? "primary" : "secondary"} onClick={() => openInNewWindow(joinUrl)}>Open player join page</Button>
                  </div>

                  <div className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground break-all">
                    {joinUrl}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={copyJoinLink}>Copy join link</Button>
                    <Link href={directHostUrl} className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                      Open full host controls
                    </Link>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Review and start</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
                    {playSurface === "phones_only"
                      ? "Wait for your players to join on their phones, then start the game. When you press Start game, the app moves you into the existing host controls for live running."
                      : "Wait for your players to join, then open the TV display if needed and start the game. When you press Start game, the app moves you into the existing host controls for live running."}
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-4 text-sm">
                    <div className="font-medium text-foreground">Players joined</div>
                    <div className="mt-1 text-muted-foreground">
                      {joinedPlayerCount <= 0
                        ? "No players have joined yet. At least one player must join before you can start."
                        : `${joinedPlayerCount} player${joinedPlayerCount === 1 ? " has" : "s have"} joined. You will be asked to confirm before the game starts.`}
                    </div>
                  </div>

                  {startError ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                      {startError}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={startGame} disabled={startBusy || joinedPlayerCount <= 0}>
                      {startBusy ? "Starting..." : joinedPlayerCount <= 0 ? "Waiting for players" : "Start game"}
                    </Button>
                    <Link href={directHostUrl} className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                      Go to existing host setup
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Room summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Quiz style</span>
                    <span className="text-right font-medium text-foreground">{QUIZ_FEELS.find((option) => option.value === quizFeel)?.title ?? "Classic quiz"}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Mode</span>
                    <span className="text-right font-medium text-foreground">{gameMode === "teams" ? "Teams" : "Solo"}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Setup</span>
                    <span className="text-right font-medium text-foreground">{SETUP_LENGTHS.find((option) => option.id === lengthId)?.title ?? "Standard game"}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Rounds</span>
                    <span className="text-right font-medium text-foreground">{templatePlan.rounds.length}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Play format</span>
                    <span className="text-right font-medium text-foreground">{playSurfaceLabel(playSurface)}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Audio</span>
                    <span className="text-right font-medium text-foreground">{audioModeLabel(audioMode)}</span>
                  </div>
                </CardContent>
              </Card>

              <HostJoinedTeamsPanel code={roomCode} />
            </div>
          </div>
        )}

        {!roomCode ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {currentStep < 4
                ? "The wizard narrows the choices first, then creates the room once the setup is clear."
                : "Creating the room will not start the game yet."}
            </div>
            <div className="flex gap-2">
              {currentStep > 1 ? (
                <Button variant="secondary" onClick={() => setCurrentStep(getPreviousStep(currentStep))}>
                  Back
                </Button>
              ) : null}
              {currentStep < 4 ? (
                <Button
                  onClick={() => setCurrentStep(getNextStep(currentStep))}
                  disabled={currentStep === 2 && Boolean(teamValidationMessage)}
                >
                  Next
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </PageShell>
  )
}
