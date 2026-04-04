export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { getQuestionById } from "@/lib/questionBank"
import { getScoreDeltaForRound } from "@/lib/roundFlow"
import { getEffectiveRoomRoundPlan, materialiseRoundPlan } from "@/lib/roomRoundPlan"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type ReviewResolution = "accept" | "reject" | "restore"

type OverrideRow = {
  answer_id: string
  original_is_correct: boolean
  original_score_delta: number
}

async function readOverrideRow(answerId: string) {
  const res = await supabaseAdmin
    .from("answer_review_overrides")
    .select("answer_id, original_is_correct, original_score_delta")
    .eq("answer_id", answerId)
    .maybeSingle()

  if (!res.error) return (res.data as OverrideRow | null) ?? null

  const message = String(res.error.message ?? "").toLowerCase()
  if (message.includes("does not exist") || message.includes("schema cache")) {
    throw new Error("The answer review overrides table is missing. Run the latest SQL step first.")
  }

  throw new Error(res.error.message)
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  const code = String(body.code ?? "").trim().toUpperCase()
  const answerId = String(body.answerId ?? "").trim()
  const resolution = String(body.resolution ?? "").trim().toLowerCase() as ReviewResolution
  const reason = String(body.reason ?? "").trim()

  if (!code || !answerId || !["accept", "reject", "restore"].includes(resolution)) {
    return NextResponse.json({ error: "Missing or invalid fields." }, { status: 400 })
  }

  const roomRes = await supabaseAdmin.from("rooms").select("*").eq("code", code).single()
  if (roomRes.error || !roomRes.data) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 })
  }

  const room = roomRes.data

  const answerRes = await supabaseAdmin
    .from("answers")
    .select("id, room_id, player_id, question_id, is_correct, joker_active, score_delta, round_index")
    .eq("id", answerId)
    .maybeSingle()

  if (answerRes.error || !answerRes.data) {
    return NextResponse.json({ error: "Answer not found." }, { status: 404 })
  }

  const answer = answerRes.data
  if (String(answer.room_id ?? "") !== String(room.id)) {
    return NextResponse.json({ error: "That answer does not belong to this room." }, { status: 400 })
  }

  const question = await getQuestionById(String(answer.question_id ?? ""))
  if (!question || question.answerType !== "text") {
    return NextResponse.json({ error: "Only text answers can be overridden in this version." }, { status: 400 })
  }

  const roundPlan = materialiseRoundPlan(getEffectiveRoomRoundPlan(room))
  const roundIndex = Math.max(0, Number(answer.round_index ?? 0) || 0)
  const round = roundPlan[roundIndex]
  if (!round) {
    return NextResponse.json({ error: "Could not resolve the round for this answer." }, { status: 400 })
  }

  let overrideRow: OverrideRow | null = null
  try {
    overrideRow = await readOverrideRow(answerId)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Could not load answer override state." }, { status: 500 })
  }

  const originalIsCorrect = overrideRow ? Boolean(overrideRow.original_is_correct) : Boolean(answer.is_correct)
  const originalScoreDelta = overrideRow ? Number(overrideRow.original_score_delta ?? 0) || 0 : Number(answer.score_delta ?? 0) || 0
  const currentIsCorrect = Boolean(answer.is_correct)
  const currentScoreDelta = Number(answer.score_delta ?? 0) || 0

  const desiredIsCorrect =
    resolution === "restore"
      ? originalIsCorrect
      : resolution === "accept"
        ? true
        : false

  const desiredScoreDelta =
    resolution === "restore"
      ? originalScoreDelta
      : getScoreDeltaForRound({
          isCorrect: desiredIsCorrect,
          jokerActive: Boolean(answer.joker_active),
          countsTowardsScore: round.countsTowardsScore !== false,
        })

  if (desiredIsCorrect === currentIsCorrect && desiredScoreDelta === currentScoreDelta) {
    return NextResponse.json({ ok: true, changed: false })
  }

  const updateAnswerRes = await supabaseAdmin
    .from("answers")
    .update({
      is_correct: desiredIsCorrect,
      score_delta: desiredScoreDelta,
    })
    .eq("id", answerId)

  if (updateAnswerRes.error) {
    return NextResponse.json({ error: updateAnswerRes.error.message }, { status: 500 })
  }

  const deltaDifference = desiredScoreDelta - currentScoreDelta
  if (deltaDifference !== 0) {
    const scoreRes = await supabaseAdmin.rpc("increment_player_score_by", {
      p_player_id: String(answer.player_id ?? ""),
      p_delta: deltaDifference,
    })

    if (scoreRes.error) {
      return NextResponse.json({ error: scoreRes.error.message }, { status: 500 })
    }
  }

  if (resolution === "restore") {
    if (overrideRow) {
      const deleteOverrideRes = await supabaseAdmin.from("answer_review_overrides").delete().eq("answer_id", answerId)
      if (deleteOverrideRes.error) {
        return NextResponse.json({ error: deleteOverrideRes.error.message }, { status: 500 })
      }
    }
  } else {
    const upsertOverrideRes = await supabaseAdmin
      .from("answer_review_overrides")
      .upsert({
        room_id: room.id,
        answer_id: answerId,
        original_is_correct: originalIsCorrect,
        original_score_delta: originalScoreDelta,
        overridden_is_correct: desiredIsCorrect,
        overridden_score_delta: desiredScoreDelta,
        reason: reason || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "answer_id" })

    if (upsertOverrideRes.error) {
      return NextResponse.json({ error: upsertOverrideRes.error.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    changed: true,
    effective: {
      isCorrect: desiredIsCorrect,
      scoreDelta: desiredScoreDelta,
    },
  })
}
