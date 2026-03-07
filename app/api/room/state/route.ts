export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"
import { getQuestionById } from "../../../../lib/questionBank"
import { shuffleMcqForRoom } from "../../../../lib/mcqShuffle"

type TeamStats = {
  team: string
  players: number
  answered: number
  correct: number
  jokerUsed: number
  jokerCorrect: number
}

type StatsBlock = {
  answered: number
  correct: number
  jokerUsed: number
  jokerCorrect: number
  byTeam: TeamStats[]
}

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

function buildRoundPlan(questionCount: number, roundCount: number, roundNames: string[]) {
  const qc = Math.max(1, Math.floor(Number(questionCount ?? 0)) || 1)
  const rc = normaliseRoundCount(roundCount, qc)
  const names = normaliseRoundNames(roundNames, rc)

  const base = Math.floor(qc / rc)
  const rem = qc % rc

  const plan: Array<{
    index: number
    number: number
    name: string
    startIndex: number
    endIndex: number
    size: number
  }> = []

  let start = 0
  for (let i = 0; i < rc; i++) {
    const size = base + (i < rem ? 1 : 0)
    const end = start + size - 1
    plan.push({
      index: i,
      number: i + 1,
      name: names[i] ?? `Round ${i + 1}`,
      startIndex: start,
      endIndex: end,
      size,
    })
    start = end + 1
  }

  return plan
}

function findRoundForQuestion(questionIndex: number, plan: any[]) {
  const qi = Math.max(0, Math.floor(Number(questionIndex ?? 0)) || 0)
  for (const r of plan) {
    if (qi >= r.startIndex && qi <= r.endIndex) return r
  }
  return plan[0]
}

function emptyStats(): StatsBlock {
  return { answered: 0, correct: 0, jokerUsed: 0, jokerCorrect: 0, byTeam: [] }
}

function buildStats(players: any[], answers: any[]): StatsBlock {
  const byTeamPlayers = new Map<string, number>()
  for (const p of players) {
    const team = String(p.team_name ?? "").trim() || "No team"
    byTeamPlayers.set(team, (byTeamPlayers.get(team) ?? 0) + 1)
  }

  const byTeam: Map<string, { answered: number; correct: number; jokerUsed: number; jokerCorrect: number }> = new Map()
  for (const t of byTeamPlayers.keys()) {
    byTeam.set(t, { answered: 0, correct: 0, jokerUsed: 0, jokerCorrect: 0 })
  }

  let answered = 0
  let correct = 0
  let jokerUsed = 0
  let jokerCorrect = 0

  for (const a of answers) {
    answered += 1
    const team = String(a.team_name ?? "").trim() || "No team"

    const entry = byTeam.get(team) ?? { answered: 0, correct: 0, jokerUsed: 0, jokerCorrect: 0 }
    entry.answered += 1

    const isCorrect = Boolean(a.is_correct)
    const usedJoker = Boolean(a.joker_active)

    if (isCorrect) {
      correct += 1
      entry.correct += 1
    }

    if (usedJoker) {
      jokerUsed += 1
      entry.jokerUsed += 1
      if (isCorrect) {
        jokerCorrect += 1
        entry.jokerCorrect += 1
      }
    }

    byTeam.set(team, entry)
  }

  const teamRows: TeamStats[] = Array.from(byTeamPlayers.entries()).map(([team, playersCount]) => {
    const e = byTeam.get(team) ?? { answered: 0, correct: 0, jokerUsed: 0, jokerCorrect: 0 }
    return {
      team,
      players: playersCount,
      answered: e.answered,
      correct: e.correct,
      jokerUsed: e.jokerUsed,
      jokerCorrect: e.jokerCorrect,
    }
  })

  teamRows.sort((a, b) => a.team.localeCompare(b.team))

  return { answered, correct, jokerUsed, jokerCorrect, byTeam: teamRows }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = String(searchParams.get("code") ?? "").trim().toUpperCase()
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 })

  const roomRes = await supabaseAdmin.from("rooms").select("*").eq("code", code).single()
  if (roomRes.error) return NextResponse.json({ error: "Room not found" }, { status: 404 })
  const room = roomRes.data

  // Players (include joker if available, and always return joker_round_index key)
  let players: any[] = []
  const withJoker = await supabaseAdmin
    .from("players")
    .select("id, name, score, team_name, joker_round_index, joined_at")
    .eq("room_id", room.id)
    .order("joined_at", { ascending: true })

  if (!withJoker.error) {
    players = withJoker.data ?? []
  } else {
    const msg = String(withJoker.error.message ?? "").toLowerCase()
    if (msg.includes("joker_round_index")) {
      const without = await supabaseAdmin
        .from("players")
        .select("id, name, score, team_name, joined_at")
        .eq("room_id", room.id)
        .order("joined_at", { ascending: true })

      players = (without.data ?? []).map((p: any) => ({ ...p, joker_round_index: null }))
    } else {
      return NextResponse.json({ error: withJoker.error.message }, { status: 500 })
    }
  }

  const questionIds = Array.isArray(room.question_ids) ? room.question_ids : []
  const questionCount = questionIds.length
  const currentQuestionId = questionIds[room.question_index]

  const now = new Date()
  const stage = stageFromTimes(room.phase, now.getTime(), room.open_at, room.close_at, room.reveal_at, room.next_at)

  const audioMode = String(room.audio_mode ?? "display")
  const selectedPacks = Array.isArray(room.selected_packs) ? room.selected_packs : []

  const roundCount = normaliseRoundCount((room as any).round_count, questionCount || 1)
  const roundNames = normaliseRoundNames((room as any).round_names, roundCount)
  const roundPlan = buildRoundPlan(questionCount || 1, roundCount, roundNames)
  const currentRound = findRoundForQuestion(Number(room.question_index ?? 0), roundPlan)
  const questionNumberInRound = Math.max(1, Number(room.question_index ?? 0) - currentRound.startIndex + 1)

  const canShowQuestion = room.phase === "running" || room.phase === "finished"

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

  // Stats: current question
  let questionStats: StatsBlock = emptyStats()
  if (currentQuestionId) {
    const ansRes = await supabaseAdmin
      .from("answers")
      .select("player_id, is_correct, joker_active, score_delta")
      .eq("room_id", room.id)
      .eq("question_id", String(currentQuestionId))

    const answers = (ansRes.data ?? []).map((a: any) => {
      const player = players.find((p: any) => p.id === a.player_id)
      return {
        ...a,
        team_name: player?.team_name ?? "",
      }
    })

    questionStats = buildStats(players, answers)
  }

  // Stats: current round so far (answered questions only)
  let roundStats: StatsBlock = emptyStats()
  {
    const ansRoundRes = await supabaseAdmin
      .from("answers")
      .select("player_id, is_correct, joker_active, score_delta, round_index")
      .eq("room_id", room.id)
      .eq("round_index", currentRound.index)

    const answers = (ansRoundRes.data ?? []).map((a: any) => {
      const player = players.find((p: any) => p.id === a.player_id)
      return {
        ...a,
        team_name: player?.team_name ?? "",
      }
    })

    roundStats = buildStats(players, answers)
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
    questionCount,
    rounds: {
      count: roundCount,
      names: roundNames,
      plan: roundPlan,
      current: {
        index: currentRound.index,
        number: currentRound.number,
        name: currentRound.name,
        startIndex: currentRound.startIndex,
        endIndex: currentRound.endIndex,
        questionsInRound: currentRound.size,
        questionNumberInRound,
      },
    },
    times: {
      openAt: room.open_at,
      closeAt: room.close_at,
      revealAt: room.reveal_at,
      nextAt: room.next_at,
    },
    question: questionPublic,
    reveal: revealData,
    questionStats,
    roundStats,
    players,
  })
}