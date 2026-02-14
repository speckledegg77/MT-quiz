"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { savePartyState, PartyState } from "../lib/storage"

export default function HomePage() {
  const router = useRouter()
  const [nameInput, setNameInput] = useState("")
  const [players, setPlayers] = useState<string[]>([])
  const [pack, setPack] = useState<PartyState["pack"]>("all")
  const [roundsPerTeam, setRoundsPerTeam] = useState(5)

  const canStart = useMemo(() => players.length >= 2, [players])

  function addPlayer() {
    const name = nameInput.trim()
    if (!name) return
    if (players.some(p => p.toLowerCase() === name.toLowerCase())) {
      setNameInput("")
      return
    }
    setPlayers(prev => [...prev, name])
    setNameInput("")
  }

  function removePlayer(name: string) {
    setPlayers(prev => prev.filter(p => p !== name))
  }

  function startGame() {
    const state: PartyState = {
      players,
      pack,
      roundsPerTeam: Math.max(1, Math.min(20, roundsPerTeam))
    }
    savePartyState(state)
    router.push("/game")
  }

  const totalQuestions = players.length * Math.max(1, roundsPerTeam)

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Musical Theatre Quiz</h1>
      <p style={{ marginTop: 0, lineHeight: 1.4 }}>
        Add team names, pick settings, then play on this device.
      </p>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Teams</h2>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            placeholder="Type a team name"
            style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
            onKeyDown={e => {
              if (e.key === "Enter") addPlayer()
            }}
          />
          <button onClick={addPlayer} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #ccc" }}>
            Add
          </button>
        </div>

        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {players.map(p => (
            <button
              key={p}
              onClick={() => removePlayer(p)}
              style={{
                padding: "8px 10px",
                borderRadius: 999,
                border: "1px solid #ccc",
                background: "white",
                cursor: "pointer"
              }}
              title="Click to remove"
            >
              {p}
            </button>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Game settings</h2>

        <label style={{ display: "block", marginBottom: 10 }}>
          Question pack
          <select
            value={pack}
            onChange={e => setPack(e.target.value as PartyState["pack"])}
            style={{
              display: "block",
              width: "100%",
              padding: 10,
              borderRadius: 8,
              border: "1px solid #ccc",
              marginTop: 6
            }}
          >
            <option value="all">All questions</option>
            <option value="general">General trivia only</option>
          </select>
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          Rounds per team (1 to 20)
          <input
            type="number"
            value={roundsPerTeam}
            onChange={e => setRoundsPerTeam(Number(e.target.value))}
            style={{
              display: "block",
              width: "100%",
              padding: 10,
              borderRadius: 8,
              border: "1px solid #ccc",
              marginTop: 6
            }}
          />
        </label>

        <p style={{ marginTop: 0, color: "#555" }}>
          Total questions this game: {totalQuestions}
        </p>
      </section>

      <button
        onClick={startGame}
        disabled={!canStart}
        style={{
          marginTop: 18,
          padding: "12px 16px",
          borderRadius: 10,
          border: "1px solid #ccc",
          background: canStart ? "white" : "#f3f3f3",
          cursor: canStart ? "pointer" : "not-allowed",
          width: "100%"
        }}
      >
        Start
      </button>

      {!canStart && (
        <p style={{ color: "#555", marginTop: 10 }}>
          Add at least two teams to start.
        </p>
      )}
    </main>
  )
}
