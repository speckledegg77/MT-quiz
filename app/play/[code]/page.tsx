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
  const [preparedForQ, setPreparedForQ] = useState<string | null>(null)
  const [autoplayFailed, setAutoplayFailed] = useState(false)

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
      setPlayedForQ(null)
      setPreparedForQ(null)
      setAutoplayFailed(false)
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

  async function unlockAudio() {
    setAudioEnabled(true)
    setAutoplayFailed(false)

    try {
      const AnyWindow = window as any
      const Ctx = AnyWindow.AudioContext || AnyWindow.webkitAudioContext
      if (Ctx) {
        const ctx = new Ctx()
        await ctx.resume()

        const buf = ctx.createBuffer(1, 1, 22050)
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.connect(ctx.destination)
        src.start(0)
        src.stop(0.01)

        await new Promise(r => setTimeout(r, 20))
        await ctx.close()
      }
    } catch {
    }
  }

  function prepareClip() {
    const q = state?.question
    const el = audioRef.current
    if (!q?.audioUrl || !el) return
    if (preparedForQ === q.id) return

    try {
      el.pause()
      el.currentTime = 0
    } catch {
    }

    el.src = q.audioUrl
    el.preload = "auto"
    el.load()
    setPreparedForQ(q.id)
  }

  async function playClip(): Promise<boolean> {
    const q = state?.question
    const el = audioRef.current
    if (!q?.audioUrl || !el) return false

    try {
      if (preparedForQ !== q.id) {
        el.src = q.audioUrl
        el.preload = "auto"
        el.load()
        setPreparedForQ(q.id)
      }

      await el.play()
      return true
    } catch {
      return false
    }
  }

  const isAudioQ = state?.question?.roundType === "audio"
  const correctIndex = state?.reveal?.answerIndex ?? null

  useEffect(() => {
    if (!shouldPlayOnPhone) return
    if (!isAudioQ) return
    if (!state?.question?.audioUrl) return
    prepareClip()
  }, [shouldPlayOnPhone, isAudioQ, state?.question?.id, state?.question?.audioUrl])

  useEffect(() => {
    if (!shouldPlayOnPhone) return
    if (!audioEnabled) return
    if (!isAudioQ) return
    if (state?.stage !== "open") return
    if (!state?.question?.audioUrl) return
    if (playedForQ === state.question.id) return

    let cancelled = false

    async function attempt() {
      const ok = await playClip()
      if (cancelled) return

      if (ok) {
        setPlayedForQ(state.question.id)
        setAutoplayFailed(false)
        return
      }

      setAutoplayFailed(true)

      setTimeout(async () => {
        if (cancelled) return
        if (state?.stage !== "open") return
        const ok2 = await playClip()
        if (cancelled) return
        if (ok2) {
          setPlayedForQ(state.question.id)
          setAutoplayFailed(false)
        }
      }, 400)
    }

    attempt().catch(() => {})

    return () => {
      cancelled = true
    }
  }, [shouldPlayOnPhone, audioEnabled, isAudioQ, state?.stage, state?.question?.id, state?.question?.audioUrl, playedForQ])

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
                onClick={unlockAudio}
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

        <audio ref={audioRef} preload="auto" />
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

  return (
    <main style={pageStyle}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>Room {code}</h1>

      {state.stage === "countdown" && <p style={{ color: theme.muted }}>Get ready.</p>}

      {shouldPlayOnPhone && (
        <div style={{ marginBottom: 10 }}>
          {!audioEnabled ? (
            <button
              onClick={unlockAudio}
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
            <p style={{ color: theme.muted, marginTop: 0 }}>
              Audio enabled{autoplayFailed ? ". Tap Play clip if needed." : "."}
            </p>
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
                onClick={async () => {
                  setAutoplayFailed(false)
                  await playClip()
                }}
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
              {autoplayFailed && (
                <p style={{ marginTop: 8, color: theme.muted }}>
                  Your phone blocked autoplay. Tap Play clip.
                </p>
              )}
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
