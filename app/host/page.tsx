"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"

type AudioMode = "display" | "phones" | "both"

type PackInfo = {
  id: string
  label: string
  questionCount: number
  audioCount: number
}

type RoundRequest = { packId: string; count: number }

export default function HostCreatePage() {
  const router = useRouter()

  const [countdownSeconds, setCountdownSeconds] = useState(3)
  const [answerSeconds, setAnswerSeconds] = useState(60)
  const [revealDelaySeconds, setRevealDelaySeconds] = useState(2)
  const [revealSeconds, setRevealSeconds] = useState(5)
  const [audioMode, setAudioMode] = useState<AudioMode>("display")

  const [packs, setPacks] = useState<PackInfo[]>([])
  const [selectedPacks, setSelectedPacks] = useState<string[]>([])
  const [packCounts, setPackCounts] = useState<Record<string, number>>({})

  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingPacks, setLoadingPacks] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoadingPacks(true)
      setError(null)

      try {
        const res = await fetch("/api/packs", { cache: "no-store" })
        const data = await res.json()
        if (cancelled) return

        const list: PackInfo[] = Array.isArray(data?.packs) ? data.packs : []
        setPacks(list)

        // Pick defaults on first load
        if (list.length > 0) {
          setSelectedPacks(prev => {
            if (prev.length > 0) return prev
            return [list[0].id]
          })

          setPackCounts(prev => {
            const next = { ...prev }
            for (const p of list) {
              if (next[p.id] == null) {
                const def = Math.min(10, Math.max(1, Number(p.questionCount || 10)))
                next[p.id] = def
              }
            }
            return next
          })
        }
      } catch {
        if (!cancelled) setError("Could not load pack list")
      } finally {
        if (!cancelled) setLoadingPacks(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  function togglePack(id: string) {
    setSelectedPacks(prev => {
      const on = prev.includes(id)
      if (on) return prev.filter(x => x !== id)
      return [...prev, id]
    })

    setPackCounts(prev => {
      if (prev[id] != null) return prev
      return { ...prev, [id]: 10 }
    })
  }

  function setCountForPack(id: string, value: number, maxForPack: number) {
    const n = Math.max(1, Math.floor(Number(value)))
    const clamped = Math.min(n, Math.max(1, Math.floor(Number(maxForPack || n))))
    setPackCounts(prev => ({ ...prev, [id]: clamped }))
  }

  const rounds: RoundRequest[] = useMemo(() => {
    const map = new Map(packs.map(p => [p.id, p.questionCount]))
    return selectedPacks
      .map(packId => {
        const count = Number(packCounts[packId] ?? 0)
        const max = Number(map.get(packId) ?? count)
        const safe = Math.min(Math.max(1, Math.floor(count)), Math.max(1, Math.floor(max || count)))
        return { packId, count: safe }
      })
      .filter(r => r.packId && r.count > 0)
  }, [selectedPacks, packCounts, packs])

  const totalQuestions = useMemo(() => {
    return rounds.reduce((sum, r) => sum + r.count, 0)
  }, [rounds])

  async function createRoom() {
    setError(null)

    if (rounds.length === 0) {
      setError("Pick at least one pack")
      return
    }

    const res = await fetch("/api/room/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rounds,
        selectedPacks: rounds.map(r => r.packId),
        questionCount: totalQuestions,
        countdownSeconds,
        answerSeconds,
        revealDelaySeconds,
        revealSeconds,
        audioMode,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? "Could not create room")
      return
    }

    setCode(data.code)
  }

  async function startGame() {
    if (!code) return

    await fetch("/api/room/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })

    router.push(`/display/${code}`)
  }

  function resetRoom() {
    setCode(null)
    setError(null)
  }

  const origin = typeof window !== "undefined" ? window.location.origin : ""

  const joinUrl = useMemo(() => {
    if (!code || !origin) return ""
    return `${origin}/join?code=${code}`
  }, [code, origin])

  const displayUrl = useMemo(() => {
    if (!code || !origin) return ""
    return `${origin}/display/${code}`
  }, [code, origin])

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <h1>Host</h1>

      {code && (
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button onClick={resetRoom} style={{ padding: "10px 14px" }}>
            Create new room
          </button>

          <button onClick={startGame} style={{ padding: "10px 14px" }}>
            Start game
          </button>
        </div>
      )}

      {!code && (
        <>
          <h2>Packs and question counts</h2>

          {loadingPacks && <p>Loading packs…</p>}

          {!loadingPacks && packs.length === 0 && (
            <p>No packs found in the database. Add packs and questions via the admin import page.</p>
          )}

          {!loadingPacks && packs.length > 0 && (
            <div style={{ display: "grid", gap: 10 }}>
              {packs.map(p => {
                const checked = selectedPacks.includes(p.id)
                const value = packCounts[p.id] ?? Math.min(10, Math.max(1, p.questionCount || 10))

                return (
                  <div
                    key={p.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 110px",
                      gap: 10,
                      alignItems: "center",
                      padding: 10,
                      border: "1px solid #e5e5e5",
                      borderRadius: 10,
                    }}
                  >
                    <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePack(p.id)}
                      />
                      <span>
                        {p.label} ({p.questionCount} q{p.questionCount === 1 ? "" : "s"}
                        {p.audioCount > 0 ? `, ${p.audioCount} audio` : ""})
                      </span>
                    </label>

                    <div style={{ display: "grid", gap: 6 }}>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, p.questionCount)}
                        value={value}
                        disabled={!checked}
                        onChange={e => setCountForPack(p.id, Number(e.target.value), p.questionCount)}
                        style={{
                          width: "100%",
                          padding: 10,
                          border: "1px solid #ccc",
                          borderRadius: 8,
                        }}
                      />
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        max {Math.max(1, p.questionCount)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <p style={{ marginTop: 12 }}>
            Total questions: {totalQuestions}
          </p>

          <h2>Audio playback</h2>

          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="radio"
                name="audioMode"
                checked={audioMode === "display"}
                onChange={() => setAudioMode("display")}
              />
              Play audio on TV display
            </label>

            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="radio"
                name="audioMode"
                checked={audioMode === "phones"}
                onChange={() => setAudioMode("phones")}
              />
              Play audio on phones
            </label>

            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="radio"
                name="audioMode"
                checked={audioMode === "both"}
                onChange={() => setAudioMode("both")}
              />
              Play audio on both
            </label>
          </div>

          <h2>Timing</h2>

          <label style={{ display: "block", marginTop: 10 }}>
            Countdown seconds
            <input
              type="number"
              value={countdownSeconds}
              min={0}
              onChange={e => setCountdownSeconds(Number(e.target.value))}
              style={{ display: "block", width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8, marginTop: 6 }}
            />
          </label>

          <label style={{ display: "block", marginTop: 10 }}>
            Max answer seconds
            <input
              type="number"
              value={answerSeconds}
              min={1}
              onChange={e => setAnswerSeconds(Number(e.target.value))}
              style={{ display: "block", width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8, marginTop: 6 }}
            />
          </label>

          <label style={{ display: "block", marginTop: 10 }}>
            Wait before reveal
            <input
              type="number"
              value={revealDelaySeconds}
              min={0}
              onChange={e => setRevealDelaySeconds(Number(e.target.value))}
              style={{ display: "block", width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8, marginTop: 6 }}
            />
          </label>

          <label style={{ display: "block", marginTop: 10 }}>
            Reveal seconds
            <input
              type="number"
              value={revealSeconds}
              min={0}
              onChange={e => setRevealSeconds(Number(e.target.value))}
              style={{ display: "block", width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8, marginTop: 6 }}
            />
          </label>

          <div style={{ marginTop: 14 }}>
            <button onClick={createRoom} style={{ padding: "10px 14px" }}>
              Create room
            </button>
          </div>

          {error && (
            <div style={{ marginTop: 12, padding: 10, background: "#fee", border: "1px solid #f99", borderRadius: 10 }}>
              {error}
            </div>
          )}
        </>
      )}

      {code && (
        <section style={{ marginTop: 14 }}>
          <p>
            Room code: <b>{code}</b>
          </p>

          <p>
            Players join at:
            <br />
            <a href={joinUrl}>{joinUrl}</a>
          </p>

          <p>
            TV display:
            <br />
            <a href={displayUrl}>{displayUrl}</a>
          </p>

          <p>
            Audio mode: {audioMode}. Packs: {rounds.map(r => `${r.packId} (${r.count})`).join(", ")}.
          </p>

          {joinUrl && (
            <div style={{ marginTop: 10 }}>
              <p>Scan to join</p>
              <QRCodeSVG value={joinUrl} size={180} />
            </div>
          )}
        </section>
      )}
    </main>
  )
}
