"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import QRTile from "@/components/ui/QRTile"

import { supabase } from "@/lib/supabaseClient"
import { randomTeamName } from "@/lib/teamNameSuggestions"

import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import HostJoinedTeamsPanel from "@/components/HostJoinedTeamsPanel"
import PageShell from "@/components/PageShell"

type PackRow = {
  id: string
  display_name: string
  round_type: string
  sort_order: number | null
  is_active: boolean | null
}

type SelectionStrategy = "all_packs" | "per_pack"
type RoundFilter =
  | "mixed"
  | "no_audio"
  | "no_image"
  | "audio_only"
  | "picture_only"
  | "audio_and_image"

type AudioMode = "display" | "phones" | "both"
type GameMode = "teams" | "solo"
type RoomState = any

const LAST_HOST_CODE_KEY = "mtq_last_host_code"

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function parseIntOr(value: string, fallback: number) {
  const v = value.trim()
  if (v === "") return fallback
  const n = Number(v)
  return Number.isFinite(n) ? Math.floor(n) : fallback
}

function cleanRoomCode(input: string) {
  return String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12)
}

function defaultRoundName(i: number) {
  return `Round ${i + 1}`
}

export default function HostPage() {
  const [packs, setPacks] = useState<PackRow[]>([])
  const [packsLoading, setPacksLoading] = useState(true)
  const [packsError, setPacksError] = useState<string | null>(null)

  const [selectPacks, setSelectPacks] = useState(false)
  const [selectedPacks, setSelectedPacks] = useState<Record<string, boolean>>({})
  const [selectionStrategy, setSelectionStrategy] = useState<SelectionStrategy>("all_packs")
  const [roundFilter, setRoundFilter] = useState<RoundFilter>("mixed")
  const [audioMode, setAudioMode] = useState<AudioMode>("display")

  const [totalQuestionsStr, setTotalQuestionsStr] = useState("20")
  const [answerSecondsStr, setAnswerSecondsStr] = useState("20")
  const [roundReviewSecondsStr, setRoundReviewSecondsStr] = useState("10")
  const [untimedAnswers, setUntimedAnswers] = useState(false)

  const [roundCountStr, setRoundCountStr] = useState("4")
  const [roundNames, setRoundNames] = useState<string[]>([
    "Round 1",
    "Round 2",
    "Round 3",
    "Round 4",
  ])

  const [gameMode, setGameMode] = useState<GameMode>("teams")
  const [teamNames, setTeamNames] = useState<string[]>(() => {
    const first = randomTeamName()
    const second = randomTeamName([first])
    return [first, second]
  })

  const [perPackCounts, setPerPackCounts] = useState<Record<string, string>>({})

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [roomPhase, setRoomPhase] = useState("lobby")
  const [roomStage, setRoomStage] = useState("lobby")

  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [startOk, setStartOk] = useState<string | null>(null)

  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetOk, setResetOk] = useState<string | null>(null)

  const [forcingClose, setForcingClose] = useState(false)
  const [forceCloseError, setForceCloseError] = useState<string | null>(null)

  const [rehostCode, setRehostCode] = useState("")
  const [rehostBusy, setRehostBusy] = useState(false)
  const [rehostError, setRehostError] = useState<string | null>(null)

  const advancingRef = useRef(false)

  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const joinUrl = roomCode ? `${origin}/join?code=${roomCode}` : ""
  const joinPageUrl = roomCode ? `/join?code=${roomCode}` : ""
  const displayUrl = roomCode ? `/display/${roomCode}` : ""

  useEffect(() => {
    const raw = clampInt(parseIntOr(roundCountStr, 4), 1, 20)
    setRoundNames((prev) => {
      let next = [...prev]
      if (next.length < raw) {
        for (let i = next.length; i < raw; i++) next.push(defaultRoundName(i))
      }
      if (next.length > raw) next = next.slice(0, raw)
      next = next.map((n, i) => (String(n ?? "").trim() ? n : defaultRoundName(i)))
      return next
    })
  }, [roundCountStr])

  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_HOST_CODE_KEY)
      if (last) setRehostCode(cleanRoomCode(last))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadPacks() {
      setPacksLoading(true)
      setPacksError(null)

      const { data, error } = await supabase
        .from("packs")
        .select("id, display_name, round_type, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })

      if (cancelled) return

      if (error) {
        setPacksError(error.message)
        setPacks([])
        setPacksLoading(false)
        return
      }

      setPacks((data ?? []) as PackRow[])
      setPacksLoading(false)
    }

    loadPacks()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!packs || packs.length === 0) return

    setSelectedPacks((prev) => {
      const next = { ...prev }
      for (const p of packs) {
        if (next[p.id] === undefined) next[p.id] = false
      }
      return next
    })

    setPerPackCounts((prev) => {
      const next = { ...prev }
      for (const p of packs) {
        if (next[p.id] === undefined) next[p.id] = ""
      }
      return next
    })
  }, [packs])

  useEffect(() => {
    if (!roomCode) return

    let cancelled = false

    async function tick() {
      try {
        const res = await fetch(`/api/room/state?code=${roomCode}`, { cache: "no-store" })
        const data: RoomState = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok) {
          setRoomState(data)
          setRoomPhase(String(data?.phase ?? "lobby"))
          setRoomStage(String(data?.stage ?? "lobby"))
        }
      } catch {
        // ignore
      }
    }

    tick()
    const id = setInterval(tick, 1000)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [roomCode])

  useEffect(() => {
    if (!roomCode) return
    if (roomPhase !== "running") return
    if (roomStage !== "needs_advance") return
    if (advancingRef.current) return

    let cancelled = false
    advancingRef.current = true

    async function autoAdvance() {
      try {
        await fetch("/api/room/advance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: roomCode }),
        })
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          window.setTimeout(() => {
            advancingRef.current = false
          }, 300)
        } else {
          advancingRef.current = false
        }
      }
    }

    autoAdvance()

    return () => {
      cancelled = true
    }
  }, [roomCode, roomPhase, roomStage])

  function rememberHostCode(code: string) {
    try {
      localStorage.setItem(LAST_HOST_CODE_KEY, code)
    } catch {
      // ignore
    }
  }

  function openInNewWindow(url: string) {
    if (!url) return
    const w = window.open(url, "_blank", "noopener,noreferrer")
    if (w) w.opener = null
  }

  async function copyJoinLink() {
    if (!joinUrl) return
    try {
      await navigator.clipboard.writeText(joinUrl)
    } catch {
      // ignore
    }
  }

  function setAllSelected(value: boolean) {
    const next: Record<string, boolean> = {}
    for (const p of packs) next[p.id] = value
    setSelectedPacks(next)
  }

  function togglePack(id: string) {
    setSelectedPacks((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function selectedPackIds() {
    return packs.filter((p) => selectedPacks[p.id]).map((p) => p.id)
  }

  function buildRoundsPayload(packIds: string[]) {
    return packIds
      .map((packId) => {
        const raw = perPackCounts[packId] ?? ""
        const count = clampInt(parseIntOr(raw, 0), 0, 9999)
        return { packId, count }
      })
      .filter((r) => r.count > 0)
  }

  async function createRoom() {
    setCreating(true)
    setCreateError(null)
    setStartError(null)
    setStartOk(null)
    setResetError(null)
    setResetOk(null)
    setForceCloseError(null)

    try {
      const totalQuestions = clampInt(parseIntOr(totalQuestionsStr, 20), 1, 200)
      const roundReviewSeconds = clampInt(parseIntOr(roundReviewSecondsStr, 10), 0, 120)
      const countdownSeconds = roundReviewSeconds
      const answerSeconds = untimedAnswers ? 0 : clampInt(parseIntOr(answerSecondsStr, 20), 5, 120)

      let roundCount = clampInt(parseIntOr(roundCountStr, 4), 1, 20)
      if (roundCount > totalQuestions) {
        roundCount = totalQuestions
        setRoundCountStr(String(roundCount))
      }

      const roundNamesToSend = Array.from({ length: roundCount }).map((_, i) => {
        const name = String(roundNames[i] ?? "").trim()
        return name || defaultRoundName(i)
      })

      const cleanTeamNames = teamNames.map((t) => t.trim()).filter(Boolean)

      if (gameMode === "teams") {
        if (cleanTeamNames.length < 2) {
          setCreateError("Add at least two team names.")
          setCreating(false)
          return
        }

        const seen = new Set<string>()
        for (const t of cleanTeamNames) {
          const key = t.toLowerCase()
          if (seen.has(key)) {
            setCreateError("Team names must be unique.")
            setCreating(false)
            return
          }
          seen.add(key)
        }
      }

      const usingAllPacks = !selectPacks
      const strategy: SelectionStrategy = usingAllPacks ? "all_packs" : selectionStrategy

      const packIds = usingAllPacks ? packs.map((p) => p.id) : selectedPackIds()

      if (!usingAllPacks && packIds.length === 0) {
        setCreateError("Select at least one pack, or untick Select packs to use all packs.")
        setCreating(false)
        return
      }

      const rounds = strategy === "per_pack" ? buildRoundsPayload(packIds) : []

      if (!usingAllPacks && strategy === "per_pack" && rounds.length === 0) {
        setCreateError("Add a count for at least one selected pack.")
        setCreating(false)
        return
      }

      const payload: any = {
        gameMode,
        teamNames: gameMode === "teams" ? cleanTeamNames : [],
        selectionStrategy: strategy,
        roundFilter,
        totalQuestions,
        selectedPacks: packIds,
        rounds,
        countdownSeconds,
        answerSeconds,
        audioMode,
        roundCount,
        roundNames: roundNamesToSend,
      }

      const res = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        setCreateError(json?.error ?? "Failed to create room")
        setCreating(false)
        return
      }

      const code = cleanRoomCode(String(json?.code ?? ""))
      if (!code) {
        setCreateError("Room created, but no code returned.")
        setCreating(false)
        return
      }

      setRoomCode(code)
      setRoomPhase("lobby")
      setRoomStage("lobby")
      rememberHostCode(code)
    } catch (e: any) {
      setCreateError(e?.message ?? "Failed to create room")
    } finally {
      setCreating(false)
    }
  }

  async function rehostRoom() {
    setRehostBusy(true)
    setRehostError(null)
    setCreateError(null)

    const code = cleanRoomCode(rehostCode)
    if (!code) {
      setRehostError("Enter a room code.")
      setRehostBusy(false)
      return
    }

    try {
      const res = await fetch(`/api/room/state?code=${encodeURIComponent(code)}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setRehostError(String(data?.error ?? "Room not found."))
        setRehostBusy(false)
        return
      }

      setRoomCode(code)
      setRoomState(data)
      setRoomPhase(String(data?.phase ?? "lobby"))
      setRoomStage(String(data?.stage ?? "lobby"))
      rememberHostCode(code)
    } catch {
      setRehostError("Could not load that room.")
    } finally {
      setRehostBusy(false)
    }
  }

  async function startGame() {
    if (!roomCode) return

    setStarting(true)
    setStartError(null)
    setStartOk(null)

    try {
      const res = await fetch("/api/room/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setStartError(data?.error ?? "Could not start game.")
        return
      }

      setRoomPhase("running")
      setRoomStage("open")
      setStartOk("Game started.\nJoining is now closed.")
    } catch (e: any) {
      setStartError(e?.message ?? "Could not start game.")
    } finally {
      setStarting(false)
    }
  }

  async function resetRoom() {
    if (!roomCode) return

    setResetting(true)
    setResetError(null)
    setResetOk(null)
    setStartError(null)
    setStartOk(null)
    setForceCloseError(null)

    try {
      const res = await fetch("/api/room/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setResetError(data?.error ?? "Reset failed.")
        return
      }

      setRoomPhase("lobby")
      setRoomStage("lobby")
      setResetOk("Room reset.\nTeams kept, scores set to 0, and joining is open again.")
    } catch (e: any) {
      setResetError(e?.message ?? "Reset failed.")
    } finally {
      setResetting(false)
    }
  }

  async function continueGame() {
    if (!roomCode) return

    setForcingClose(true)
    setForceCloseError(null)

    const route = roomStage === "open" ? "/api/room/force-close" : "/api/room/advance"

    try {
      const res = await fetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setForceCloseError(data?.error ?? "Could not move on.")
      }
    } catch {
      setForceCloseError("Could not move on.")
    } finally {
      setForcingClose(false)
    }
  }

  function clearRoom() {
    setRoomCode(null)
    setRoomState(null)
    setRoomPhase("lobby")
    setRoomStage("lobby")
    setStartError(null)
    setStartOk(null)
    setResetError(null)
    setResetOk(null)
    setForceCloseError(null)
  }

  const stagePill = useMemo(() => {
    if (roomPhase === "running") {
      if (roomStage === "countdown") return "Countdown"
      if (roomStage === "open") return "Answering"
      if (roomStage === "wait") return "Waiting"
      if (roomStage === "reveal") return "Reveal"
      if (roomStage === "round_summary") return "End of round"
      if (roomStage === "needs_advance") return "Next question"
      return "Running"
    }
    if (roomPhase === "finished") return "Finished"
    return "Lobby"
  }, [roomPhase, roomStage])

  const hasRoom = Boolean(roomCode)
  const showPacksPanel = !hasRoom && selectPacks
  const selectedPackCount = packs.filter((p) => selectedPacks[p.id]).length
  const canStart = hasRoom && roomPhase === "lobby" && !starting
  const canContinue =
    hasRoom &&
    roomPhase === "running" &&
    ["open", "round_summary", "needs_advance"].includes(roomStage) &&
    !forcingClose

  const continueLabel =
    roomStage === "open"
      ? forcingClose
        ? "Moving on..."
        : "Reveal answer"
      : roomStage === "round_summary"
        ? forcingClose
          ? "Moving on..."
          : Boolean(roomState?.flow?.isLastQuestionOverall)
            ? "Finish now"
            : "Skip round review"
        : forcingClose
          ? "Moving on..."
          : Boolean(roomState?.flow?.isLastQuestionOverall)
            ? "Finish now"
            : "Next question"

  const startLabel =
    roomPhase === "lobby"
      ? starting
        ? "Starting..."
        : "Start game"
      : roomPhase === "running"
        ? "Game running"
        : "Game finished"

  const roomSummaryText =
    roomPhase === "lobby"
      ? "Players can still join. When you are ready, start the game from the host controls."
      : roomPhase === "running"
        ? "Questions move on automatically between questions. End of round waits for the host or the round review timer."
        : "The game is finished. Reset the room to play again with the same teams."

  return (
    <PageShell width="full" contentClassName="max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Host</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Create a room, share the code, and run the quiz.
          </p>
        </div>

        <Link href="/" className="text-sm text-[var(--muted-foreground)] hover:underline">
          Back to home
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-6">
          {!hasRoom ? (
            <Card>
              <CardHeader>
                <CardTitle>Create a room</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-[var(--border)] p-3">
                  <div className="text-sm font-semibold text-[var(--foreground)]">Game</div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <div className="text-sm font-medium text-[var(--foreground)]">Mode</div>
                      <select
                        value={gameMode}
                        onChange={(e) => setGameMode(e.target.value as GameMode)}
                        className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                      >
                        <option value="teams">Teams</option>
                        <option value="solo">No teams</option>
                      </select>
                      <div className="mt-1 text-xs text-[var(--muted-foreground)]">One phone per person.</div>
                    </div>

                    {gameMode === "teams" ? (
                      <div>
                        <div className="text-sm font-medium text-[var(--foreground)]">Scoring</div>
                        <div className="mt-2 text-sm text-[var(--muted-foreground)]">
                          Total points. If team sizes differ, the scoreboard uses average points per player.
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-end text-sm text-[var(--muted-foreground)]">Players score individually.</div>
                    )}

                    {gameMode === "teams" ? (
                      <div className="flex items-end justify-end">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setTeamNames((prev) => {
                              const used = new Set(prev.map((x) => x.trim()).filter(Boolean))
                              const nextName = randomTeamName(used)
                              return [...prev, nextName]
                            })
                          }}
                        >
                          Add team
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {gameMode === "teams" ? (
                    <div className="mt-3 space-y-2">
                      <div className="text-sm text-[var(--muted-foreground)]">Teams (players pick one when joining)</div>

                      {teamNames.map((t, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input
                            value={t}
                            onChange={(e) =>
                              setTeamNames((prev) => prev.map((x, i) => (i === idx ? e.target.value : x)))
                            }
                            placeholder="Team name"
                          />
                          <Button
                            variant="ghost"
                            onClick={() => setTeamNames((prev) => prev.filter((_, i) => i !== idx))}
                            disabled={teamNames.length <= 2}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}

                      {teamNames.length <= 2 ? (
                        <div className="text-xs text-[var(--muted-foreground)]">Keep at least two teams.</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-[var(--border)] p-3">
                  <div className="text-sm font-semibold text-[var(--foreground)]">Rounds</div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <div className="text-sm font-medium text-[var(--foreground)]">Number of rounds</div>
                      <Input
                        value={roundCountStr}
                        onChange={(e) => setRoundCountStr(e.target.value)}
                        inputMode="numeric"
                      />
                      <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                        Players pick a Joker round in the lobby.
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <div className="text-sm font-medium text-[var(--foreground)]">Round names</div>
                      <div className="mt-1 grid gap-2 sm:grid-cols-2">
                        {roundNames.map((name, idx) => (
                          <Input
                            key={idx}
                            value={name}
                            onChange={(e) =>
                              setRoundNames((prev) => prev.map((n, i) => (i === idx ? e.target.value : n)))
                            }
                            placeholder={defaultRoundName(idx)}
                          />
                        ))}
                      </div>
                      <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                        Empty names fall back to Round 1, Round 2, and so on.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-sm font-medium text-[var(--foreground)]">Total questions</div>
                    <Input value={totalQuestionsStr} onChange={(e) => setTotalQuestionsStr(e.target.value)} inputMode="numeric" />
                  </div>

                  <div>
                    <div className="text-sm font-medium text-[var(--foreground)]">Answer seconds</div>
                    <Input
                      value={answerSecondsStr}
                      onChange={(e) => setAnswerSecondsStr(e.target.value)}
                      inputMode="numeric"
                      disabled={untimedAnswers}
                    />
                    <label className="mt-2 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                      <input type="checkbox" checked={untimedAnswers} onChange={(e) => setUntimedAnswers(e.target.checked)} />
                      Untimed answers (host controls)
                    </label>
                    {untimedAnswers ? (
                      <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                        The question stays open until everyone answers or you press Reveal answer.
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                        Questions open straight away. There is no get ready countdown.
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-sm font-medium text-[var(--foreground)]">Round review seconds</div>
                    <Input
                      value={roundReviewSecondsStr}
                      onChange={(e) => setRoundReviewSecondsStr(e.target.value)}
                      inputMode="numeric"
                    />
                    <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                      After the last question in a round, the round summary shows for this long before the next round starts.
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-sm font-medium text-[var(--foreground)]">Round filter</div>
                    <select
                      value={roundFilter}
                      onChange={(e) => setRoundFilter(e.target.value as RoundFilter)}
                      className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                    >
                      <option value="mixed">Mixed</option>
                      <option value="no_audio">No audio</option>
                      <option value="no_image">No pictures</option>
                      <option value="audio_only">Audio only</option>
                      <option value="picture_only">Pictures only</option>
                      <option value="audio_and_image">Audio and pictures</option>
                    </select>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-[var(--foreground)]">Audio mode</div>
                    <select
                      value={audioMode}
                      onChange={(e) => setAudioMode(e.target.value as AudioMode)}
                      className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                    >
                      <option value="display">Display only</option>
                      <option value="phones">Phones only</option>
                      <option value="both">Both</option>
                    </select>
                  </div>

                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                      <input type="checkbox" checked={selectPacks} onChange={(e) => setSelectPacks(e.target.checked)} />
                      Select packs
                    </label>
                  </div>
                </div>

                {createError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    {createError}
                  </div>
                ) : null}
              </CardContent>

              <CardFooter className="flex items-center justify-between gap-3">
                <div className="text-sm text-[var(--muted-foreground)]">
                  {!selectPacks
                    ? "Using all active packs."
                    : selectedPackCount > 0
                      ? `${selectedPackCount} pack${selectedPackCount === 1 ? "" : "s"} selected.`
                      : "No packs selected yet."}
                </div>
                <Button onClick={createRoom} disabled={creating || packsLoading}>
                  {creating ? "Creating..." : packsLoading ? "Loading packs..." : "Create room"}
                </Button>
              </CardFooter>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>Host controls</CardTitle>
                    <div className="mt-1 text-sm text-[var(--muted-foreground)]">{roomSummaryText}</div>
                  </div>
                  <div className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--foreground)]">
                    {stagePill}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {startError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    {startError}
                  </div>
                ) : null}

                {startOk ? (
                  <div className="whitespace-pre-line rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                    {startOk}
                  </div>
                ) : null}

                {resetError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    {resetError}
                  </div>
                ) : null}

                {resetOk ? (
                  <div className="whitespace-pre-line rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                    {resetOk}
                  </div>
                ) : null}

                {forceCloseError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    {forceCloseError}
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                    <div className="text-xs text-[var(--muted-foreground)]">Room code</div>
                    <div className="mt-1 text-2xl font-semibold tracking-widest text-[var(--foreground)]">{roomCode}</div>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                    <div className="text-xs text-[var(--muted-foreground)]">Current stage</div>
                    <div className="mt-1 text-lg font-semibold text-[var(--foreground)]">{stagePill}</div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button onClick={startGame} disabled={!canStart}>
                    {startLabel}
                  </Button>

                  <Button variant="secondary" onClick={resetRoom} disabled={resetting}>
                    {resetting ? "Resetting..." : "Reset room"}
                  </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <Button variant="secondary" onClick={continueGame} disabled={!canContinue}>
                    {continueLabel}
                  </Button>

                  <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--muted-foreground)]">
                    Round review advances automatically after the set time. Use the button to move on sooner.
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button variant="ghost" onClick={clearRoom}>
                    Create another room
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {packsError ? (
            <Card>
              <CardHeader>
                <CardTitle>Packs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                  {packsError}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          {!hasRoom ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Re-host room</CardTitle>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="text-sm text-[var(--muted-foreground)]">
                    Enter a room code to continue hosting an existing room.
                  </div>

                  <div>
                    <div className="text-sm font-medium text-[var(--foreground)]">Room code</div>
                    <Input
                      value={rehostCode}
                      onChange={(e) => setRehostCode(cleanRoomCode(e.target.value))}
                      placeholder="For example 3PDSXFT5"
                      autoCapitalize="characters"
                      spellCheck={false}
                    />
                  </div>

                  {rehostError ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                      {rehostError}
                    </div>
                  ) : null}

                  <Button onClick={rehostRoom} disabled={rehostBusy}>
                    {rehostBusy ? "Loading..." : "Re-host"}
                  </Button>
                </CardContent>
              </Card>

              {showPacksPanel ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>Packs</CardTitle>
                        <div className="mt-1 text-sm text-[var(--muted-foreground)]">
                          Choose which packs to include.
                        </div>
                      </div>
                      <div className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted-foreground)]">
                        {selectedPackCount} selected
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => setAllSelected(true)}>
                        Select all
                      </Button>
                      <Button variant="secondary" onClick={() => setAllSelected(false)}>
                        Clear
                      </Button>

                      <div className="ml-auto flex items-center gap-2">
                        <div className="text-sm text-[var(--muted-foreground)]">Strategy</div>
                        <select
                          value={selectionStrategy}
                          onChange={(e) => setSelectionStrategy(e.target.value as SelectionStrategy)}
                          className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                        >
                          <option value="all_packs">Mix all selected packs</option>
                          <option value="per_pack">Set counts per pack</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      {packs.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                          <input type="checkbox" checked={Boolean(selectedPacks[p.id])} onChange={() => togglePack(p.id)} />
                          <span className="min-w-0 flex-1 text-sm">{p.display_name}</span>

                          {selectionStrategy === "per_pack" && selectedPacks[p.id] ? (
                            <input
                              value={perPackCounts[p.id] ?? ""}
                              onChange={(e) => setPerPackCounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                              inputMode="numeric"
                              placeholder="Count"
                              className="w-24 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                            />
                          ) : null}
                        </label>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Packs</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-[var(--muted-foreground)]">
                    <div>You are currently using all active packs.</div>
                    <div>Tick Select packs on the left if you want to choose specific packs.</div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Room access</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-2xl font-semibold tracking-widest text-[var(--foreground)]">{roomCode}</div>
                    <QRTile value={joinUrl} size={112} />
                  </div>

                  <div className="text-sm text-[var(--muted-foreground)]">Players join at</div>

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
                    <a href={joinUrl} className="break-all underline">
                      {joinUrl}
                    </a>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button onClick={() => openInNewWindow(displayUrl)}>Open TV display</Button>
                    <Button variant="secondary" onClick={() => openInNewWindow(joinPageUrl)}>
                      Join room
                    </Button>
                  </div>

                  <Button variant="secondary" onClick={copyJoinLink}>
                    Copy join link
                  </Button>
                </CardContent>
              </Card>

              <HostJoinedTeamsPanel code={roomCode ?? ""} />
            </>
          )}
        </div>
      </div>
    </PageShell>
  )
}
