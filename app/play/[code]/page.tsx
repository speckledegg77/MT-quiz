"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"

type RoomState = any

export default function PlayerPage() {
  const params = useParams<{ code?: string }>()
  const code = String(params?.code ?? "").toUpperCase()

  const [state, setState] = useState<RoomState | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [lastQuestionId, setLastQuestionId] = useState<string | null>(null)

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

  if (!code) {
    return (
      <main style={{ maxWidth: 520, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
        <p>Missing room code in the URL.</p>
      </main>
    )
  }

  if (!state) return null

  if (state.phase === "lobby") {
    return (
      <main style={{ maxWidth: 520, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Room {code}</h1>
        <p>Joined. Waiting for the host to start the game.</p>
      </main>
    )
  }

  if (state.phase === "finished") {
    return (
      <main style={{ maxWidth: 520, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Room {code}</h1>
        <p>The game has finished.</p>
      </main>
    )
  }

  const correctIndex = state?.reveal?.answerIndex ?? null

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>Room {code}</h1>

      {state.stage === "countdown" && <p>Get ready.</p>}
      {state.stage === "wait" && <p>Waiting for reveal.</p>}

      {state.question && (
        <>
          <h2 style={{ fontSize: 18, lineHeight: 1.3 }}>{state.question.text}</h2>

          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {state.question.options.map((opt: string, i: number) => {
              const isSelected = selectedIndex === i
              const isCorrect = correctIndex !== null && i === correctIndex
              const isWrongSelected = correctIndex !== null && isSelected && !isCorrect

              let bg = "white"
              if (isSelected) bg = "#e9ffe9"
              if (isCorrect) bg = "#e9ffe9"
              if (isWrongSelected) bg = "#ffe9e9"

              return (
                <button
                  key={`${state.question.id}-${i}`}
                  onClick={() => answer(i)}
                  disabled={!canAnswer && !isSelected}
                  style={{
                    padding: 12,
                    border: "1px solid #ccc",
                    borderRadius: 10,
                    textAlign: "left",
                    background: bg
                  }}
                >
                  {opt}
                </button>
              )
            })}
          </div>

          {selectedIndex !== null && correctIndex === null && <p style={{ marginTop: 12 }}>Answer locked in.</p>}

          {correctIndex !== null && selectedIndex !== null && (
            <p style={{ marginTop: 12 }}>
              {selectedIndex === correctIndex ? "You got it right." : "You got it wrong."}
            </p>
          )}
        </>
      )}
    </main>
  )
}
