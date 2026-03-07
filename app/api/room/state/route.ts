export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { getQuestionById } from "@/lib/questionBank"
import { shuffleMcqForRoom } from "@/lib/mcqShuffle"

type TeamPlayerRow = {
  id: string
  name: string
  totalScore: number
  usedJokerInScope: boolean
}

type TeamStats = {
  team: string
  players: number
  answered: number
  correct: number
  jokerUsed: number
  jokerCorrect: number
  totalScoreSoFar: number
  averageScoreSoFar: number
  displayScoreSoFar: number
  playersList: TeamPlayerRow[]
}

type StatsBlock = {
  answered: number
  correct: number
  jokerUsed: number
  jokerCorrect: number
  byTeam: TeamStats[]
}

type RoundPlanRow = {
  index: number
  number: number
  name: string
  startIndex: number
  endIndex: number
  size: number
}

type FinalRoundResult = {
  index: number
  number: number
  name: string
  score: number
  jokerUsed: boolean
}

type FinalPlayerResult = {
  id: string
  name: string
  team: string
  totalScore: number
  jokerRoundIndex: number | null
  rounds: FinalRoundResult[]
}

type FinalTeamResult = {
  team: string
  totalScore: number
  averageScore: number
  playerCount: number
  players: FinalPlayerResult[]
}

type TeamScoreMode = "total" | "average"

type BuildStatsOptions = {
  scopeRoundIndex?: number | null
  includePlannedJokerUsers?: boolean
  uniqueJokerUsersByPlayer?: boolean
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

  const plan: RoundPlanRow[] = []
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

function findRoundForQuestion(questionIndex: number, plan: RoundPlanRow[]) {
  const qi = Math.max(0, Math.floor(Number(questionIndex ?? 0)) || 0)
  for (const r of plan) {
    if (qi >= r.startIndex && qi <= r.endIndex) return r
  }
  return plan[0]
}

function emptyStats(): StatsBlock {
  return { answered: 0, correct: 0, jokerUsed: 0, jokerCorrect: 0, byTeam: [] }
}

function buildStats(
  players: any[],
  answers: any[],
  teamScoreMode: TeamScoreMode = "total",
  options: BuildStatsOptions = {}
): StatsBlock {
  const scopeRoundIndex = Number(options.scopeRoundIndex)
  const hasScopeRoundIndex = Number.isFinite(scopeRoundIndex)
  const includePlannedJokerUsers = Boolean(options.includePlannedJokerUsers && hasScopeRoundIndex)
  const uniqueJokerUsersByPlayer = Boolean(options.uniqueJokerUsersByPlayer)

  const byTeamPlayers = new Map<string, any[]>()

  for (const player of players) {
    const team = String(player?.team_name ?? "").trim() || "No team"
    const list = byTeamPlayers.get(team) ?? []
    list.push(player)
    byTeamPlayers.set(team, list)
  }

  const byTeam = new Map<
    string,
    {
      answered: number
      correct: number
      jokerUsed: number
      jokerCorrect: number
      usedJokerPlayerIds: Set<string>
    }
  >()

  for (const team of byTeamPlayers.keys()) {
    byTeam.set(team, {
      answered: 0,
      correct: 0,
      jokerUsed: 0,
      jokerCorrect: 0,
      usedJokerPlayerIds: new Set<string>(),
    })
  }

  const globalUsedJokerPlayerIds = new Set<string>()

  if (includePlannedJokerUsers) {
    for (const player of players) {
      if (Number(player?.joker_round_index) !== scopeRoundIndex) continue

      const team = String(player?.team_name ?? "").trim() || "No team"
      const entry =
        byTeam.get(team) ??
        {
          answered: 0,
          correct: 0,
          jokerUsed: 0,
          jokerCorrect: 0,
          usedJokerPlayerIds: new Set<string>(),
        }

      const playerId = String(player?.id ?? "").trim()
      if (playerId) {
        entry.usedJokerPlayerIds.add(playerId)
        globalUsedJokerPlayerIds.add(playerId)
      }

      byTeam.set(team, entry)
    }
  }

  let answered = 0
  let correct = 0
  let jokerUsed = 0
  let jokerCorrect = 0

  for (const answer of answers) {
    answered += 1

    const team = String(answer?.team_name ?? "").trim() || "No team"
    const entry =
      byTeam.get(team) ??
      {
        answered: 0,
        correct: 0,
        jokerUsed: 0,
        jokerCorrect: 0,
        usedJokerPlayerIds: new Set<string>(),
      }

    entry.answered += 1

    const isCorrect = Boolean(answer?.is_correct)
    const usedJoker = Boolean(answer?.joker_active)
    const playerId = String(answer?.player_id ?? "").trim()

    if (isCorrect) {
      correct += 1
      entry.correct += 1
    }

    if (usedJoker) {
      if (uniqueJokerUsersByPlayer) {
        if (playerId) {
          entry.usedJokerPlayerIds.add(playerId)
          globalUsedJokerPlayerIds.add(playerId)
        }
      } else {
        jokerUsed += 1
        entry.jokerUsed += 1
      }

      if (playerId && !uniqueJokerUsersByPlayer) {
        entry.usedJokerPlayerIds.add(playerId)
      }

      if (isCorrect) {
        jokerCorrect += 1
        entry.jokerCorrect += 1
      }
    }

    byTeam.set(team, entry)
  }

  const teamRows: TeamStats[] = Array.from(byTeamPlayers.entries()).map(([team, teamPlayers]) => {
    const entry =
      byTeam.get(team) ??
      {
        answered: 0,
        correct: 0,
        jokerUsed: 0,
        jokerCorrect: 0,
        usedJokerPlayerIds: new Set<string>(),
      }

    const totalScoreSoFar = teamPlayers.reduce((sum, player) => sum + Number(player?.score ?? 0), 0)
    const averageScoreSoFar = teamPlayers.length > 0 ? totalScoreSoFar / teamPlayers.length : 0
    const displayScoreSoFar = teamScoreMode === "average" ? averageScoreSoFar : totalScoreSoFar

    const playersList: TeamPlayerRow[] = [...teamPlayers]
      .sort((a, b) => {
        const scoreDiff = Number(b?.score ?? 0) - Number(a?.score ?? 0)
        if (scoreDiff !== 0) return scoreDiff
        return String(a?.name ?? "").localeCompare(String(b?.name ?? ""))
      })
      .map((player) => ({
        id: String(player?.id ?? ""),
        name: String(player?.name ?? "").trim() || "Player",
        totalScore: Number(player?.score ?? 0),
        usedJokerInScope: includePlannedJokerUsers
          ? Number(player?.joker_round_index) === scopeRoundIndex || entry.usedJokerPlayerIds.has(String(player?.id ?? ""))
          : entry.usedJokerPlayerIds.has(String(player?.id ?? "")),
      }))

    return {
      team,
      players: teamPlayers.length,
      answered: entry.answered,
      correct: entry.correct,
      jokerUsed: uniqueJokerUsersByPlayer || includePlannedJokerUsers ? entry.usedJokerPlayerIds.size : entry.jokerUsed,
      jokerCorrect: entry.jokerCorrect,
      totalScoreSoFar,
      averageScoreSoFar,
      displayScoreSoFar,
      playersList,
    }
  })

  teamRows.sort((a, b) => {
    if (b.displayScoreSoFar !== a.displayScoreSoFar) return b.displayScoreSoFar - a.displayScoreSoFar
    if (b.totalScoreSoFar !== a.totalScoreSoFar) return b.totalScoreSoFar - a.totalScoreSoFar
    return a.team.localeCompare(b.team)
  })

  if (uniqueJokerUsersByPlayer || includePlannedJokerUsers) {
    jokerUsed = globalUsedJokerPlayerIds.size
  }

  return { answered, correct, jokerUsed, jokerCorrect, byTeam: teamRows }
}

function sortPlayers(a: FinalPlayerResult, b: FinalPlayerResult) {
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
  return a.name.localeCompare(b.name)
}

function buildFinalResults(
  players: any[],
  questionIds: string[],
  roundPlan: RoundPlanRow[],
  answers: Array<{ player_id: string; question_id: string; score_delta: number | null }>
) {
  const answerMap = new Map<string, number>()
  for (const answer of answers) {
    answerMap.set(
      `${String(answer.player_id ?? "").trim()}:${String(answer.question_id ?? "").trim()}`,
      Number(answer.score_delta ?? 0)
    )
  }

  const finalPlayers: FinalPlayerResult[] = players.map((player: any) => {
    const jokerRoundNumber = Number(player?.joker_round_index)
    const jokerRoundIndex = Number.isFinite(jokerRoundNumber) ? jokerRoundNumber : null

    return {
      id: String(player?.id ?? ""),
      name: String(player?.name ?? "").trim() || "Player",
      team: String(player?.team_name ?? "").trim() || "No team",
      totalScore: Number(player?.score ?? 0),
      jokerRoundIndex,
      rounds: roundPlan.map((round) => ({
        index: round.index,
        number: round.number,
        name: round.name,
        score: 0,
        jokerUsed: jokerRoundIndex === round.index,
      })),
    }
  })

  for (let questionIndex = 0; questionIndex < questionIds.length; questionIndex++) {
    const questionId = String(questionIds[questionIndex] ?? "")
    const round = findRoundForQuestion(questionIndex, roundPlan)

    for (const player of finalPlayers) {
      const key = `${player.id}:${questionId}`
      let score = 0

      if (answerMap.has(key)) {
        score = Number(answerMap.get(key) ?? 0)
      } else if (player.jokerRoundIndex === round.index) {
        score = -1
      }

      player.rounds[round.index].score += score
    }
  }

  finalPlayers.sort(sortPlayers)

  const teamsMap = new Map<string, FinalTeamResult>()
  for (const player of finalPlayers) {
    const team = player.team || "No team"
    const existing = teamsMap.get(team)

    if (existing) {
      existing.totalScore += player.totalScore
      existing.playerCount += 1
      existing.players.push(player)
      continue
    }

    teamsMap.set(team, {
      team,
      totalScore: player.totalScore,
      averageScore: 0,
      playerCount: 1,
      players: [player],
    })
  }

  const teams = Array.from(teamsMap.values()).map((team) => {
    team.players.sort(sortPlayers)
    team.averageScore = team.playerCount > 0 ? team.totalScore / team.playerCount : 0
    return team
  })

  teams.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
    return a.team.localeCompare(b.team)
  })

  return {
    rounds: roundPlan.map((round) => ({
      index: round.index,
      number: round.number,
      name: round.name,
    })),
    players: finalPlayers,
    teams,
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = String(searchParams.get("code") ?? "").trim().toUpperCase()

  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 })

  const roomRes = await supabaseAdmin.from("rooms").select("*").eq("code", code).single()
  if (roomRes.error) return NextResponse.json({ error: "Room not found" }, { status: 404 })

  const room = roomRes.data

  let players: any[] = []
  const withJoker = await supabaseAdmin
    .from("players")
    .select("id, name, score, team_name, joker_round_index, joined_at")
    .eq("room_id", room.id)
    .order("joined_at", { ascending: true })

  if (!withJoker.error) {
    players = withJoker.data ?? []
  } else {
    const message = String(withJoker.error.message ?? "").toLowerCase()
    if (message.includes("joker_round_index")) {
      const without = await supabaseAdmin
        .from("players")
        .select("id, name, score, team_name, joined_at")
        .eq("room_id", room.id)
        .order("joined_at", { ascending: true })

      players = (without.data ?? []).map((player: any) => ({ ...player, joker_round_index: null }))
    } else {
      return NextResponse.json({ error: withJoker.error.message }, { status: 500 })
    }
  }

  const questionIds = Array.isArray(room.question_ids) ? room.question_ids : []
  const questionCount = questionIds.length
  const safeQuestionIndex = Math.max(0, Math.floor(Number(room.question_index ?? 0)) || 0)
  const currentQuestionId = questionIds[safeQuestionIndex]

  const now = new Date()
  const baseStage = stageFromTimes(room.phase, now.getTime(), room.open_at, room.close_at, room.reveal_at, room.next_at)

  const audioMode = String(room.audio_mode ?? "display")
  const selectedPacks = Array.isArray(room.selected_packs) ? room.selected_packs : []
  const isUntimedAnswers = Number(room.answer_seconds ?? 0) <= 0
  const teamScoreMode: TeamScoreMode = String(room.team_score_mode ?? "total") === "average" ? "average" : "total"

  const roundCount = normaliseRoundCount((room as any).round_count, questionCount || 1)
  const roundNames = normaliseRoundNames((room as any).round_names, roundCount)
  const roundPlan = buildRoundPlan(questionCount || 1, roundCount, roundNames)
  const currentRound = findRoundForQuestion(safeQuestionIndex, roundPlan)
  const questionNumberInRound = Math.max(1, safeQuestionIndex - currentRound.startIndex + 1)

  const isLastQuestionOverall = questionCount > 0 ? safeQuestionIndex >= questionCount - 1 : true
  const isLastQuestionInRound = safeQuestionIndex >= currentRound.endIndex
  const nextRound = !isLastQuestionOverall ? roundPlan[currentRound.index + 1] ?? null : null

  const stage =
    room.phase === "running" && baseStage === "needs_advance" && isLastQuestionInRound
      ? "round_summary"
      : baseStage

  const canShowQuestion = room.phase === "running"

  let questionPublic: any = null
  let revealData: any = null

  if (canShowQuestion && currentQuestionId) {
    const question = await getQuestionById(String(currentQuestionId))

    if (question) {
      let options = question.options
      let revealAnswerIndex = question.answerIndex

      if (
        question.answerType === "mcq" &&
        question.answerIndex !== null &&
        Array.isArray(question.options) &&
        question.options.length > 1
      ) {
        const shuffled = shuffleMcqForRoom(question.options, question.answerIndex, room.id, question.id)
        options = shuffled.options
        revealAnswerIndex = shuffled.answerIndex
      }

      questionPublic = {
        id: question.id,
        roundType: question.roundType,
        answerType: question.answerType,
        text: question.text,
        options,
        audioUrl: question.audioPath ? `/api/audio?path=${encodeURIComponent(question.audioPath)}` : null,
        imageUrl: question.imagePath ? `/api/image?path=${encodeURIComponent(question.imagePath)}` : null,
      }

      if (stage === "reveal") {
        revealData = {
          answerType: question.answerType,
          answerIndex: question.answerType === "mcq" ? revealAnswerIndex : null,
          answerText: question.answerType === "text" ? (question.answerText ?? "") : null,
          explanation: question.explanation,
        }
      }
    }
  }

  let questionStats: StatsBlock = emptyStats()
  if (currentQuestionId) {
    const questionAnswersRes = await supabaseAdmin
      .from("answers")
      .select("player_id, is_correct, joker_active, score_delta")
      .eq("room_id", room.id)
      .eq("question_id", String(currentQuestionId))

    const questionAnswers = (questionAnswersRes.data ?? []).map((answer: any) => {
      const player = players.find((row: any) => row.id === answer.player_id)
      return {
        ...answer,
        team_name: player?.team_name ?? "",
      }
    })

    questionStats = buildStats(players, questionAnswers, teamScoreMode)
  }

  let roundStats: StatsBlock = emptyStats()
  const roundAnswersRes = await supabaseAdmin
    .from("answers")
    .select("player_id, is_correct, joker_active, score_delta, round_index")
    .eq("room_id", room.id)
    .eq("round_index", currentRound.index)

  const roundAnswers = (roundAnswersRes.data ?? []).map((answer: any) => {
    const player = players.find((row: any) => row.id === answer.player_id)
    return {
      ...answer,
      team_name: player?.team_name ?? "",
    }
  })

  roundStats = buildStats(players, roundAnswers, teamScoreMode, {
    scopeRoundIndex: currentRound.index,
    includePlannedJokerUsers: true,
    uniqueJokerUsersByPlayer: true,
  })

  let finalResults: any = null
  if (room.phase === "finished") {
    const allAnswersRes = await supabaseAdmin
      .from("answers")
      .select("player_id, question_id, score_delta")
      .eq("room_id", room.id)

    finalResults = buildFinalResults(players, questionIds.map(String), roundPlan, allAnswersRes.data ?? [])
  }

  return NextResponse.json({
    serverNow: now.toISOString(),
    code: room.code,
    roomId: room.id,
    phase: room.phase,
    gameMode: String(room.game_mode ?? "teams") === "solo" ? "solo" : "teams",
    teamNames: Array.isArray(room.team_names) ? room.team_names : [],
    teamScoreMode,
    stage,
    audioMode,
    selectedPacks,
    questionIndex: room.question_index,
    questionCount,
    flow: {
      isLastQuestionOverall,
      isLastQuestionInRound,
      nextRound: nextRound
        ? {
            index: nextRound.index,
            number: nextRound.number,
            name: nextRound.name,
          }
        : null,
    },
    settings: {
      untimedAnswers: isUntimedAnswers,
      answerSeconds: isUntimedAnswers ? null : Number(room.answer_seconds ?? 0),
    },
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
    finalResults,
    players,
  })
}
