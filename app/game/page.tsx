"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { loadPartyState, clearPartyState } from "../../lib/storage"
import { questions, Question } from "../../data/questions"

type ScoreMap = Record<string, number>
type Phase = "handoff" | "question" | "feedback"

const HANDOFF_SECONDS = 3

function shuffle<T>(arr: T[]) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy
}

export default function GamePage() {
  const router = useRouter()

  const [ready, setReady] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)

  const [players, setPlayers] = useState<string[]>([])
  const [quiz, setQuiz] = useState<Question[]>([])
  const [scores, setScores] = useState<ScoreMap>({})
  const scoresRef = useRef<ScoreMap>({})

  const [roundsPerTeam, setRoundsPerTeam] = useState(1)

  const [qIndex, setQIndex] = useState(0)
  const [turnIndex, setTurnIndex] = useState(0)

  const [phase, setPhase] = useState<Phase>("handoff")
  const [countdown, setCountdown] = useState(HANDOFF_SECONDS)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  useEffect(() => {
    scoresRef.current = scores
  }, [scores])

  useEffect(() => {
    const state = loadPartyState()
    if (!state) {
      router.push("/")
      return
    }

    const requiredCount = state.players.length * Math.max(1, state.roundsPerTeam)

    const packFilter = (q: Question) => {
      if (state.pack === "all") return true
      return q.packs.includes("general")
    }

    const filtered = questions.filter(packFilter)

    if (filtered.length < requiredCount) {
      setSetupError(
        `You asked for ${state.roundsPerTeam} rounds with ${state.players.length} teams, which needs ${requiredCount} questions. This pack has ${filtered.length}.`
      )
      setPlayers(state.players)
      setRoundsPerTeam(state.roundsPerTeam)
      setReady(true)
      return
    }

    const picked = shuffle(filtered).slice(0, requiredCount)

    const initialScores: ScoreMap = {}
    state.players.forEach(p => (initialScores[p] = 0))

    setPlayers(state.players)
    setRoundsPerTeam(state.roundsPerTeam)
    setQuiz(picked)
    setScores(initialScores)
    scoresRef.current = initialScores

    setQIndex(0)
    setTurnIndex(0)
    setSelectedIndex(null)
    setPhase("handoff")

    setReady(true)
  }, [router])

  const currentPlayer = useMemo(() => players[turnIndex] ?? "", [players, turnIndex])
  const currentQuestion = useMemo(() => quiz[qIndex], [quiz, qIndex])

  const roundNumber = useMemo(() => {
    if (players.length === 0) return 1
    return Math.floor(qIndex / players.length) + 1
  }, [qIndex, players.length])

  useEffect(() => {
    if (phase !== "handoff") return
    let t = HANDOFF_SECONDS
    setCountdown(t)

    const id = setInterval(() => {
      t -= 1
      setCountdown(t)
      if (t <= 0) {
        clearInterval(id)
        setPhase("question")
      }
    }, 1000)

    return () => clearInterval(id)
  }, [phase, qIndex, turnIndex])

  function chooseAnswer(index: number) {
    if (phase !== "question") return
    setSelectedIndex(index)
    setPhase("feedback")

    const correct = index === currentQuestion.answerIndex
    if (!correct) return

    setScores(prev => {
      const updated = { ...prev, [currentPlayer]: (prev[currentPlayer] ?? 0) + 1 }
      scoresRef.current = updated
      return updated
    })
  }

  function next() {
    const nextQ = qIndex + 1
    const nextTurn = (turnIndex + 1) % players.length

    if (nextQ >= quiz.length) {
      sessionStorage.setItem("mtq_last_scores", JSON.stringify(scoresRef.current))
      sessionStorage.setItem("mtq_last_players", JSON.stringify(players))
      router.push("/results")
      return
    }

    setQIndex(nextQ)
    setTurnIndex(nextTurn)
    setSelectedIndex(null)
    setPhase("handoff")
  }

  function quit() {
    clearPartyState()
    router.push("/")
  }

  if (!ready) return null

  if (setupError) {
    return (
      <main style={{ maxWidth: 720, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 22 }}>Not enough questions yet</h1>
        <p style={{ lineHeight: 1.4 }}>{setupError}</p>
        <p style={{ lineHeight: 1.4 }}>Reduce rounds on the setup screen or add more questions to the pack.</p>
        <button onClick={quit} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #ccc" }}>
          Back
        </button>
      </main>
    )
  }

  if (!currentQuestion) return null

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, color: "#555" }}>
            Round {roundNumber} of {roundsPerTeam}
          </div>
          <div style={{ fontSize: 14, color: "#555" }}>
            Question {qIndex + 1} of {quiz.length}
          </div>
          <div style={{ fontSize: 18, marginTop: 4 }}>Team: {currentPlayer}</div>
        </div>
        <button onClick={quit} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #ccc" }}>
          Quit
        </button>
      </div>

      {phase === "handoff" && (
        <div style={{ marginTop: 24, padding: 16, borderRadius: 12, border: "1px solid #ccc", background: "white" }}>
          <h1 style={{ fontSize: 22, marginTop: 0 }}>Pass the device</h1>
          <p style={{ marginBottom: 0, lineHeight: 1.4 }}>
            Next up: {currentPlayer}. Question reveals in {countdown}.
          </p>
        </div>
      )}

      {phase !== "handoff" && (
        <>
          <h1 style={{ fontSize: 22, marginTop: 18, lineHeight: 1.3 }}>{currentQuestion.text}</h1>

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {currentQuestion.options.map((opt, i) => {
              const showFeedback = phase === "feedback"
              const isCorrect = showFeedback && i === currentQuestion.answerIndex
              const isWrongPick = showFeedback && selectedIndex === i && i !== currentQuestion.answerIndex

              return (
                <button
                  key={opt}
                  onClick={() => chooseAnswer(i)}
                  disabled={phase !== "question"}
                  style={{
                    textAlign: "left",
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid #ccc",
                    background: isCorrect ? "#e9ffe9" : isWrongPick ? "#ffe9e9" : "white",
                    cursor: phase === "question" ? "pointer" : "default"
                  }}
                >
                  {opt}
                </button>
              )
            })}
          </div>

          {phase === "feedback" && (
            <div style={{ marginTop: 16, padding: 12, borderRadius: 10, border: "1px solid #ccc", background: "white" }}>
              <div style={{ fontSize: 16 }}>
                {selectedIndex === currentQuestion.answerIndex ? "Correct." : "Not quite."}
              </div>
              <div style={{ marginTop: 8, color: "#333", lineHeight: 1.4 }}>{currentQuestion.explanation}</div>
              <button
                onClick={next}
                style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid #ccc" }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Scoreboard</h2>
        <div style={{ display: "grid", gap: 6 }}>
          {players.map(p => (
            <div key={p} style={{ display: "flex", justifyContent: "space-between" }}>
              <div>{p}</div>
              <div>{scores[p] ?? 0}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
