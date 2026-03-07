"use client"

import { useEffect, useMemo, useState } from "react"
import JoinFeedPanel from "@/components/JoinFeedPanel"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

type RoomState = any

type PlayerPublic = {
  id: string
  name: string
  team_name?: string | null
  score?: number | null
  joined_at?: string | null
  joker_round_index?: number | null
}

function isFiniteInt(n: any) {
  const v = Number(n)
  return Number.isFinite(v) && Number.isInteger(v)
}

export default function HostJoinedTeamsPanel({ code }: { code: string }) {
  const roomCode = useMemo(() => String(code ?? "").trim().toUpperCase(), [code])

  const [players, setPlayers] = useState<PlayerPublic[]>([])
  const [roundNames, setRoundNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!roomCode) return

    let cancelled = false

    async function tick() {
      try {
        const res = await fetch(`/api/room/state?code=${roomCode}`, { cache: "no-store" })
        const data: RoomState = await res.json().catch(() => ({}))

        if (cancelled) return

        if (!res.ok) {
          setError(String(data?.error ?? "Could not load room state."))
          setPlayers([])
          setRoundNames([])
          setLoading(false)
          return
        }

        const list = Array.isArray(data?.players) ? data.players : []
        setPlayers(list as PlayerPublic[])

        const names = Array.isArray(data?.rounds?.names) ? data.rounds.names : []
        setRoundNames(names.map((x: any, i: number) => (String(x ?? "").trim() ? String(x) : `Round ${i + 1}`)))

        setError(null)
        setLoading(false)
      } catch {
        if (cancelled) return
        setError("Could not load room state.")
        setPlayers([])
        setRoundNames([])
        setLoading(false)
      }
    }

    tick()
    const id = setInterval(tick, 500)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [roomCode])

  if (!roomCode) return null

  if (loading) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-[var(--muted-foreground)]">Loading players…</CardContent>
      </Card>
    )
  }

  const totalPlayers = players.length

  const pickedCount = players.reduce((sum, p) => {
    return sum + (isFiniteInt(p.joker_round_index) ? 1 : 0)
  }, 0)

  const nameForRound = (idx: number) => {
    if (idx < 0) return `Round ${idx + 1}`
    if (idx < roundNames.length) return roundNames[idx]
    return `Round ${idx + 1}`
  }

  const rows = [...players].sort((a, b) => {
    const ta = String(a.team_name ?? "")
    const tb = String(b.team_name ?? "")
    if (ta !== tb) return ta.localeCompare(tb)
    return String(a.name ?? "").localeCompare(String(b.name ?? ""))
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          {error ? (
            <div className="border-b border-[var(--border)] px-4 py-3 text-sm text-red-600 dark:text-red-300">
              {error}
            </div>
          ) : null}
          <JoinFeedPanel players={players as any} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Joker picks</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="text-sm text-[var(--muted-foreground)]">
            {pickedCount} of {totalPlayers} picked
          </div>

          {totalPlayers === 0 ? (
            <div className="text-sm text-[var(--muted-foreground)]">No players yet.</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--card)]">
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-3 py-2 text-left font-medium">Player</th>
                    <th className="px-3 py-2 text-left font-medium">Team</th>
                    <th className="px-3 py-2 text-left font-medium">Joker</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const idx = isFiniteInt(p.joker_round_index) ? Number(p.joker_round_index) : null
                    const label = idx === null ? "Not picked" : nameForRound(idx)

                    return (
                      <tr key={p.id} className="border-b border-[var(--border)] last:border-b-0">
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className="px-3 py-2 text-[var(--muted-foreground)]">{String(p.team_name ?? "")}</td>
                        <td className={`px-3 py-2 ${idx === null ? "text-amber-600 dark:text-amber-300" : ""}`}>
                          {label}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}