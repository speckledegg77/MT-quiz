"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function HostCreatePage() {
  const router = useRouter()
  const [questionCount, setQuestionCount] = useState(20)
  const [countdownSeconds, setCountdownSeconds] = useState(3)
  const [answerSeconds, setAnswerSeconds] = useState(12)
  const [revealDelaySeconds, setRevealDelaySeconds] = useState(2)
  const [revealSeconds, setRevealSeconds] = useState(5)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function createRoom() {
    setError(null)
    const res = await fetch("/api/room/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionCount,
        countdownSeconds,
        answerSeconds,
        revealDelaySeconds,
        revealSeconds,
        pack: "general"
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

  const joinUrl = code ? `${typeof window !== "undefined" ? window.location.origin : ""}/join?code=${code}` : ""

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Host</h1>

      {!code && (
        <>
          <label style={{ display: "block", marginBottom: 10 }}>
            Total questions
            <input
              type="number"
              value={questionCount}
              onChange={e => setQuestionCount(Number(e.target.value))}
              style={{ display: "block", width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8, marginTop: 6 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            Countdown seconds
            <input
              type="number"
              value={countdownSeconds}
              onChange={e => setCountdownSeconds(Number(e.target.value))}
              style={{ display: "block", width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8, marginTop: 6 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            Answer seconds
            <input
              type="number"
              value={answerSeconds}
              onChange={e => setAnswerSeconds(Number(e.target.value))}
              style={{ display: "block", width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8, marginTop: 6 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            Wait before reveal (seconds)
            <input
              type="number"
              value={revealDelaySeconds}
              onChange={e => setRevealDelaySeconds(Number(e.target.value))}
              style={{ display: "block", width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8, marginTop: 6 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            Reveal time (seconds)
            <input
              type="number"
              value={revealSeconds}
              onChange={e => setRevealSeconds(Number(e.target.value))}
              style={{ display: "block", width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8, marginTop: 6 }}
            />
          </label>

          <button onClick={createRoom} style={{ padding: "12px 16px", border: "1px solid #ccc", borderRadius: 10, width: "100%" }}>
            Create room
          </button>

          {error && <p style={{ marginTop: 12, color: "crimson" }}>{error}</p>}
        </>
      )}

      {code && (
        <>
          <p style={{ fontSize: 18, marginBottom: 8 }}>Room code: {code}</p>
          <p style={{ marginTop: 0 }}>Players join at: {joinUrl}</p>

          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            <a href={`/display/${code}`}>Open TV display</a>
            <a href={`/join?code=${code}`}>Open join page</a>
          </div>

          <button onClick={startGame} style={{ marginTop: 16, padding: "12px 16px", border: "1px solid #ccc", borderRadius: 10, width: "100%" }}>
            Start game
          </button>
        </>
      )}
    </main>
  )
}
