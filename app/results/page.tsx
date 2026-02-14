"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { loadPartyState, clearPartyState } from "../../lib/storage"

type ScoreMap = Record<string, number>

export default function ResultsPage() {
  const router = useRouter()
  const [players, setPlayers] = useState<string[]>([])
  const [scores, setScores] = useState<ScoreMap>({})

  useEffect(() => {
    const state = loadPartyState()
    if (!state) {
      router.push("/")
      return
    }
    const p = sessionStorage.getItem("mtq_last_players")
    const s = sessionStorage.getItem("mtq_last_scores")
    if (p) setPlayers(JSON.parse(p))
    if (s) setScores(JSON.parse(s))
  }, [router])

  const ranked = useMemo(() => {
    return [...players]
      .map(name => ({ name, score: scores[name] ?? 0 }))
      .sort((a, b) => b.score - a.score)
  }, [players, scores])

  function playAgain() {
    router.push("/game")
  }

  function newGame() {
    clearPartyState()
    router.push("/")
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Results</h1>

      <div style={{ marginTop: 16, padding: 12, borderRadius: 10, border: "1px solid #ccc", background: "white" }}>
        {ranked.map((r, idx) => (
          <div key={r.name} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
            <div>
              {idx + 1}. {r.name}
            </div>
            <div>{r.score}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={playAgain} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #ccc" }}>
          Play again (same setup)
        </button>
        <button onClick={newGame} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #ccc" }}>
          New setup
        </button>
      </div>
    </main>
  )
}
