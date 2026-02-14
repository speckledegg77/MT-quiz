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

type HostRound = {
  packId: string
  count: number
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 10,
  border: "1px solid #ccc",
  borderRadius: 8,
  marginTop: 6,
}

const selectStyle: React.CSSProperties = {
  padding: 8,
  borderRadius: 8,
  border: "1px solid #ccc",
}

const buttonBase: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #111",
  cursor: "pointer",
  userSelect: "none",
}

const buttonPrimary: React.CSSProperties = {
  ...buttonBase,
  background: "#111",
  color: "#fff",
}

const buttonSecondary: React.CSSProperties = {
  ...buttonBase,
  background: "#fff",
  color: "#111",
}

const buttonDanger: React.CSSProperties = {
  ...buttonBase,
  background: "#fff",
  color: "#b00020",
  border: "1px solid #b00020",
}

function withDisabled(style: React.CSSProperties, disabled: boolean): React.CSSProperties {
  if (!disabled) return style
  return { ...style, opacity: 0.5, cursor: "not-allowed" }
}

export default function HostCreatePage() {
  const router = useRouter()

  const [questionCount, setQuestionCount] = useState<number>(20)
  const [countdownSeconds, setCountdownSeconds] = useState<number>(3)
  const [answerSeconds, setAnswerSeconds] = useState<number>(60)
  const [revealDelaySeconds, setRevealDelaySeconds] = useState<number>(2)
  const [revealSeconds, setRevealSeconds] = useState<number>(5)
  const [audioMode, setAudioMode] = useState<AudioMode>("display")

  const [packs, setPacks] = useState<PackInfo[]>([])
  const [selectedPacks, setSelectedPacks] = useState<string[]>([])
  const [rounds, setRounds] = useState<HostRound[]>([])

  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingPacks, setLoadingPacks] = useState<boolean>(true)
  const [creating, setCreating] = useState<boolean>(false)

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

        const ids = new Set(list.map(p => p.id))

        setSelectedPacks(prev => {
          const filtered = prev.filter(p => ids.has(p))
          if (filtered.length > 0) return filtered
          if (list.length > 0) return [list[0].id]
          return []
        })

        setRounds(prev => prev.filter(r => ids.has(r.packId)))
      } catch {
        if (!cancelled) setError("Could not load round list")
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
      if (prev.includes(id)) return prev.filter(x => x !== id)
      return [...prev, id]
    })
  }

  function addRound() {
    const firstPack = packs[0]?.id ?? ""
    if (!firstPack) return
    const max = packs[0]?.questionCount ?? 10
    setRounds(prev => [...prev, { packId: firstPack, count: Math.min(10, max) }])
  }

  function removeRound(index: number) {
    setRounds(prev => prev.filter((_, i) => i !== index))
  }

  function updateRoundPack(index: number, packId: string) {
    setRounds(prev => prev.map((r, i) => (i === index ? { ...r, packId } : r)))
  }

  function updateRoundCount(index: number, count: number) {
    const safe = Math.max(1, Math.floor(Number(count)))
    setRounds(prev => prev.map((r, i) => (i === index ? { ...r, count: safe } : r)))
  }

  const roundsTotal = useMemo(() => {
    return rounds.reduce((sum, r) => sum + (Number.isFinite(r.count) ? r.count : 0), 0)
  }, [rounds])

  const roundsPacks = useMemo(() => {
    const s = new Set<string>()
    for (const r of rounds) {
      const pid = String(r.packId ?? "").trim()
      if (pid) s.add(pid)
    }
    return Array.from(s)
  }, [rounds])

  async function createRoom() {
    setError(null)
    setCreating(true)

    try {
      const usingRounds = rounds.length > 0

      const packsToUse = usingRounds
        ? roundsPacks
        : selectedPacks.length
          ? selectedPacks
          : packs.length
            ? [packs[0].id]
            : []

      const totalQuestions = usingRounds ? roundsTotal : questionCount

      const res = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionCount: totalQuestions,
          countdownSeconds,
          answerSeconds,
          revealDelaySeconds,
          revealSeconds,
          audioMode,
          selectedPacks: packsToUse,
          rounds,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Could not create room")
        return
      }

      setCode(data.code)
    } finally {
      setCreating(false)
    }
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

  const createDisabled = loadingPacks || creating || packs.length === 0

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1>Host</h1>

      {code && (
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <button type="button" onClick={resetRoom} style={buttonSecondary}>
            Create new room
          </button>
          <button type="button" onClick={startGame} style={buttonPrimary}>
            Start game
          </button>
        </div>
      )}

      {!code && (
        <>
          <h2>Rounds</h2>

          {loadingPacks && <p>Loading rounds…</p>}

          {!loadingPacks && packs.length === 0 && (
            <p>No packs found in the question bank. Add packs in Supabase.</p>
          )}

          {!loadingPacks && packs.length > 0 && (
            <>
              {rounds.length === 0 ? (
                <p>No rounds added yet.</p>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {rounds.map((r, index) => {
                    const pack = packs.find(p => p.id === r.packId)
                    const max = pack?.questionCount ?? 300

                    return (
                      <div
                        key={index}
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ minWidth: 90 }}>Round {index + 1}</div>

                        <select
                          value={r.packId}
                          onChange={e => updateRoundPack(index, e.target.value)}
                          style={selectStyle}
                        >
                          {packs.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.label} ({p.questionCount} qs)
                            </option>
                          ))}
                        </select>

                        <input
                          type="number"
                          min={1}
                          max={max}
                          value={r.count}
                          onChange={e => updateRoundCount(index, Number(e.target.value))}
                          style={{ ...selectStyle, width: 110 }}
                        />

                        <button type="button" onClick={() => removeRound(index)} style={buttonDanger}>
                          Remove
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" onClick={addRound} disabled={!packs.length} style={withDisabled(buttonSecondary, !packs.length)}>
                  Add round
                </button>

                <div>
                  Total from rounds: <strong>{roundsTotal}</strong>
                </div>
              </div>

              <hr style={{ margin: "18px 0" }} />

              <h2>Quick setup</h2>

              <p>Pick packs and a total question count.</p>

              <div style={{ display: "grid", gap: 6 }}>
                {packs.map(p => (
                  <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={selectedPacks.includes(p.id)}
                      onChange={() => togglePack(p.id)}
                    />
                    <span>
                      {p.label} ({p.questionCount} q{p.questionCount === 1 ? "" : "s"}
                      {p.audioCount > 0 ? `, ${p.audioCount} audio` : ""})
                    </span>
                  </label>
                ))}
              </div>

              <p>These come from the packs table in Supabase.</p>
            </>
          )}

          <h2>Audio playback</h2>
          <label style={{ display: "block", marginTop: 6 }}>
            <input
              type="radio"
              name="audioMode"
              checked={audioMode === "display"}
              onChange={() => setAudioMode("display")}
            />{" "}
            Play audio on TV display
          </label>
          <label style={{ display: "block", marginTop: 6 }}>
            <input
              type="radio"
              name="audioMode"
              checked={audioMode === "phones"}
              onChange={() => setAudioMode("phones")}
            />{" "}
            Play audio on phones (remote friendly)
          </label>
          <label style={{ display: "block", marginTop: 6 }}>
            <input
              type="radio"
              name="audioMode"
              checked={audioMode === "both"}
              onChange={() => setAudioMode("both")}
            />{" "}
            Play audio on both
          </label>

          <label style={{ display: "block", marginTop: 14 }}>
            Total questions
            <input
              type="number"
              value={questionCount}
              min={1}
              onChange={e => setQuestionCount(Number(e.target.value))}
              style={inputStyle}
            />
          </label>

          <label style={{ display: "block", marginTop: 10 }}>
            Countdown seconds
            <input
              type="number"
              value={countdownSeconds}
              min={0}
              onChange={e => setCountdownSeconds(Number(e.target.value))}
              style={inputStyle}
            />
          </label>

          <label style={{ display: "block", marginTop: 10 }}>
            Max answer seconds
            <input
              type="number"
              value={answerSeconds}
              min={1}
              onChange={e => setAnswerSeconds(Number(e.target.value))}
              style={inputStyle}
            />
          </label>

          <label style={{ display: "block", marginTop: 10 }}>
            Wait before reveal
            <input
              type="number"
              value={revealDelaySeconds}
              min={0}
              onChange={e => setRevealDelaySeconds(Number(e.target.value))}
              style={inputStyle}
            />
          </label>

          <label style={{ display: "block", marginTop: 10 }}>
            Reveal seconds
            <input
              type="number"
              value={revealSeconds}
              min={0}
              onChange={e => setRevealSeconds(Number(e.target.value))}
              style={inputStyle}
            />
          </label>

          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={createRoom}
              disabled={createDisabled}
              style={withDisabled(buttonPrimary, createDisabled)}
            >
              {creating ? "Creating…" : "Create room"}
            </button>
          </div>

          {error && (
            <div style={{ marginTop: 10, color: "crimson" }}>
              <strong>{error}</strong>
            </div>
          )}
        </>
      )}

      {code && (
        <div style={{ marginTop: 10 }}>
          <p>
            <strong>Room code:</strong> {code}
          </p>

          <p>
            <strong>Players join at:</strong>
            <br />
            <a href={joinUrl}>{joinUrl}</a>
          </p>

          <p>
            <strong>TV display:</strong>
            <br />
            <a href={displayUrl}>{displayUrl}</a>
          </p>

          <p>
            Audio mode: {audioMode}. Packs:{" "}
            {selectedPacks.length ? selectedPacks.join(", ") : packs.length ? packs[0].id : "none"}.
          </p>

          {joinUrl && (
            <div style={{ marginTop: 14 }}>
              <h3>Scan to join</h3>
              <QRCodeSVG value={joinUrl} size={192} />
            </div>
          )}
        </div>
      )}
    </main>
  )
}
