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

export default function HostCreatePage() {
  const router = useRouter()

  const [questionCount, setQuestionCount] = useState(20)
  const [countdownSeconds, setCountdownSeconds] = useState(3)
  const [answerSeconds, setAnswerSeconds] = useState(60)
  const [revealDelaySeconds, setRevealDelaySeconds] = useState(2)
  const [revealSeconds, setRevealSeconds] = useState(5)

  const [audioMode, setAudioMode] = useState<AudioMode>("display")

  const [packs, setPacks] = useState<PackInfo[]>([])
  const [selectedPacks, setSelectedPacks] = useState<string[]>(["general"])

  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingPacks, setLoadingPacks] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoadingPacks(true)
      try {
        const res = await fetch("/api/packs", { cache: "no-store" })
        const data = await res.json()
        if (cancelled) return

        const list: PackInfo[] = Array.isArray(data?.packs) ? data.packs : []
        setPacks(list)

        const ids = new Set(list.map(p => p.id))
        const filtered = selectedPacks.filter(p => ids.has(p))

        if (filtered.length > 0) {
          setSelectedPacks(filtered)
        } else if (list.length > 0) {
          setSelectedPacks([list[0].id])
        } else {
          setSelectedPacks(["general"])
        }
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

  async function createRoom() {
    setError(null)

    const packsToUse = selectedPacks.length ? selectedPacks : ["general"]

    const res = await fetch("/api/room/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionCount,
        countdownSeconds,
        answerSeconds,
        revealDelaySeconds,
        revealSeconds,
        audioMode,
        selectedPacks: packsToUse
      })
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
      body: JSON.stringify({ code })
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
    <main style={{ maxWidth: 860, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Host</h1>

      {code && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <button
            onClick={resetRoom}
            style={{ padding: "10px 12px", border: "1px solid #ccc", borderRadius: 10 }}
          >
            Create new room
          </button>

          <button
            onClick={startGame}
            style={{
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 10,
              marginLeft: "auto"
            }}
          >
            Start game
          </button>
        </div>
      )}

      {!code && (
        <>
          <div style={{ border: "1px solid #ccc", borderRadius: 12, padding: 12, marginBottom: 14 }}>
            <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 10 }}>Rounds to include</h2>

            {loadingPacks && <p style={{ marginTop: 0, color: "#555" }}>Loading rounds…</p>}

            {!loadingPacks && packs.length === 0 && (
              <p style={{ marginTop: 0, color: "#555" }}>
                No packs found in the question bank. Add packs in data/questions.ts.
              </p>
            )}

            {!loadingPacks && packs.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {packs.map(p => (
                  <label key={p.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
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
            )}

            <p style={{ marginBottom: 0, color: "#555", marginTop: 10 }}>
              These come from the packs fields in data/questions.ts.
            </p>
          </div>

          <div style={{ border: "1px solid #ccc", borderRadius: 12, padding: 12, marginBottom: 14 }}>
            <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 10 }}>Audio playback</h2>

            <label style={{ display: "block", marginBottom: 6 }}>
              <input
                type="radio"
                name="audioMode"
                checked={audioMode === "display"}
                onChange={() => setAudioMode("display")}
              />{" "}
              Play audio on TV display
            </label>

            <label style={{ display: "block", marginBottom: 6 }}>
              <input
                type="radio"
                name="audioMode"
                checked={audioMode === "phones"}
                onChange={() => setAudioMode("phones")}
              />{" "}
              Play audio on phones (remote friendly)
            </label>

            <label style={{ display: "block" }}>
              <input
                type="radio"
                name="audioMode"
                checked={audioMode === "both"}
                onChange={() => setAudioMode("both")}
              />{" "}
              Play audio on both
            </label>
          </div>

          <label style={{ display: "block", marginBottom: 10 }}>
            Total questions
            <input
              type="number"
              value={questionCount}
              onChange={e => setQuestionCount(Number(e.target.value))}
              style={{
                display: "block",
                width: "100%",
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 8,
                marginTop: 6
              }}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "block", marginBottom: 10 }}>
              Countdown seconds
              <input
                type="number"
                value={countdownSeconds}
                onChange={e => setCountdownSeconds(Number(e.target.value))}
                style={{
                  display: "block",
                  width: "100%",
                  padding: 10,
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  marginTop: 6
                }}
              />
            </label>

            <label style={{ display: "block", marginBottom: 10 }}>
              Max answer seconds
              <input
                type="number"
                value={answerSeconds}
                onChange={e => setAnswerSeconds(Number(e.target.value))}
                style={{
                  display: "block",
                  width: "100%",
                  padding: 10,
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  marginTop: 6
                }}
              />
            </label>

            <label style={{ display: "block", marginBottom: 10 }}>
              Wait before reveal
              <input
                type="number"
                value={revealDelaySeconds}
                onChange={e => setRevealDelaySeconds(Number(e.target.value))}
                style={{
                  display: "block",
                  width: "100%",
                  padding: 10,
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  marginTop: 6
                }}
              />
            </label>

            <label style={{ display: "block", marginBottom: 10 }}>
              Reveal seconds
              <input
                type="number"
                value={revealSeconds}
                onChange={e => setRevealSeconds(Number(e.target.value))}
                style={{
                  display: "block",
                  width: "100%",
                  padding: 10,
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  marginTop: 6
                }}
              />
            </label>
          </div>

          <button
            onClick={createRoom}
            style={{ padding: "12px 16px", border: "1px solid #ccc", borderRadius: 10, width: "100%" }}
          >
            Create room
          </button>

          {error && <p style={{ marginTop: 12, color: "crimson" }}>{error}</p>}
        </>
      )}

      {code && (
        <div style={{ border: "1px solid #ccc", borderRadius: 12, padding: 12 }}>
          <p style={{ marginTop: 0, fontSize: 18 }}>Room code: {code}</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, alignItems: "start" }}>
            <div>
              <p style={{ marginBottom: 6 }}>Players join at:</p>
              <p style={{ marginTop: 0 }}>
                <a href={joinUrl}>{joinUrl}</a>
              </p>

              <p style={{ marginBottom: 6 }}>TV display:</p>
              <p style={{ marginTop: 0 }}>
                <a href={displayUrl}>{displayUrl}</a>
              </p>

              <p style={{ marginBottom: 0, color: "#555" }}>
                Audio mode: {audioMode}. Packs: {selectedPacks.length ? selectedPacks.join(", ") : "general"}.
              </p>
            </div>

            {joinUrl && (
              <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
                <div style={{ border: "1px solid #ccc", borderRadius: 12, padding: 12, background: "white" }}>
                  <QRCodeSVG value={joinUrl} size={220} />
                </div>
                <div style={{ color: "#555" }}>Scan to join</div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
