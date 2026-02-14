export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"
import { pickQuestionIdsForPacks } from "../../../../lib/questionBank"

type RoundRequest = { packId: string; count: number }

function randomCode(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let out = ""
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
}

async function pickQuestionIdsForRounds(rounds: RoundRequest[]): Promise<string[]> {
  const out: string[] = []

  for (const r of rounds) {
    const packId = String(r.packId ?? "").trim()
    const count = Math.max(0, Math.floor(Number(r.count)))

    if (!packId || count <= 0) {
      throw new Error("Each round needs packId and count > 0")
    }

    const linksRes = await supabaseAdmin
      .from("pack_questions")
      .select("question_id")
      .eq("pack_id", packId)

    if (linksRes.error) throw new Error(linksRes.error.message)

    const ids = (linksRes.data ?? [])
      .map(row => String((row as any).question_id ?? ""))
      .filter(Boolean)

    const unique = Array.from(new Set(ids))

    if (unique.length < count) {
      throw new Error(`Pack ${packId} only has ${unique.length} questions (asked for ${count})`)
    }

    shuffleInPlace(unique)
    out.push(...unique.slice(0, count))
  }

  return out
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  const countdownSeconds = Number(body.countdownSeconds ?? 3)
  const answerSeconds = Number(body.answerSeconds ?? 60)
  const revealDelaySeconds = Number(body.revealDelaySeconds ?? 2)
  const revealSeconds = Number(body.revealSeconds ?? 5)

  const audioModeRaw = String(body.audioMode ?? "display").toLowerCase()
  const audioMode = audioModeRaw === "phones" || audioModeRaw === "both" ? audioModeRaw : "display"

  const roundsInput: RoundRequest[] = Array.isArray(body.rounds) ? body.rounds : []
  const rounds: RoundRequest[] = roundsInput
    .map(r => ({ packId: String((r as any)?.packId ?? "").trim(), count: Number((r as any)?.count ?? 0) }))
    .filter(r => r.packId && Number.isFinite(r.count) && r.count > 0)

  const selectedPacksInput = Array.isArray(body.selectedPacks) ? body.selectedPacks : []
  const selectedPacks = selectedPacksInput
    .map((x: any) => String(x ?? "").trim())
    .filter((x: string) => x.length > 0)

  const questionCount = Number(body.questionCount ?? 20)

  let pickedIds: string[] = []
  let packsToStore: string[] = []

  try {
    if (rounds.length > 0) {
      pickedIds = await pickQuestionIdsForRounds(rounds)
      packsToStore = Array.from(new Set(rounds.map(r => r.packId)))
    } else {
      pickedIds = await pickQuestionIdsForPacks(questionCount, selectedPacks)
      packsToStore = selectedPacks
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not pick questions" }, { status: 400 })
  }

  if (pickedIds.length === 0) {
    return NextResponse.json(
      { error: packsToStore.length ? `No questions found for packs: ${packsToStore.join(", ")}` : "No questions found" },
      { status: 400 }
    )
  }

  if (rounds.length === 0 && pickedIds.length < questionCount) {
    return NextResponse.json(
      { error: `Not enough questions. You asked for ${questionCount} but only ${pickedIds.length} match those rounds.` },
      { status: 400 }
    )
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode(8)

    const ins = await supabaseAdmin
      .from("rooms")
      .insert({
        code,
        phase: "lobby",
        question_ids: pickedIds,
        question_index: 0,
        countdown_seconds: countdownSeconds,
        answer_seconds: answerSeconds,
        reveal_delay_seconds: revealDelaySeconds,
        reveal_seconds: revealSeconds,
        audio_mode: audioMode,
        selected_packs: packsToStore,
      })
      .select("code")
      .single()

    if (!ins.error) return NextResponse.json({ code: ins.data.code })
  }

  return NextResponse.json({ error: "Could not create room" }, { status: 500 })
}
