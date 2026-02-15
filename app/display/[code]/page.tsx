"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"

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
      // ignore
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
          body: JSON.stringify({ code }),
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

  const audioMode = String(state?.audioMode ?? "display")
  const shouldPlayOnDisplay = audioMode === "display" || audioMode === "both"

  useEffect(() => {
    const q = state?.question
    if (!q) return
    if (!shouldPlayOnDisplay) return
    if (!audioEnabled) return
    if (q.roundType !== "audio") return
    if (state?.stage !== "open") return
    if (!q.audioUrl) return
    if (playedForQ === q.id) return
    setPlayedForQ(q.id)
    playClip().catch(() => {})
  }, [state, audioEnabled, playedForQ, shouldPlayOnDisplay])

  const scoreboard = useMemo(() => {
    const players = state?.players ?? []
    return [...players].sort((a: any, b: any) => b.score - a.score)
  }, [state])

  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const joinUrl = useMemo(() => {
    if (!code || !origin) return ""
    return `${origin}/join?code=${code}`
  }, [code, origin])

  if (!code) {
    return <div style={{ padding: 16 }}>Missing room code in the URL.</div>
  }
  if (!state) return null

  const showJoin = state.phase === "lobby"
  const q = state.question
  const isAudioQ = q?.roundType === "audio"
  const isPictureQ = q?.roundType === "picture"
  const isTextQ = q?.answerType === "text"

  const status =
    state.stage === "countdown"
      ? "Get ready"
      : state.stage === "open"
      ? "Answer now"
      : state.stage === "wait"
      ? "Waiting for answers"
      : state.stage === "reveal"
      ? "Reveal"
      : ""

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Room {code}</h1>

      {showJoin && joinUrl && (
        <div style={{ marginBottom: 10 }}>
          <div>Join at: <a href={joinUrl}>{joinUrl}</a></div>
          <div style={{ marginTop: 10 }}>
            <div>Scan to join</div>
            <QRCodeSVG value={joinUrl} />
          </div>
        </div>
      )}

      {shouldPlayOnDisplay && !audioEnabled && (
        <button onClick={unlockAudio} style={{ padding: 10, borderRadius: 8, border: "1px solid #111" }}>
          Enable audio
        </button>
      )}

      {state.phase === "lobby" && <p>Waiting for host to start.</p>}
      {state.phase === "finished" && <p>Game finished.</p>}

      <audio ref={audioRef} />

      {q && (
        <div style={{ marginTop: 16 }}>
          <div style={{ minHeight: 24, marginBottom: 8, color: "#555" }}>{status}</div>

          {isPictureQ && q.imageUrl && (
            <div style={{ marginBottom: 12 }}>
              <img
                src={q.imageUrl}
                alt="Question image"
                style={{ maxWidth: "100%", height: "auto", borderRadius: 12, border: "1px solid #ddd" }}
              />
            </div>
          )}

          <h2>{q.text}</h2>

          {isAudioQ && audioMode === "phones" && <p>Audio plays on phones for this game.</p>}

          {isAudioQ && shouldPlayOnDisplay && audioEnabled && (
            <button onClick={() => playClip()} style={{ padding: 10, borderRadius: 8, border: "1px solid #111" }}>
              Play clip
            </button>
          )}

          {!isTextQ && Array.isArray(q.options) && q.options.length > 0 && (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {q.options.map((opt: string, i: number) => {
                const isCorrect = state.reveal && i === state.reveal.answerIndex
                return (
                  <div
                    key={i}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      background: isCorrect ? "#e9ffe9" : "#fff",
                    }}
                  >
                    {opt}
                  </div>
                )
              })}
            </div>
          )}

          {isTextQ && <p>Type your answer on your phone.</p>}

          {state.reveal && (
            <div style={{ marginTop: 14 }}>
              {!isTextQ && state.reveal.answerIndex !== null && Array.isArray(q.options) && q.options[state.reveal.answerIndex] && (
                <p>
                  Correct: {q.options[state.reveal.answerIndex]}
                </p>
              )}

              {isTextQ && state.reveal.answerText && (
                <p>
                  Correct: {state.reveal.answerText}
                </p>
              )}

              {state.reveal.explanation && <p>{state.reveal.explanation}</p>}
            </div>
          )}
        </div>
      )}

      <h3 style={{ marginTop: 20 }}>Scoreboard</h3>
      <div style={{ display: "grid", gap: 6 }}>
        {scoreboard.map((p: any) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #eee", paddingBottom: 6 }}>
            <div>{p.name}</div>
            <div>{p.score}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
