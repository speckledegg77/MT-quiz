export const runtime = "nodejs"

import { NextResponse } from "next/server"
import {
  countJokerEligibleRounds,
  findRoundForQuestionIndex,
  getEffectiveRoomRoundPlan,
  getLegacyFieldsFromRoundPlan,
  isJokerEnabledForRoundPlan,
  materialiseRoundPlan,
  type EffectiveRoundPlanItem,
} from "@/lib/roomRoundPlan"
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { getQuestionById } from "@/lib/questionBank"
import { getGameProgressLabel, isInfiniteModeFromRound, isInfiniteModeFromRoundPlan } from "@/lib/gameMode"
import { shuffleMcqForRoom } from "@/lib/mcqShuffle"
import { applyQuickfireFastestBonus, buildQuickfireRoundReview } from "@/lib/quickfire"
import { getConfiguredAnswerSecondsForRound, getEffectiveRoundReviewSecondsForRound, isSpotlightRound, isQuickfireRound, stageFromTimes } from "@/lib/roundFlow"
import { deriveSpotlightStage, getSpotlightReadyTurnMeta, getSpotlightRole, getSpotlightTvDisplayMode, getSpotlightTurnSeconds, normaliseSpotlightRoomState } from "@/lib/spotlightGameplay"
import { advanceRoomIfReady } from "@/lib/roomProgress"

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

type RoundPlanRow = EffectiveRoundPlanItem

type FinalRoundResult = {
  index: number
  number: number
  name: string
  score: number
  jokerUsed: boolean
}

type FinalQuestionResult = {
  questionId: string
  number: number
  text: string
  correctAnswer: string
  score: number
  isCorrect: boolean
}

type FinalPlayerResult = {
  id: string
  name: string
  team: string
  totalScore: number
  jokerRoundIndex: number | null
  rounds: FinalRoundResult[]
  questionRun?: FinalQuestionResult[]
}

type FinalTeamResult = {
  team: string
  totalScore: number
  averageScore: number
  playerCount: number
  players: FinalPlayerResult[]
}

type FinalResults = {
  isInfiniteMode: boolean
  rounds: Array<{ index: number; number: number; name: string }>
  players: FinalPlayerResult[]
  teams: FinalTeamResult[]
}

type TeamScoreMode = "total" | "average"

type BuildStatsOptions = {
  scopeRoundIndex?: number | null
  includePlannedJokerUsers?: boolean
  uniqueJokerUsersByPlayer?: boolean
}

const ANSWER_AUTO_SUBMIT_GRACE_SECONDS = 2

function buildRoundSummaryEndsAt(nextAt: string | null | undefined, roundReviewSeconds: number) {
  const nextMs = nextAt ? Date.parse(nextAt) : NaN
  if (!Number.isFinite(nextMs)) return null

  const reviewMs = Math.max(0, Math.floor(Number(roundReviewSeconds ?? 0)) || 0) * 1000
  if (reviewMs <= 0) return null

  return new Date(nextMs + reviewMs).toISOString()
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

async function buildFinalResults(
  players: any[],
  questionIds: string[],
  roundPlan: RoundPlanRow[],
  answers: Array<{ player_id: string; question_id: string; score_delta: number | null }>,
  isInfiniteMode: boolean
): Promise<FinalResults> {
  const answerMap = new Map<string, number>()
  for (const answer of answers) {
    answerMap.set(
      `${String(answer.player_id ?? "").trim()}:${String(answer.question_id ?? "").trim()}`,
      Number(answer.score_delta ?? 0)
    )
  }

  const questionMetaList = await Promise.all(
    questionIds.map(async (questionId, index) => {
      const question = await getQuestionById(String(questionId ?? ""))
      const correctAnswer = question
        ? question.answerType === "mcq"
          ? Number.isFinite(Number(question.answerIndex))
            ? String(question.options[Number(question.answerIndex)] ?? "").trim()
            : ""
          : question.answerType === "none"
            ? String(question.text ?? "").trim()
            : String(question.answerText ?? question.acceptedAnswers?.[0] ?? "").trim()
        : ""

      return {
        questionId: String(questionId ?? ""),
        number: index + 1,
        text: question?.text?.trim() || `Question ${index + 1}`,
        correctAnswer,
      }
    })
  )

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
        jokerUsed:
          !isInfiniteMode &&
          jokerRoundIndex === round.index &&
          round.jokerEligible !== false &&
          round.countsTowardsScore !== false &&
          !isQuickfireRound(round),
      })),
      questionRun: isInfiniteMode
        ? questionMetaList.map((question) => ({
            questionId: question.questionId,
            number: question.number,
            text: question.text,
            correctAnswer: question.correctAnswer,
            score: 0,
            isCorrect: false,
          }))
        : undefined,
    }
  })

  for (let questionIndex = 0; questionIndex < questionIds.length; questionIndex++) {
    const questionId = String(questionIds[questionIndex] ?? "")
    const round = findRoundForQuestionIndex(questionIndex, roundPlan)

    for (const player of finalPlayers) {
      const key = `${player.id}:${questionId}`
      let score = 0

      if (answerMap.has(key)) {
        score = Number(answerMap.get(key) ?? 0)
      } else if (!isInfiniteMode && player.jokerRoundIndex === round.index && round.jokerEligible !== false && round.countsTowardsScore !== false && !isQuickfireRound(round)) {
        score = -1
      }

      player.rounds[round.index].score += score

      if (isInfiniteMode && Array.isArray(player.questionRun)) {
        const questionResult = player.questionRun[questionIndex]
        if (questionResult) {
          questionResult.score = score
          questionResult.isCorrect = score > 0
        }
      }
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
    isInfiniteMode,
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

  const progressResult = await advanceRoomIfReady({
    code,
    allowRoundSummaryAdvance: false,
    allowSpotlightReviewAutoConfirm: true,
  })

  if (!progressResult.ok && progressResult.status && progressResult.status !== 404) {
    return NextResponse.json({ error: progressResult.error ?? "Could not load room state" }, { status: progressResult.status })
  }

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

  const storedRoundPlan = getEffectiveRoomRoundPlan(room)
  const legacyFields = getLegacyFieldsFromRoundPlan(storedRoundPlan)
  const questionIds = legacyFields.question_ids
  const questionCount = questionIds.length
  const safeQuestionIndex = Math.max(0, Math.floor(Number(room.question_index ?? 0)) || 0)
  const currentQuestionId = questionIds[safeQuestionIndex]

  const now = new Date()
  const baseStage = stageFromTimes(room.phase, now.getTime(), room.open_at, room.close_at, room.reveal_at, room.next_at)

  const audioMode = String(room.audio_mode ?? "display")
  const selectedPacks = Array.isArray(room.selected_packs) ? room.selected_packs : []
  const teamScoreMode: TeamScoreMode = String(room.team_score_mode ?? "total") === "average" ? "average" : "total"

  const roundCount = legacyFields.round_count
  const roundNames = legacyFields.round_names
  const roundPlan = materialiseRoundPlan(storedRoundPlan)
  const currentRound = findRoundForQuestionIndex(safeQuestionIndex, roundPlan)
  const configuredAnswerSeconds = getConfiguredAnswerSecondsForRound(room, currentRound)
  const isUntimedAnswers = configuredAnswerSeconds <= 0
  const questionNumberInRound = Math.max(1, safeQuestionIndex - currentRound.startIndex + 1)
  const isInfiniteMode = isInfiniteModeFromRoundPlan(storedRoundPlan)
  const currentQuestionNumber = room.phase === "lobby" ? 0 : questionCount > 0 ? Math.min(safeQuestionIndex + 1, questionCount) : 0
  const progressLabel = getGameProgressLabel({
    isInfiniteMode,
    currentQuestionNumber,
    totalQuestions: questionCount,
    phase: room.phase,
  })

  const isLastQuestionOverall = questionCount > 0 ? safeQuestionIndex >= questionCount - 1 : true
  const isLastQuestionInRound = safeQuestionIndex >= currentRound.endIndex
  const nextRound = !isLastQuestionOverall ? roundPlan[currentRound.index + 1] ?? null : null

  const roundReviewSeconds = getEffectiveRoundReviewSecondsForRound(room, currentRound)
  const roundSummaryEndsAt = buildRoundSummaryEndsAt(room.next_at, roundReviewSeconds)

  const spotlightState = isSpotlightRound(currentRound)
    ? normaliseSpotlightRoomState(room?.spotlight_state, currentRound.index)
    : null
  const derivedSpotlightStage = isSpotlightRound(currentRound)
    ? deriveSpotlightStage({
        roomPhase: room.phase,
        round: currentRound,
        rawState: room?.spotlight_state,
        nowMs: now.getTime(),
        closeAt: room.close_at,
      })
    : null

  let stage = baseStage
  if (derivedSpotlightStage) {
    stage = derivedSpotlightStage
  } else if (room.phase === "running" && baseStage === "needs_advance" && isLastQuestionInRound) {
    if (roundSummaryEndsAt && now.getTime() < Date.parse(roundSummaryEndsAt)) {
      stage = "round_summary"
    } else {
      stage = "needs_advance"
    }
  }

  if (room.phase === "running" && currentQuestionId && isQuickfireRound(currentRound) && baseStage === "needs_advance") {
    const quickfireBonus = await applyQuickfireFastestBonus({
      roomId: room.id,
      questionId: String(currentQuestionId),
      countsTowardsScore: currentRound.countsTowardsScore !== false,
    })

    if (quickfireBonus.bonusApplied && quickfireBonus.fastestCorrectPlayerId) {
      players = players.map((player: any) => {
        if (String(player?.id ?? "") !== quickfireBonus.fastestCorrectPlayerId) return player
        return {
          ...player,
          score: Number(player?.score ?? 0) + 1,
        }
      })
    }
  }

  const canShowQuestion = room.phase === "running"

  let questionPublic: any = null
  let revealData: any = null

  async function getShowDisplayName(showKey: string | null | undefined) {
    const key = String(showKey ?? "").trim()
    if (!key) return null

    const showRes = await supabaseAdmin
      .from("shows")
      .select("display_name")
      .eq("show_key", key)
      .maybeSingle()

    return showRes.error || !showRes.data?.display_name ? null : String(showRes.data.display_name).trim() || null
  }

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

      const primaryShowKey = String(question.meta?.primaryShowKey ?? "").trim() || null
      const primaryShowDisplayName = primaryShowKey ? await getShowDisplayName(primaryShowKey) : null

      questionPublic = {
        id: question.id,
        roundType: question.roundType,
        answerType: question.answerType,
        text: question.text,
        options,
        audioUrl: question.audioPath ? `/api/audio?path=${encodeURIComponent(question.audioPath)}` : null,
        imageUrl: question.imagePath ? `/api/image?path=${encodeURIComponent(question.imagePath)}` : null,
        meta: question.meta
          ? {
              ...question.meta,
              primaryShowDisplayName,
            }
          : primaryShowDisplayName
            ? { primaryShowDisplayName }
            : null,
      }

      if (stage === "reveal" && !isSpotlightRound(currentRound)) {
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

  let roundReview: any = null
  if (stage === "round_summary" && isQuickfireRound(currentRound)) {
    roundReview = {
      behaviourType: currentRound.behaviourType,
      questions: await buildQuickfireRoundReview({
        roomId: room.id,
        round: currentRound,
        players: players.map((player: any) => ({
          id: String(player?.id ?? ""),
          name: String(player?.name ?? "").trim() || "Player",
        })),
      }),
    }
  } else if (stage === "round_summary" && isSpotlightRound(currentRound)) {
    const actionQuestionIds = [
      ...new Set((spotlightState?.completedTurns ?? []).flatMap((turn) => (turn.actions ?? []).map((action) => String(action.questionId ?? "").trim()).filter(Boolean))),
    ]

    const questionMap = new Map<string, Awaited<ReturnType<typeof getQuestionById>>>()
    for (const questionId of actionQuestionIds) {
      questionMap.set(questionId, await getQuestionById(questionId))
    }

    const items = (spotlightState?.completedTurns ?? []).flatMap((turn) =>
      (turn.actions ?? []).map((action, index) => {
        const question = questionMap.get(String(action.questionId ?? "").trim())
        return {
          questionId: String(action.questionId ?? ""),
          questionNumberInRound: index + 1,
          questionText: question?.text?.trim() || `Card ${index + 1}`,
          itemType: String(question?.meta?.itemType ?? "").trim() || null,
          difficulty: String(question?.meta?.difficulty ?? "").trim() || null,
          outcome: action.action,
          playerId: turn.activeGuesserId,
        }
      })
    )

    roundReview = {
      behaviourType: currentRound.behaviourType,
      items,
    }
  }

  let spotlight: any = null
  if (isSpotlightRound(currentRound) && spotlightState) {
    const actionQuestionIds = [
      ...new Set([
        ...(spotlightState.currentTurnActions ?? []).map((action) => String(action.questionId ?? "").trim()).filter(Boolean),
        ...(spotlightState.completedTurns ?? []).flatMap((turn) => (turn.actions ?? []).map((action) => String(action.questionId ?? "").trim()).filter(Boolean)),
      ]),
    ]

    const questionMap = new Map<string, Awaited<ReturnType<typeof getQuestionById>>>()
    for (const questionId of actionQuestionIds) {
      if (!questionMap.has(questionId)) questionMap.set(questionId, await getQuestionById(questionId))
    }

    const activeGuesser = players.find((player: any) => String(player?.id ?? "") === String(spotlightState.activeGuesserId ?? "")) ?? null
    const activeGuesserName = String(activeGuesser?.name ?? "").trim() || null
    const activeTeamName = spotlightState.activeTeamName || (activeGuesser ? String(activeGuesser?.team_name ?? "").trim() || null : null)
    const nextReadyTurn = getSpotlightReadyTurnMeta({
      turnOrderPlayerIds: spotlightState.turnOrderPlayerIds,
      currentTurnIndex: Math.max(0, Number(spotlightState.currentTurnIndex ?? 0) || 0) + 1,
      players,
    })
    const nextGuesser = players.find((player: any) => String(player?.id ?? "") === String(nextReadyTurn.activeGuesserId ?? "")) ?? null
    const nextGuesserName = String(nextGuesser?.name ?? "").trim() || null
    const nextTeamName = nextReadyTurn.activeTeamName || (nextGuesser ? String(nextGuesser?.team_name ?? "").trim() || null : null)
    const spotlightLastActionQuestionId = spotlightState.currentTurnActions[spotlightState.currentTurnActions.length - 1]?.questionId ?? null
    const spotlightLastActionQuestionIndex = spotlightLastActionQuestionId
      ? currentRound.questionIds.map(String).findIndex((value) => value === String(spotlightLastActionQuestionId)) + currentRound.startIndex
      : -1
    const willAdvanceToNextTurn =
      stage === "spotlight_review" &&
      Math.max(0, Number(spotlightState.currentTurnIndex ?? 0) || 0) + 1 < spotlightState.turnOrderPlayerIds.length &&
      spotlightLastActionQuestionIndex < currentRound.endIndex
    const spotlightReviewAutoAdvanceAt = stage === "spotlight_review"
      ? new Date((room.close_at ? Date.parse(String(room.close_at)) : now.getTime()) + 4500).toISOString()
      : null
    const turnOrder = spotlightState.turnOrderPlayerIds
      .map((playerId) => players.find((player: any) => String(player?.id ?? "") === String(playerId ?? "")))
      .filter(Boolean)
      .map((player: any) => ({
        id: String(player?.id ?? ""),
        name: String(player?.name ?? "").trim() || "Player",
        teamName: String(player?.team_name ?? "").trim() || null,
      }))
    const spotlightRoundCompleteReason =
      stage === "round_summary"
        ? Math.max(0, Number(spotlightState.currentTurnIndex ?? 0) || 0) >= spotlightState.turnOrderPlayerIds.length
          ? "all_turns_complete"
          : "card_pool_exhausted"
        : null

    spotlight = {
      stage,
      turnSeconds: getSpotlightTurnSeconds(currentRound),
      tvDisplayMode: getSpotlightTvDisplayMode(currentRound),
      activeGuesserId: spotlightState.activeGuesserId,
      activeGuesserName,
      activeTeamName,
      currentTurnIndex: spotlightState.currentTurnIndex,
      totalTurns: spotlightState.turnOrderPlayerIds.length,
      turnOrder,
      currentTurnActions: (spotlightState.currentTurnActions ?? []).map((action) => {
        const question = questionMap.get(String(action.questionId ?? "").trim())
        return {
          questionId: String(action.questionId ?? ""),
          action: action.action,
          at: action.at,
          questionText: question?.text?.trim() || "",
          itemType: String(question?.meta?.itemType ?? "").trim() || null,
          difficulty: String(question?.meta?.difficulty ?? "").trim() || null,
        }
      }),
      completedTurns: (spotlightState.completedTurns ?? []).map((turn) => {
        const guesser = players.find((player: any) => String(player?.id ?? "") === String(turn.activeGuesserId ?? "")) ?? null
        return {
          ...turn,
          activeGuesserName: String(guesser?.name ?? "").trim() || "Player",
          actions: (turn.actions ?? []).map((action) => {
            const question = questionMap.get(String(action.questionId ?? "").trim())
            return {
              questionId: String(action.questionId ?? ""),
              action: action.action,
              at: action.at,
              questionText: question?.text?.trim() || "",
              itemType: String(question?.meta?.itemType ?? "").trim() || null,
              difficulty: String(question?.meta?.difficulty ?? "").trim() || null,
            }
          }),
        }
      }),
      reviewAutoAdvanceAt: spotlightReviewAutoAdvanceAt,
      willAdvanceToNextTurn,
      nextGuesserId: nextReadyTurn.activeGuesserId,
      nextGuesserName,
      nextTeamName,
      roundCompleteReason: spotlightRoundCompleteReason,
      cardPoolSize: currentRound.questionIds.length,
    }
  }

  let finalResults: any = null
  if (room.phase === "finished") {
    const allAnswersRes = await supabaseAdmin
      .from("answers")
      .select("player_id, question_id, score_delta")
      .eq("room_id", room.id)

    finalResults = await buildFinalResults(players, questionIds.map(String), roundPlan, allAnswersRes.data ?? [], isInfiniteMode)
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
      isInfiniteMode,
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
    mode: {
      isInfinite: isInfiniteMode,
    },
    progress: {
      currentQuestionNumber,
      totalQuestions: questionCount,
      label: progressLabel,
    },
    settings: {
      untimedAnswers: isUntimedAnswers,
      answerSeconds: isUntimedAnswers ? null : configuredAnswerSeconds,
      answerAutoSubmitGraceSeconds: isUntimedAnswers ? 0 : ANSWER_AUTO_SUBMIT_GRACE_SECONDS,
    },
    rounds: {
      buildMode: storedRoundPlan.buildMode,
      count: roundCount,
      names: roundNames,
      jokerEligibleCount: countJokerEligibleRounds(roundPlan),
      jokerEnabled: isJokerEnabledForRoundPlan(roundPlan),
      plan: roundPlan,
      current: {
        index: currentRound.index,
        number: currentRound.number,
        name: currentRound.name,
        behaviourType: currentRound.behaviourType,
        jokerEligible: currentRound.jokerEligible,
        countsTowardsScore: currentRound.countsTowardsScore,
        startIndex: currentRound.startIndex,
        endIndex: currentRound.endIndex,
        questionsInRound: currentRound.size,
        questionNumberInRound,
        answerSeconds: configuredAnswerSeconds,
        roundReviewSeconds,
        isInfinite: isInfiniteModeFromRound(currentRound),
      },
    },
    times: {
      openAt: room.open_at,
      closeAt: room.close_at,
      revealAt: room.reveal_at,
      nextAt: room.next_at,
      roundSummaryEndsAt,
    },
    question: questionPublic,
    reveal: revealData,
    spotlight,
    questionStats,
    roundStats,
    roundReview,
    finalResults,
    players,
  })
}