"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { QRCodeSVG } from "qrcode.react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/Button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card"
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
  const [selectedPacks, setSelectedPacks] = useState<Record<string, boolean>>(
    {}
  )

  const [selectionStrategy, setSelectionStrategy] =
    useState<SelectionStrategy>("all_packs")
  const [roundFilter, setRoundFilter] = useState<RoundFilter>("mixed")
  const [audioMode, setAudioMode] = useState<AudioMode>("display")

  const [totalQuestionsStr, setTotalQuestionsStr] = useState("20")
  const [countdownSecondsStr, setCountdownSecondsStr] = useState("5")
  const [answerSecondsStr, setAnswerSecondsStr] = useState("20")
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

  const [rehostCode, setRehostCode] = useState("")
  const [rehostBusy, setRehostBusy] = useState(false)
  const [rehostError, setRehostError] = useState<string | null>(null)

  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const joinUrl = roomCode && origin ? `${origin}/join?code=${roomCode}` : ""
  const joinPageUrl = roomCode ? `/join?code=${roomCode}` : ""
  const displayUrl = roomCode ? `/display/${roomCode}` : ""

  const mustShowPackPicker = selectionStrategy === "per_pack"
  const showPackPicker = selectPacks || mustShowPackPicker

  const shouldShowGameplayPanel =
    Boolean(roomCode) && (roomPhase === "running" || roomPhase === "finished")

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
      } else {
        setPacks((data ?? []) as PackRow[])
      }

      setPacksLoading(false)
    }

    loadPacks()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (packs.length === 0) return

    setSelectedPacks((prev) => {
      if (Object.keys(prev).length > 0) return prev
      const next: Record<string, boolean> = {}
      for (const p of packs) next[p.id] = true
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
        const res = await fetch(`/api/room/state?code=${roomCode}`, {
          cache: "no-store",
        })
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

  function togglePack(packId: string) {
    setSelectedPacks((prev) => ({ ...prev, [packId]: !prev[packId] }))
  }

  function getSelectedPackIds(): string[] {
    if (!showPackPicker) return packs.map((p) => p.id)
    return packs.filter((p) => selectedPacks[p.id]).map((p) => p.id)
  }

  function buildRoundsPayload(selectedIds: string[]) {
    return selectedIds
      .map((packId) => {
        const raw = perPackCounts[packId] ?? ""
        const count = clampInt(parseIntOr(raw, 0), 0, 9999)
        return { packId, count }
      })
      .filter((r) => r.count > 0)
  }

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

  async function createRoom() {
    setCreating(true)
    setCreateError(null)
    setStartError(null)
    setStartOk(null)
    setResetError(null)
    setResetOk(null)

    try {
      const selectedIds = getSelectedPackIds()
      if (selectedIds.length === 0) {
        setCreateError("Select at least one pack.")
        setCreating(false)
        return
      }

      const totalQuestions = clampInt(parseIntOr(totalQuestionsStr, 20), 1, 200)
      const countdownSeconds = clampInt(
        parseIntOr(countdownSecondsStr, 5),
        0,
        60
      )
      const answerSeconds = clampInt(parseIntOr(answerSecondsStr, 20), 5, 120)

      const rounds =
        selectionStrategy === "per_pack" ? buildRoundsPayload(selectedIds) : []

      if (selectionStrategy === "per_pack" && rounds.length === 0) {
        setCreateError("Set a question count for at least one selected pack.")
        setCreating(false)
        return
      }

      const payload: any = {
        selectionStrategy,
        roundFilter,
        totalQuestions,
        selectedPacks: selectedIds,
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

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setCreateError(data?.error ?? "Room creation failed.")
        setCreating(false)
        return
      }

      const code = cleanRoomCode(String(data?.code ?? ""))
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
      setCreateError(e?.message ?? "Room creation failed.")
    } finally {
      setCreating(false)
    }
  }

  async function rehostRoom() {
    setRehostBusy(true)
    setRehostError(null)
    setCreateError(null)
    setStartError(null)
    setStartOk(null)
    setResetError(null)
    setResetOk(null)

    const code = cleanRoomCode(rehostCode)
    if (!code) {
      setRehostError("Enter a room code.")
      setRehostBusy(false)
      return
    }

    try {
      const res = await fetch(
        `/api/room/state?code=${encodeURIComponent(code)}`,
        { cache: "no-store" }
      )
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setRehostError(String(data?.error ?? "Room not found."))
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
      setResetOk(
        "Room reset.\nTeams kept, scores set to 0, new questions picked, and joining is open again."
      )
    } catch (e: any) {
      setResetError(e?.message ?? "Reset failed.")
    } finally {
      setResetting(false)
    }
  }

  function onDigitsChange(setter: (v: string) => void, value: string) {
    if (value === "") {
      setter("")
      return
    }
    if (!/^\d+$/.test(value)) return
    setter(value)
  }

  function onDigitsBlur(
    setter: (v: string) => void,
    value: string,
    fallback: number,
    min: number,
    max: number
  ) {
    const n = clampInt(parseIntOr(value, fallback), min, max)
    setter(String(n))
  }

  function onPerPackChange(packId: string, value: string) {
    if (value === "") {
      setPerPackCounts((prev) => ({ ...prev, [packId]: "" }))
      return
    }
    if (!/^\d+$/.test(value)) return
    setPerPackCounts((prev) => ({ ...prev, [packId]: value }))
  }

  function onPerPackBlur(packId: string) {
    const raw = perPackCounts[packId] ?? ""
    if (raw.trim() === "") return
    const clamped = clampInt(parseIntOr(raw, 0), 0, 9999)
    setPerPackCounts((prev) => ({ ...prev, [packId]: String(clamped) }))
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
  const startLabel =
    roomPhase === "lobby"
      ? starting
        ? "Starting…"
        : "Start game"
      : roomPhase === "running"
        ? "Game running"
        : "Game finished"

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle>Host</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm opacity-80">
            Create a room, then open the display screen on your TV.
          </p>
        </CardContent>
      </Card>

      {roomCode ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Room {roomCode}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="rounded-full border border-[var(--border)] bg-[var(--muted)] px-3 py-1 text-xs">
                  {stagePill}
                </div>
              </div>

              {startError ? (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
                  {startError}
                </div>
              ) : null}
              {startOk ? (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm whitespace-pre-line">
                  {startOk}
                </div>
              ) : null}
              {resetError ? (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
                  {resetError}
                </div>
              ) : null}
              {resetOk ? (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm whitespace-pre-line">
                  {resetOk}
                </div>
              ) : null}

              <div className="space-y-1">
                <div className="text-xs opacity-70">Players join link</div>
                <div className="break-all rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm">
                  {joinUrl || "Join link not available."}
                </div>
              </div>

              {joinUrl ? (
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <div className="rounded-xl border border-[var(--border)] bg-white p-3">
                    <QRCodeSVG value={joinUrl} size={140} />
                  </div>
                  <div className="text-sm opacity-80">
                    Show the QR code on your TV so teams can join quickly.
                  </div>
                </div>
              ) : null}
            </CardContent>
            <CardFooter className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Button onClick={() => openInNewWindow(displayUrl)}>
                Open TV display
              </Button>

              <Button
                variant="secondary"
                onClick={() => openInNewWindow(joinPageUrl)}
                disabled={!roomCode}
              >
                Join room
              </Button>

              <Button onClick={startGame} disabled={!canStart}>
                {startLabel}
              </Button>

              <Button
                variant="secondary"
                onClick={resetRoom}
                disabled={!roomCode || resetting}
              >
                {resetting ? "Resetting…" : "Reset room (keep code)"}
              </Button>

              <Button
                variant="ghost"
                onClick={() => {
                  setRoomCode(null)
                  setRoomPhase("lobby")
                  setRoomStage("lobby")
                  setStartError(null)
                  setStartOk(null)
                  setResetError(null)
                  setResetOk(null)
                }}
              >
                Create another room
              </Button>
            </CardFooter>
          </Card>

          {shouldShowGameplayPanel ? (
            <Card>
              <CardHeader>
                <CardTitle>Gameplay display</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm opacity-80">
                  This appears once the game starts, so you can host from one screen if you need to.
                </div>
                <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                  <iframe
                    title="Gameplay display"
                    src={displayUrl}
                    className="h-[70vh] w-full"
                    allow="fullscreen"
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}

          <HostJoinedTeamsPanel code={roomCode} />

          <Card>
            <CardHeader>
              <CardTitle>Quick checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm opacity-90">
              <div>Open the TV display on a big screen.</div>
              <div>Share the join link or show the QR code.</div>
              <div>Press Start game when everyone has joined.</div>
              <div>If you started too early, press Reset.</div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Re-host an existing room</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm opacity-80">
                If you left the host page by accident, enter the room code to continue hosting that room.
              </p>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <div className="text-xs opacity-70">Room code</div>
                  <Input
                    value={rehostCode}
                    onChange={(e) => setRehostCode(cleanRoomCode(e.target.value))}
                    placeholder="For example 3PDSXFT5"
                    autoCapitalize="characters"
                    spellCheck={false}
                  />
                </div>
                <Button
                  onClick={rehostRoom}
                  disabled={rehostBusy || !cleanRoomCode(rehostCode)}
                >
                  {rehostBusy ? "Loading…" : "Re-host room"}
                </Button>
              </div>

              {rehostError ? (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
                  {rehostError}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Room settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {createError ? (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
                  {createError}
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="text-sm font-medium">How to pick questions</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={selectionStrategy === "all_packs" ? "primary" : "secondary"}
                    onClick={() => setSelectionStrategy("all_packs")}
                  >
                    Total count
                  </Button>
                  <Button
                    variant={selectionStrategy === "per_pack" ? "primary" : "secondary"}
                    onClick={() => setSelectionStrategy("per_pack")}
                  >
                    Per pack
                  </Button>
                </div>
                <div className="text-sm opacity-80">
                  Total count picks a total number of questions. Per pack lets you set counts for chosen packs.
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Question filter</div>
                <select
                  className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={roundFilter}
                  onChange={(e) => setRoundFilter(e.target.value as RoundFilter)}
                >
                  <option value="mixed">Mixed</option>
                  <option value="no_audio">No audio</option>
                  <option value="no_image">No images</option>
                  <option value="audio_only">Audio only</option>
                  <option value="picture_only">Picture only</option>
                  <option value="audio_and_image">Audio + image only</option>
                </select>
                <div className="text-sm opacity-80">
                  Use this when you want to avoid certain round types.
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <div className="text-xs opacity-70">Total questions</div>
                  <Input
                    value={totalQuestionsStr}
                    onChange={(e) => onDigitsChange(setTotalQuestionsStr, e.target.value)}
                    onBlur={() =>
                      onDigitsBlur(setTotalQuestionsStr, totalQuestionsStr, 20, 1, 200)
                    }
                    placeholder="20"
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs opacity-70">Countdown (seconds)</div>
                  <Input
                    value={countdownSecondsStr}
                    onChange={(e) => onDigitsChange(setCountdownSecondsStr, e.target.value)}
                    onBlur={() =>
                      onDigitsBlur(setCountdownSecondsStr, countdownSecondsStr, 5, 0, 60)
                    }
                    placeholder="5"
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs opacity-70">Answer time (seconds)</div>
                  <Input
                    value={answerSecondsStr}
                    onChange={(e) => onDigitsChange(setAnswerSecondsStr, e.target.value)}
                    onBlur={() =>
                      onDigitsBlur(setAnswerSecondsStr, answerSecondsStr, 20, 5, 120)
                    }
                    placeholder="20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Audio mode</div>
                <select
                  className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={audioMode}
                  onChange={(e) => setAudioMode(e.target.value as AudioMode)}
                >
                  <option value="display">TV display only</option>
                  <option value="phones">Phones only</option>
                  <option value="both">Both</option>
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">Packs</div>
                  {!mustShowPackPicker ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectPacks((v) => !v)}
                    >
                      {selectPacks ? "Selecting packs" : "Select packs"}
                    </Button>
                  ) : (
                    <div className="text-xs opacity-70">Per pack needs pack selection</div>
                  )}
                </div>

                <div className="text-sm opacity-80">
                  {mustShowPackPicker
                    ? "Per pack needs you to pick packs and set counts."
                    : selectPacks
                      ? "Select the packs you want to use."
                      : "Use all active packs by default."}
                </div>

                <div className="text-xs opacity-70">
                  {packsLoading ? "Loading packs…" : `${packs.length} active packs available`}
                </div>

                {packsError ? (
                  <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
                    {packsError}
                  </div>
                ) : null}

                {showPackPicker ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Select packs</div>
                    <div className="text-sm opacity-80">
                      Tap packs to include them.
                      {selectionStrategy === "per_pack"
                        ? " Set a count for at least one selected pack."
                        : ""}
                    </div>

                    <div className="space-y-2">
                      {packs.map((p) => {
                        const selected = Boolean(selectedPacks[p.id])
                        return (
                          <div
                            key={p.id}
                            className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                              selected
                                ? "border-[var(--foreground)]"
                                : "border-[var(--border)] opacity-80"
                            }`}
                            onClick={() => togglePack(p.id)}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">
                                {p.display_name}
                              </div>
                              <div className="text-xs opacity-70">{p.round_type}</div>
                            </div>

                            {selectionStrategy === "per_pack" ? (
                              <div className="w-24" onClick={(e) => e.stopPropagation()}>
                                <Input
                                  value={perPackCounts[p.id] ?? ""}
                                  onChange={(e) => onPerPackChange(p.id, e.target.value)}
                                  onBlur={() => onPerPackBlur(p.id)}
                                  placeholder="0"
                                />
                              </div>
                            ) : (
                              <div className="text-xs opacity-60">n/a</div>
                            )}
                          </div>
                        )
                      })}

                      {packs.length === 0 && !packsLoading ? (
                        <div className="text-sm opacity-80">No active packs found.</div>
                      ) : null}
                    </div>

                    <div className="text-sm opacity-80">
                      You can keep this closed when you use all packs.
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm opacity-90">
                    You are using all active packs. Press Select packs if you want to narrow it down.
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button onClick={createRoom} disabled={creating || packsLoading}>
                {creating ? "Creating…" : "Create room"}
              </Button>

              <Link href="/" className="text-sm opacity-80 hover:underline">
                Back to home
              </Link>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  )
}