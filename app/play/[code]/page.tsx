"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import type { CSSProperties } from "react"

type RoomState = any

export default function PlayerPage() {
  const params = useParams<{ code?: string }>()
  const code = String(params?.code ?? "").toUpperCase()

  const [state, setState] = useState<RoomState | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [lastQuestionId, setLastQuestionId] = useState<string | null>(null)

  const [isDark, setIsDark] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [playedForQ, setPlayedForQ] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const m = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => setIsDark(Boolean(m.matches))
    apply()
    m.addEventListener("change", apply)
    return () => m.removeEventListener("change", apply)
  }, [])

  useEffect(() => {
    if (!code) return
    setPlayerId(localStorage.getItem(`mtq_player_${code}`))
  }, [code])

  useEffect(() => {
    if (!code) return
    let cancelled = false

    async function tick() {
      const res = await fetch(`/api/room/state?code=${code}`, { cache: "no-store" })
      const data = await res.json()
      if (!cancelled) setState(data)
    }

    tick()
    const id = setInterval(tick, 500)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [code])

  useEffect(() => {
    const qid = state?.question?.id ?? null
    if (!qid) return

    if (qid !== lastQuestionId) {
      setLastQuestionId(qid)
      setSelectedIndex(null)
    }
  }, [state?.question?.id, lastQuestionId])

  const audioMode = String(state?.audioMode ?? "display")
  const shouldPlayOnPhone = audioMode === "phones" || audioMode === "both"

  const canAnswer = useMemo(() => {
    return state?.stage === "open" && state?.question?.id && selectedIndex === null
  }, [state, selectedIndex])

  async function answer(optionIndex: number) {
    if (!playerId || !state?.question?.id) return
    if (!canAnswer) return

    setSelectedIndex(optionIndex)

    await fetch("/api/room/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, playerId, questionId: state.question.id, optionIndex })
    }).catch(() => {})
  }

  const theme = useMemo(() => {
    if (isDark) {
      return {
        pageBg: "#0b0f14",
        text: "#f3f4f6",
        muted: "#a1a1aa",
        border: "#334155",
        btnBg: "#111827",
        btnText: "#f9fafb",
        selectedBg: "#064e3b",
        selectedText: "#ecfdf5",
        correctBg: "#065f46",
        correctText: "#ecfdf5",
        wrongBg: "#7f1d1d",
        wrongText: "#fff1f2"
      }
    }

    return {
      pageBg: "#ffffff",
      text: "#111111",
      muted: "#555555",
      border: "#bbbbbb",
      btnBg: "#ffffff",
      btnText: "#111111",
      selectedBg: "#e9ffe9",
      selectedText: "#111111",
      correctBg: "#e9ffe9",
      correctText: "#111111",
      wrongBg: "#ffe9e9",
      wrongText: "#111111"
    }
  }, [isDark])

  const pageStyle: CSSProperties = {
    maxWidth: 520,
    margin: "40px auto",
    padding: 16,
    fontFamily: "system-ui",
    background: theme.pageBg,
    color: theme.text,
    minHeight: "100vh",
    boxSizing: "border-box",
    colorScheme: isDark ? ("dark" as any) : ("light" as any)
  }

  async function enableAudio() {
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
    const q = state?.question
    if (!q) return
    if (!shouldPlayOnPhone) return
    if (!audioEnabled) return
    if (q.roundType !== "audio") return
    if (state.stage !== "open") return
    if (!q.audioUrl) return
    if (playedForQ === q.id) return

    setPlayedForQ(q.id)
    playClip().catch(() => {})
  }, [state, shouldPlayOnPhone, audioEnabled, playedForQ])

  if (!code) {
    return (
      <main style={pageStyle}>
        <p>Missing room code in the URL.</p>
      </main>
    )
  }

  if (!state) return null

  if (state.phase === "lobby") {
    return (
      <main style={pageStyle}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Room {code}</h1>
        <p>Joined. Waiting for the host to start the game.</p>

        {shouldPlayOnPhone && (
          <div style={{ marginTop: 14 }}>
            {!audioEnabled ? (
              <button
                onClick={enableAudio}
                style={{
                  padding: 12,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  background: theme.btnBg,
                  color: theme.btnText,
                  width: "100%"
                }}
              >
                Enable audio on this phone
              </button>
            ) : (
              <p style={{ color: theme.muted, marginTop: 10 }}>Audio enabled for this phone.</p>
            )}
          </div>
        )}
      </main>
    )
  }

  if (state.phase === "finished") {
    return (
      <main style={pageStyle}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Room {code}</h1>
        <p>The game has finished.</p>
      </main>
    )
  }

  const correctIndex = state?.reveal?.answerIndex ?? null
  const isAudioQ = state?.question?.roundType === "audio"

  return (
    <main style={pageStyle}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>Room {code}</h1>

      {state.stage === "countdown" && <p style={{ color: theme.muted }}>Get ready.</p>}

      {shouldPlayOnPhone && (
        <div style={{ marginBottom: 10 }}>
          {!audioEnabled ? (
            <button
              onClick={enableAudio}
              style={{
                padding: 12,
                border: `1px solid ${theme.border}`,
                borderRadius: 12,
                background: theme.btnBg,
                color: theme.btnText,
                width: "100%"
              }}
            >
              Enable audio on this phone
            </button>
          ) : (
            <p style={{ color: theme.muted, marginTop: 0 }}>Audio enabled.</p>
          )}
        </div>
      )}

      <audio ref={audioRef} preload="auto" />

      {state.question && (
        <>
          <h2 style={{ fontSize: 18, lineHeight: 1.3, color: theme.text }}>{state.question.text}</h2>

          {isAudioQ && shouldPlayOnPhone && audioEnabled && (
            <div style={{ marginTop: 10 }}>
              <button
                onClick={playClip}
                style={{
                  padding: 12,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  background: theme.btnBg,
                  color: theme.btnText,
                  width: "100%"
                }}
              >
                Play clip
              </button>
            </div>
          )}

          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {state.question.options.map((opt: string, i: number) => {
              const isSelected = selectedIndex === i
              const isCorrect = correctIndex !== null && i === correctIndex
              const isWrongSelected = correctIndex !== null && isSelected && !isCorrect

              let bg = theme.btnBg
              let fg = theme.btnText

              if (isSelected && correctIndex === null) {
                bg = theme.selectedBg
                fg = theme.selectedText
              }
              if (isCorrect) {
                bg = theme.correctBg
                fg = theme.correctText
              }
              if (isWrongSelected) {
                bg = theme.wrongBg
                fg = theme.wrongText
              }

              return (
                <button
                  key={`${state.question.id}-${i}`}
                  onClick={() => answer(i)}
                  disabled={!canAnswer && !isSelected}
                  style={{
                    padding: 14,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 12,
                    textAlign: "left",
                    background: bg,
                    color: fg,
                    fontSize: 18,
                    lineHeight: 1.25,
                    width: "100%",
                    touchAction: "manipulation"
                  }}
                >
                  {opt}
                </button>
              )
            })}
          </div>

          {selectedIndex !== null && correctIndex === null && (
            <p style={{ marginTop: 12, color: theme.muted }}>Answer locked in.</p>
          )}

          {correctIndex !== null && selectedIndex !== null && (
            <p style={{ marginTop: 12, color: theme.text }}>
              {selectedIndex === correctIndex ? "You got it right." : "You got it wrong."}
            </p>
          )}
        </>
      )}
    </main>
  )
}
