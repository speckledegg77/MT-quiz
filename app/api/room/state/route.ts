export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"
import { getQuestionById } from "../../../../lib/questionBank"
import { shuffleMcqForRoom } from "../../../../lib/mcqShuffle"

function stageFromTimes(
  phase: string,
  nowMs: number,
  openAt?: string,
  closeAt?: string,
  revealAt?: string,
  nextAt?: string
) {
  if (phase !== "running") return phase
  const open = openAt ? Date.parse(openAt) : 0
  const close = closeAt ? Date.parse(closeAt) : 0
  const reveal = revealAt ? Date.parse(revealAt) : 0
  const next = nextAt ? Date.parse(nextAt) : 0
  if (nowMs < open) return "countdown"
  if (nowMs < close) return "open"
  if (nowMs < reveal) return "wait"
  if (nowMs < next) return "reveal"
  return "needs_advance"
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function normaliseRoundCount(raw: any, questionCount: number) {
  const qc = Math.max(1, Math.floor(Number(questionCount ?? 0)) || 1)
  const requested = Math.floor(Number(raw ?? 4))
  const safe = Number.isFinite(requested) ? requested : 4
  const capped = clampInt(safe, 1, 20)
  return Math.min(capped, qc)
}

function normaliseRoundNames(raw: any, count: number) {
  const arr = Array.isArray(raw) ? raw : []
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const name = String(arr[i] ?? "").trim()
    out.push(name || `Round ${i + 1}`)
  }
  return out
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = String(searchParams.get("code") ?? "").trim().toUpperCase()
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 })

  const roomRes = await supabaseAdmin.from("rooms").select("*").eq("code", code).single()
  if (roomRes.error) return NextResponse.json({ error: "Room not found" }, { status: 404 })
  const room = roomRes.data

  // Always end up with a plain players array, regardless of whether joker_round_index exists
  let players: any[] = []
  let playersError: string | null = null

  const withJoker = await supabaseAdmin
    .from("players")
    .select("id, name, score, team_name, joker_round_index, joined_at")
    .eq("room_id", room.id)
    .order("joined_at", { ascending: true })

  if (!withJoker.error) {
    players = withJoker.data ?? []
  } else {
    const msg = String(withJoker.error.message ?? "").toLowerCase()

    // If the column doesn't exist yet, fall back to the old select
    if (msg.includes("joker_round_index")) {
      const withoutJoker = await supabaseAdmin
        .from("players")
        .select("id, name, score, team_name, joined_at")
        .eq("room_id", room.id)
        .order("joined_at", { ascending: true })

      if (!withoutJoker.error) {
        players = (withoutJoker.data ?? []).map((p: any) => ({ ...p, joker_round_index: null }))
      } else {
        playersError = withoutJoker.error.message
      }
    } else {
      playersError = withJoker.error.message
    }
  }

  const questionIds = Array.isArray(room.question_ids) ? room.question_ids : []
  const currentQuestionId = questionIds[room.question_index]

  const now = new Date()
  const stage = stageFromTimes(room.phase, now.getTime(), room.open_at, room.close_at, room.reveal_at, room.next_at)

  const canShowQuestion = room.phase === "running" || room.phase === "finished"
  const audioMode = String(room.audio_mode ?? "display")
  const selectedPacks = Array.isArray(room.selected_packs) ? room.selected_packs : []

  const roundCount = normaliseRoundCount((room as any).round_count, questionIds.length || 1)
  const roundNames = normaliseRoundNames((room as any).round_names, roundCount)

  let questionPublic: any = null
  let revealData: any = null

  if (canShowQuestion && currentQuestionId) {
    const q = await getQuestionById(String(currentQuestionId))
    if (q) {
      let options = q.options
      let revealAnswerIndex = q.answerIndex

      if (q.answerType === "mcq" && q.answerIndex !== null && Array.isArray(q.options) && q.options.length > 1) {
        const shuffled = shuffleMcqForRoom(q.options, q.answerIndex, room.id, q.id)
        options = shuffled.options
        revealAnswerIndex = shuffled.answerIndex
      }

      const audioUrl = q.audioPath ? `/api/audio?path=${encodeURIComponent(q.audioPath)}` : null
      const imageUrl = q.imagePath ? `/api/image?path=${encodeURIComponent(q.imagePath)}` : null

      questionPublic = {
        id: q.id,
        roundType: q.roundType,
        answerType: q.answerType,
        text: q.text,
        options,
        audioUrl,
        imageUrl,
      }

      if (stage === "reveal" || room.phase === "finished") {
        revealData = {
          answerType: q.answerType,
          answerIndex: q.answerType === "mcq" ? revealAnswerIndex : null,
          answerText: q.answerType === "text" ? (q.answerText ?? "") : null,
          explanation: q.explanation,
        }
      }
    }
  }

  return NextResponse.json({
    serverNow: now.toISOString(),
    code: room.code,
    roomId: room.id,
    phase: room.phase,
    gameMode: String(room.game_mode ?? "teams") === "solo" ? "solo" : "teams",
    teamNames: Array.isArray(room.team_names) ? room.team_names : [],
    teamScoreMode: String(room.team_score_mode ?? "total") === "average" ? "average" : "total",
    stage,
    audioMode,
    selectedPacks,
    questionIndex: room.question_index,
    questionCount: questionIds.length,
    rounds: {
      count: roundCount,
      names: roundNames,
    },
    times: {
      openAt: room.open_at,
      closeAt: room.close_at,
      revealAt: room.reveal_at,
      nextAt: room.next_at,
    },
    question: questionPublic,
    reveal: revealData,
    players,
    playersError,
  })
}