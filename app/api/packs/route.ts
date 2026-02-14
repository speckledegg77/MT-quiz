export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { questions } from "../../../data/questions"

type PackInfo = {
  id: string
  label: string
  questionCount: number
  audioCount: number
}

const LABELS: Record<string, string> = {
  general: "General trivia",
  quickfire: "Quickfire",
  lyrics: "Guess the lyrics",
  intros: "Guess the intros",
  karaoke: "Karaoke",
  picture: "Picture round"
}

function titleCase(id: string) {
  return id
    .replace(/[-_]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export async function GET() {
  const map = new Map<string, PackInfo>()

  for (const q of questions) {
    const packs = Array.isArray((q as any).packs) ? (q as any).packs : []
    for (const p of packs) {
      const id = String(p ?? "").trim()
      if (!id) continue

      if (!map.has(id)) {
        map.set(id, {
          id,
          label: LABELS[id] ?? titleCase(id),
          questionCount: 0,
          audioCount: 0
        })
      }

      const row = map.get(id)!
      row.questionCount += 1
      if ((q as any).roundType === "audio") row.audioCount += 1
    }
  }

  const packs = [...map.values()].sort((a, b) => {
    if (a.id === "general") return -1
    if (b.id === "general") return 1
    return a.label.localeCompare(b.label)
  })

  return NextResponse.json({ packs })
}
