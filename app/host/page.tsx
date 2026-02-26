"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { QRCodeSVG } from "qrcode.react"

import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import HostJoinedTeamsPanel from "@/components/HostJoinedTeamsPanel"

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
  const [countdownSecondsStr, setCountdownSecondsStr] = useState("5")
  const [answerSecondsStr, setAnswerSecondsStr] = useState("20")

  const [untimedAnswers, setUntimedAnswers] = useState(false)

  const [perPackCounts, setPerPackCounts] = useState<Record<string, string>>({})

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [roomCode, setRoomCode] = useState<string | null>(null)
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

  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const joinUrl = roomCode ? `${origin}/join?code=${roomCode}` : ""
  const joinPageUrl = roomCode ? `/join?code=${roomCode}` : ""
  const displayUrl = roomCode ? `/display/${roomCode}` : ""

  const showGameplayPanel = Boolean(roomCode) && (roomPhase === "running" || roomPhase === "finished")

  const mutedText = "text-[hsl(var(--muted-foreground))]"
  const borderToken = "border-[hsl(var(--border))]"
  const cardToken = "bg-[hsl(var(--card))]"

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
      const countdownSeconds = clampInt(parseIntOr(countdownSecondsStr, 5), 0, 30)
      const answerSeconds = untimedAnswers ? 0 : clampInt(parseIntOr(answerSecondsStr, 20), 5, 120)

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
        selectionStrategy: strategy,
        roundFilter,
        totalQuestions,
        selectedPacks: packIds,
        rounds,
        countdownSeconds,
        answerSeconds,
        audioMode,
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
      setRoomStage("countdown")
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

  async function forceNextQuestion() {
    if (!roomCode) return

    setForcingClose(true)
    setForceCloseError(null)

    try {
      const res = await fetch("/api/room/force-close", {
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
      return "Running"
    }
    if (roomPhase === "finished") return "Finished"
    return "Lobby"
  }, [roomPhase, roomStage])

  const canStart = roomCode && roomPhase === "lobby" && !starting
  const canForceNext = roomCode && roomPhase === "running" && roomStage === "open" && !forcingClose

  const startLabel =
    roomPhase === "lobby"
      ? starting
        ? "Starting…"
        : "Start game"
      : roomPhase === "running"
        ? "Game running"
        : "Game finished"

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Host</h1>
          <p className={`mt-1 text-sm ${mutedText}`}>Create a room, share the code, and start the quiz.</p>
        </div>

        <Link href="/" className={`text-sm hover:underline ${mutedText}`}>
          Back to home
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {!roomCode ? (
            <Card>
              <CardHeader>
                <CardTitle>Create a room</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-sm font-medium text-[hsl(var(--foreground))]">Total questions</div>
                    <Input value={totalQuestionsStr} onChange={(e) => setTotalQuestionsStr(e.target.value)} inputMode="numeric" />
                  </div>

                  <div>
                    <div className="text-sm font-medium text-[hsl(var(--foreground))]">Countdown seconds</div>
                    <Input value={countdownSecondsStr} onChange={(e) => setCountdownSecondsStr(e.target.value)} inputMode="numeric" />
                  </div>

                  <div>
                    <div className="text-sm font-medium text-[hsl(var(--foreground))]">Answer seconds</div>
                    <Input
                      value={answerSecondsStr}
                      onChange={(e) => setAnswerSecondsStr(e.target.value)}
                      inputMode="numeric"
                      disabled={untimedAnswers}
                    />
                    <label className={`mt-2 flex items-center gap-2 text-sm ${mutedText}`}>
                      <input type="checkbox" checked={untimedAnswers} onChange={(e) => setUntimedAnswers(e.target.checked)} />
                      Untimed answers (host controls)
                    </label>
                    {untimedAnswers ? (
                      <div className={`mt-1 text-xs ${mutedText}`}>
                        The question stays open until everyone answers or you press Next question.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-sm font-medium text-[hsl(var(--foreground))]">Round filter</div>
                    <select
                      value={roundFilter}
                      onChange={(e) => setRoundFilter(e.target.value as RoundFilter)}
                      className={`mt-1 w-full rounded-xl border ${borderToken} ${cardToken} px-3 py-2 text-sm`}
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
                    <div className="text-sm font-medium text-[hsl(var(--foreground))]">Audio mode</div>
                    <select
                      value={audioMode}
                      onChange={(e) => setAudioMode(e.target.value as AudioMode)}
                      className={`mt-1 w-full rounded-xl border ${borderToken} ${cardToken} px-3 py-2 text-sm`}
                    >
                      <option value="display">Display only</option>
                      <option value="phones">Phones only</option>
                      <option value="both">Both</option>
                    </select>
                  </div>

                  <div className="flex items-end">
                    <label className={`flex items-center gap-2 text-sm ${mutedText}`}>
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

              <CardFooter>
                <Button onClick={createRoom} disabled={creating || packsLoading}>
                  {creating ? "Creating…" : packsLoading ? "Loading packs…" : "Create room"}
                </Button>
              </CardFooter>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Host controls</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className={`text-sm ${mutedText}`}>Status</div>
                  <div className={`rounded-full border ${borderToken} px-3 py-1 text-xs text-[hsl(var(--foreground))]`}>
                    {stagePill}
                  </div>
                </div>

                {startError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    {startError}
                  </div>
                ) : null}

                {startOk ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 whitespace-pre-line">
                    {startOk}
                  </div>
                ) : null}

                {resetError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    {resetError}
                  </div>
                ) : null}

                {resetOk ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 whitespace-pre-line">
                    {resetOk}
                  </div>
                ) : null}

                {forceCloseError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    {forceCloseError}
                  </div>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button onClick={() => openInNewWindow(displayUrl)}>Open TV display</Button>
                  <Button variant="secondary" onClick={() => openInNewWindow(joinPageUrl)}>
                    Join room
                  </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button onClick={startGame} disabled={!canStart}>
                    {startLabel}
                  </Button>

                  <Button variant="secondary" onClick={resetRoom} disabled={resetting}>
                    {resetting ? "Resetting…" : "Reset room"}
                  </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="secondary" onClick={forceNextQuestion} disabled={!canForceNext}>
                    {forcingClose ? "Moving on…" : "Next question"}
                  </Button>

                  <div className={`flex items-center text-sm ${mutedText}`}>
                    Works best with untimed answers.
                  </div>
                </div>

                <Button variant="ghost" onClick={clearRoom}>
                  Create another room
                </Button>
              </CardContent>
            </Card>
          )}

          {!roomCode ? (
            <Card>
              <CardHeader>
                <CardTitle>Re-host room</CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className={`text-sm ${mutedText}`}>Enter a room code to continue hosting an existing room.</div>

                <div>
                  <div className="text-sm font-medium text-[hsl(var(--foreground))]">Room code</div>
                  <Input
                    value={rehostCode}
                    onChange={(e) => setRehostCode(cleanRoomCode(e.target.value))}
                    autoCapitalize="characters"
                    spellCheck={false}
                  />
                </div>

                <Button onClick={rehostRoom} disabled={rehostBusy || !cleanRoomCode(rehostCode)}>
                  {rehostBusy ? "Loading…" : "Re-host"}
                </Button>

                {rehostError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    {rehostError}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {roomCode ? (
            <Card>
              <CardHeader>
                <CardTitle>Joined teams</CardTitle>
              </CardHeader>
              <CardContent>
                <HostJoinedTeamsPanel code={roomCode} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          {!roomCode ? (
            <Card>
              <CardHeader>
                <CardTitle>Packs</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {!selectPacks ? (
                  <div className={`text-sm ${mutedText}`}>
                    Tick Select packs on the left if you want to choose packs. Leave it unticked to use all active packs.
                  </div>
                ) : (
                  <div className={`rounded-2xl border ${borderToken} p-3`}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Packs</div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className={`rounded-xl border ${borderToken} px-2 py-1 text-xs hover:bg-[hsl(var(--muted))]`}
                          onClick={() => setAllSelected(true)}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          className={`rounded-xl border ${borderToken} px-2 py-1 text-xs hover:bg-[hsl(var(--muted))]`}
                          onClick={() => setAllSelected(false)}
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <label className={`flex items-center gap-2 text-sm ${mutedText}`}>
                        <input
                          type="radio"
                          name="selectionStrategy"
                          value="all_packs"
                          checked={selectionStrategy === "all_packs"}
                          onChange={() => setSelectionStrategy("all_packs")}
                        />
                        Use all selected packs
                      </label>

                      <label className={`flex items-center gap-2 text-sm ${mutedText}`}>
                        <input
                          type="radio"
                          name="selectionStrategy"
                          value="per_pack"
                          checked={selectionStrategy === "per_pack"}
                          onChange={() => setSelectionStrategy("per_pack")}
                        />
                        Allocate per pack
                      </label>
                    </div>

                    {packsLoading ? (
                      <div className={`text-sm ${mutedText}`}>Loading packs…</div>
                    ) : packsError ? (
                      <div className="text-sm text-red-600">{packsError}</div>
                    ) : (
                      <div className="space-y-2">
                        {packs.map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-3">
                            <label className={`flex items-center gap-2 text-sm ${mutedText}`}>
                              <input type="checkbox" checked={!!selectedPacks[p.id]} onChange={() => togglePack(p.id)} />
                              <span className="truncate">{p.display_name}</span>
                            </label>

                            {selectionStrategy === "per_pack" ? (
                              <input
                                className={`w-24 rounded-xl border ${borderToken} ${cardToken} px-2 py-1 text-sm text-[hsl(var(--foreground))]`}
                                inputMode="numeric"
                                placeholder="Count"
                                value={perPackCounts[p.id] ?? ""}
                                onChange={(e) =>
                                  setPerPackCounts((prev) => ({ ...prev, [p.id]: e.target.value }))
                                }
                              />
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Room</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {roomCode ? (
                <>
                  <div className="grid gap-2">
                    <div className={`text-sm ${mutedText}`}>Room code</div>
                    <div className="text-2xl font-semibold tracking-widest text-[hsl(var(--foreground))]">{roomCode}</div>
                  </div>

                  <div className="grid gap-2">
                    <div className={`text-sm ${mutedText}`}>Join link</div>
                    <div className={`break-all rounded-xl border ${borderToken} ${cardToken} p-2 text-sm text-[hsl(var(--foreground))]`}>
                      {joinUrl}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-2">
                      <QRCodeSVG value={joinUrl} size={156} />
                    </div>
                    <div className={`text-sm ${mutedText}`}>
                      Teams can join on their phones at <span className="font-medium text-[hsl(var(--foreground))]">/join</span>.
                    </div>
                  </div>
                </>
              ) : (
                <div className={`text-sm ${mutedText}`}>Create a room to see the join code and QR.</div>
              )}
            </CardContent>
          </Card>

          {showGameplayPanel ? (
            <Card>
              <CardHeader>
                <CardTitle>Gameplay display</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`overflow-hidden rounded-xl border ${borderToken}`}>
                  <iframe title="Gameplay display" src={displayUrl} className="h-[70vh] w-full" allow="fullscreen" />
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}