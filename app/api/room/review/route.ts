export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { getQuestionById } from "@/lib/questionBank"
import { findRoundForQuestionIndex, getEffectiveRoomRoundPlan, materialiseRoundPlan } from "@/lib/roomRoundPlan"
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { normaliseTextAnswer } from "@/lib/textAnswers"

type OverrideRow = {
  answer_id: string
  original_is_correct: boolean
  original_score_delta: number
  overridden_is_correct: boolean
  overridden_score_delta: number
  reason: string | null
  created_at: string
  updated_at: string
}

function labelOption(optionIndex: number | null | undefined) {
  if (!Number.isFinite(Number(optionIndex))) return null
  return ["A", "B", "C", "D"][Number(optionIndex)] ?? null
}

async function readOverrideRows(roomId: string) {
  const res = await supabaseAdmin
    .from("answer_review_overrides")
    .select("answer_id, original_is_correct, original_score_delta, overridden_is_correct, overridden_score_delta, reason, created_at, updated_at")
    .eq("room_id", roomId)

  if (!res.error) return (res.data ?? []) as OverrideRow[]

  const message = String(res.error.message ?? "").toLowerCase()
  if (message.includes("does not exist") || message.includes("schema cache")) {
    return [] as OverrideRow[]
  }

  throw new Error(res.error.message)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = String(searchParams.get("code") ?? "").trim().toUpperCase()

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 })
  }

  const roomRes = await supabaseAdmin.from("rooms").select("*").eq("code", code).single()
  if (roomRes.error || !roomRes.data) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 })
  }

  const room = roomRes.data

  const playersRes = await supabaseAdmin
    .from("players")
    .select("id, name, team_name")
    .eq("room_id", room.id)
    .order("joined_at", { ascending: true })

  if (playersRes.error) {
    return NextResponse.json({ error: playersRes.error.message }, { status: 500 })
  }

  const answersRes = await supabaseAdmin
    .from("answers")
    .select("id, player_id, question_id, option_index, answer_text, is_correct, joker_active, score_delta, round_index, received_at")
    .eq("room_id", room.id)
    .order("received_at", { ascending: true })

  if (answersRes.error) {
    return NextResponse.json({ error: answersRes.error.message }, { status: 500 })
  }

  let overrideRows: OverrideRow[] = []
  try {
    overrideRows = await readOverrideRows(room.id)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Could not load answer overrides." }, { status: 500 })
  }

  const playerMap = new Map(
    (playersRes.data ?? []).map((player: any) => [String(player.id), {
      id: String(player.id),
      name: String(player.name ?? "").trim() || "Player",
      teamName: String(player.team_name ?? "").trim() || null,
    }])
  )

  const overrideMap = new Map(overrideRows.map((row) => [String(row.answer_id), row]))
  const answers = (answersRes.data ?? []).map((answer: any) => ({
    id: String(answer.id),
    playerId: String(answer.player_id),
    questionId: String(answer.question_id),
    optionIndex: Number.isFinite(Number(answer.option_index)) ? Number(answer.option_index) : null,
    answerText: answer.answer_text == null ? null : String(answer.answer_text),
    isCorrect: Boolean(answer.is_correct),
    jokerActive: Boolean(answer.joker_active),
    scoreDelta: Number(answer.score_delta ?? 0) || 0,
    roundIndex: Math.max(0, Number(answer.round_index ?? 0) || 0),
    receivedAt: answer.received_at ? String(answer.received_at) : null,
  }))

  const answersByQuestion = new Map<string, typeof answers>()
  for (const answer of answers) {
    const existing = answersByQuestion.get(answer.questionId) ?? []
    existing.push(answer)
    answersByQuestion.set(answer.questionId, existing)
  }

  const storedRoundPlan = getEffectiveRoomRoundPlan(room)
  const roundPlan = materialiseRoundPlan(storedRoundPlan)
  const questionIds = Array.isArray(room.question_ids) ? room.question_ids.map(String) : []
  const currentQuestionIndex = Math.max(0, Number(room.question_index ?? 0) || 0)
  const currentRound = questionIds.length > 0 ? findRoundForQuestionIndex(Math.min(currentQuestionIndex, Math.max(questionIds.length - 1, 0)), roundPlan) : null

  const rounds = roundPlan.map((round) => ({
    roundIndex: round.index,
    roundNumber: round.number,
    roundName: round.name,
    behaviourType: round.behaviourType,
    isCurrentRound: currentRound ? currentRound.index === round.index : false,
    questions: [] as any[],
  }))

  for (let questionIndex = 0; questionIndex < questionIds.length; questionIndex += 1) {
    const questionId = String(questionIds[questionIndex] ?? "").trim()
    if (!questionId) continue

    const questionAnswers = answersByQuestion.get(questionId) ?? []
    if (questionAnswers.length === 0) continue

    const question = await getQuestionById(questionId)
    if (!question || question.answerType === "none") continue

    const round = findRoundForQuestionIndex(questionIndex, roundPlan)
    const reviewableAnswers = questionAnswers.map((answer) => {
      const player = playerMap.get(answer.playerId)
      const override = overrideMap.get(answer.id) ?? null
      const submittedOptionText = answer.optionIndex !== null && Array.isArray(question.options)
        ? question.options[answer.optionIndex] ?? null
        : null
      const submittedResponse = question.answerType === "text"
        ? answer.answerText ?? ""
        : submittedOptionText ?? ""

      return {
        answerId: answer.id,
        playerId: answer.playerId,
        playerName: player?.name ?? "Player",
        teamName: player?.teamName ?? null,
        receivedAt: answer.receivedAt,
        jokerActive: answer.jokerActive,
        original: {
          isCorrect: override ? Boolean(override.original_is_correct) : Boolean(answer.isCorrect),
          scoreDelta: override ? Number(override.original_score_delta ?? 0) || 0 : Number(answer.scoreDelta ?? 0) || 0,
        },
        effective: {
          isCorrect: Boolean(answer.isCorrect),
          scoreDelta: Number(answer.scoreDelta ?? 0) || 0,
        },
        override: override
          ? {
              overriddenIsCorrect: Boolean(override.overridden_is_correct),
              overriddenScoreDelta: Number(override.overridden_score_delta ?? 0) || 0,
              reason: String(override.reason ?? "").trim() || null,
              createdAt: override.created_at,
              updatedAt: override.updated_at,
            }
          : null,
        submission: {
          optionIndex: answer.optionIndex,
          optionLabel: labelOption(answer.optionIndex),
          optionText: submittedOptionText,
          answerText: answer.answerText,
          displayText: submittedResponse,
          normalisedAnswerText: question.answerType === "text" ? normaliseTextAnswer(answer.answerText ?? "") : null,
        },
      }
    })

    const roundEntry = rounds[round.index]
    if (!roundEntry) continue

    roundEntry.questions.push({
      questionId,
      questionIndex,
      questionNumber: questionIndex + 1,
      questionNumberInRound: questionIndex - round.startIndex + 1,
      isCurrentQuestion: questionIndex === currentQuestionIndex,
      answerType: question.answerType,
      questionText: question.text,
      correctAnswer: question.answerType === "text"
        ? String(question.answerText ?? "")
        : question.answerIndex != null
          ? question.options[question.answerIndex] ?? ""
          : "",
      acceptedAnswers: question.answerType === "text" ? (question.acceptedAnswers ?? []) : [],
      explanation: question.explanation ?? "",
      answers: reviewableAnswers,
    })
  }

  const reviewRounds = rounds.filter((round) => round.questions.length > 0)

  return NextResponse.json({
    ok: true,
    room: {
      id: room.id,
      code: room.code,
      phase: room.phase,
      questionIndex: currentQuestionIndex,
      currentRoundIndex: currentRound?.index ?? null,
    },
    review: {
      totalAnsweredQuestions: reviewRounds.reduce((sum, round) => sum + round.questions.length, 0),
      rounds: reviewRounds,
    },
  })
}
