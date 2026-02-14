"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

function JoinInner() {
  const router = useRouter()
  const sp = useSearchParams()

  const [code, setCode] = useState((sp.get("code") ?? "").toUpperCase())
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function join() {
    setError(null)

    const res = await fetch("/api/room/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name })
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? "Could not join")
      return
    }

    localStorage.setItem(`mtq_player_${data.code}`, data.playerId)
    router.push(`/play/${data.code}`)
  }

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Join</h1>

      <label style={{ display: "block", marginBottom: 10 }}>
        Room code
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
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
        Team name
        <input
          value={name}
          onChange={e => setName(e.target.value)}
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

      <button
        onClick={join}
        style={{ padding: "12px 16px", border: "1px solid #ccc", borderRadius: 10, width: "100%" }}
      >
        Join
      </button>

      {error && <p style={{ marginTop: 12, color: "crimson" }}>{error}</p>}
    </main>
  )
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: 520, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
          <p>Loading…</p>
        </main>
      }
    >
      <JoinInner />
    </Suspense>
  )
}
