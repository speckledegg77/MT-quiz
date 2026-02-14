"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"

type RoomState = any

export default function DisplayPage() {
  const params = useParams<{ code?: string }>()
  const code = String(params?.code ?? "").toUpperCase()

  const [state, setState] = useState<RoomState | null>(null)
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [playedForQ, setPlayedForQ] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  async function unlockAudio() {
    setAudioEnabled(true)
  }

  async function playClip() {
    const q = state?.question
    const el = audioRef.current
    if (!q?.audioUrl || !el) return

    try {
      el.pause()
      el.src = q.audioUrl
      el.load()
      await el.play()
    } catch {
    }
  }

  useEffect(() => {
    if (!code) return

    let cancelled = false

    async function tick() {
      const res = await fetch(`/api/room/state?code=${code}`, { cache: "no-store" })
      const data = await res.json()
      if (!cancelled) setState(data)

      if (data?.stage === "needs_advance") {
        await fetch("/api/room/advance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code })
        })
      }
    }

    tick()
    const id = setInterval(tick, 500)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [code])

  useEffect(() => {
    const q = state?.question
    if (!q) return
    if (!audioEnabled) return
    if (q.roundType !== "audio") return
    if (state.stage !== "open") return
    if (!q.audioUrl) return
    if (playedForQ === q.id) return

    setPlayedForQ(q.id)
    playClip().catch(() => {})
  }, [state, audioEnabled, playedForQ])

  const scoreboard = useMemo(() => {
    const players = state?.players ?? []
    return [...players].sort((a: any, b: any) => b.score - a.score)
  }, [state])

  const joinUrl = typeof window !== "undefined" && code ? `${window.location.origin}/join?code=${code}` : ""

  if (!code) {
    return (
      <main style={{ maxWidth: 1100, margin: "20px auto", padding: 16, fontFamily: "system-ui" }}>
        <p>Missing room code in the URL.</p>
      </main>
    )
  }

  if (!state) return null

  const isAudioQ = state?.question?.roundType === "audio"

  return (
    <main style={{ maxWidth: 1100, margin: "20px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 34, marginBottom: 6 }}>Room {code}</h1>
      <p style={{ marginTop: 0, color: "#555" }}>Join at: {joinUrl}</p>

      {!audioEnabled && (
        <button
          onClick={unlockAudio}
          style={{ padding: "12px 16px", border: "1px solid #ccc", borderRadius: 10, marginBottom: 16 }}
        >
          Enable audio
        </button>
      )}

      <audio ref={audioRef} preload="auto" />

      {state.phase === "lobby" && <p>Waiting for host to start.</p>}
      {state.phase === "finished" && <p>Game finished.</p>}

      {state.question && (
        <>
          <div style={{ fontSize: 18, color: "#555" }}>
            {state.stage === "countdown" && "Get ready"}
            {state.stage === "open" && "Answer now"}
            {state.stage === "wait" && "Waiting for answers"}
            {state.stage === "reveal" && "Reveal"}
          </div>

          <h2 style={{ fontSize: 30, lineHeight: 1.2 }}>{state.question.text}</h2>

          {isAudioQ && audioEnabled && (
            <div style={{ marginTop: 12 }}>
              <button
                onClick={playClip}
                style={{ padding: "10px 14px", border: "1px solid #ccc", borderRadius: 10 }}
              >
                Play clip
              </button>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            {state.question.options.map((opt: string, i: number) => {
              const isCorrect = state.reveal && i === state.reveal.answerIndex
              return (
                <div
                  key={`${state.question.id}-${i}`}
                  style={{
                    padding: 14,
                    border: "1px solid #ccc",
                    borderRadius: 12,
                    background: isCorrect ? "#e9ffe9" : "white"
                  }}
                >
                  {opt}
                </div>
              )
            })}
          </div>

          {state.reveal && (
            <div style={{ marginTop: 14, padding: 12, border: "1px solid #ccc", borderRadius: 12 }}>
              <p style={{ marginTop: 0, fontSize: 18 }}>
                Correct: {state.question.options[state.reveal.answerIndex]}
              </p>
              <p style={{ marginBottom: 0 }}>{state.reveal.explanation}</p>
            </div>
          )}
        </>
      )}

      <section style={{ marginTop: 18 }}>
        <h3 style={{ fontSize: 20, marginBottom: 8 }}>Scoreboard</h3>
        <div style={{ display: "grid", gap: 6 }}>
          {scoreboard.map((p: any) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 18 }}>
              <div>{p.name}</div>
              <div>{p.score}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
