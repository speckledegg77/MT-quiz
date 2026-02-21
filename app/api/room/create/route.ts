export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

import {
  buildQuestionIdList,
  SelectionError,
  type PackSelectionInput,
  type QuestionMeta,
  type RoundFilter,
  type SelectionStrategy,
} from "../../../../lib/questionSelection";

type RoundRequest = { packId: string; count: number };

function randomCode(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function normaliseRoundFilter(raw: any): RoundFilter {
  const v = String(raw ?? "").toLowerCase();
  if (v === "no_audio") return "no_audio";
  if (v === "audio_only") return "audio_only";
  if (v === "picture_only") return "picture_only";
  return "mixed";
}

function normaliseStrategy(raw: any): SelectionStrategy | null {
  const v = String(raw ?? "").toLowerCase();
  if (v === "per_pack") return "per_pack";
  if (v === "all_packs") return "all_packs";
  return null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const countdownSeconds = Number(body.countdownSeconds ?? 3);
  const answerSeconds = Number(body.answerSeconds ?? 60);
  const revealDelaySeconds = Number(body.revealDelaySeconds ?? 2);
  const revealSeconds = Number(body.revealSeconds ?? 5);

  const audioModeRaw = String(body.audioMode ?? "display").toLowerCase();
  const audioMode = audioModeRaw === "phones" || audioModeRaw === "both" ? audioModeRaw : "display";

  const roundFilter: RoundFilter = normaliseRoundFilter(body.roundFilter);

  const roundsInput: any[] = Array.isArray(body.rounds) ? body.rounds : [];
  const rounds: RoundRequest[] = roundsInput
    .map((r) => ({
      packId: String(r?.packId ?? "").trim(),
      count: Number(r?.count ?? 0),
    }))
    .filter((r) => r.packId && Number.isFinite(r.count) && r.count > 0);

  const roundsTotal = rounds.reduce((sum, r) => sum + Math.max(0, Math.floor(Number(r.count))), 0);

  const selectedPacksInput: any[] = Array.isArray(body.selectedPacks) ? body.selectedPacks : [];
  const selectedPacks: string[] = selectedPacksInput
    .map((x) => String(x ?? "").trim())
    .filter((x) => x.length > 0);

  // Backwards compatible total:
  // - old host sends questionCount
  // - new host sends totalQuestions
  const totalQuestionsRaw =
    body.totalQuestions != null ? Number(body.totalQuestions) : body.questionCount != null ? Number(body.questionCount) : roundsTotal;

  const totalQuestions = Number.isFinite(totalQuestionsRaw) && totalQuestionsRaw > 0 ? Math.floor(totalQuestionsRaw) : 20;

  const strategyFromBody = normaliseStrategy(body.selectionStrategy);
  const inferredStrategy: SelectionStrategy = rounds.length > 0 ? "per_pack" : "all_packs";
  const strategy: SelectionStrategy = strategyFromBody ?? inferredStrategy;

  const packIdsFromRounds = Array.from(new Set(rounds.map((r) => r.packId)));
  const packIds = Array.from(new Set([...(selectedPacks.length ? selectedPacks : []), ...packIdsFromRounds])).filter(Boolean);

  if (packIds.length === 0) {
    return NextResponse.json({ error: "Pick at least one pack" }, { status: 400 });
  }

  // Build the selector input list
  let selectionPacks: PackSelectionInput[] = [];
  if (strategy === "per_pack" && rounds.length > 0) {
    selectionPacks = rounds.map((r) => ({ pack_id: r.packId, count: Math.max(1, Math.floor(Number(r.count))) }));
  } else {
    selectionPacks = packIds.map((id) => ({ pack_id: id }));
  }

  // Fetch question ids and round types for each selected pack
  const packQuestionsById: Record<string, QuestionMeta[]> = {};
  for (const pid of packIds) packQuestionsById[pid] = [];

  const linksRes = await supabaseAdmin
    .from("pack_questions")
    .select("pack_id, question_id, questions(round_type)")
    .in("pack_id", packIds);

  if (linksRes.error) {
    return NextResponse.json({ error: linksRes.error.message }, { status: 500 });
  }

  for (const row of (linksRes.data ?? []) as any[]) {
    const pid = String(row.pack_id ?? "").trim();
    const qid = String(row.question_id ?? "").trim();
    const rt = row.questions?.round_type;

    if (!pid || !qid) continue;

    const round_type: "general" | "audio" | "picture" =
      rt === "audio" ? "audio" : rt === "picture" ? "picture" : "general";

    packQuestionsById[pid] ??= [];
    packQuestionsById[pid].push({ id: qid, round_type });
  }

  let pickedIds: string[] = [];

  try {
    const result = buildQuestionIdList({
      packs: selectionPacks,
      packQuestionsById,
      strategy,
      totalQuestions,
      roundFilter,
    });

    pickedIds = result.questionIds;
  } catch (e: any) {
    if (e instanceof SelectionError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: e?.message ?? "Could not pick questions" }, { status: 400 });
  }

  if (pickedIds.length === 0) {
    return NextResponse.json(
      { error: packIds.length ? `No questions found for packs: ${packIds.join(", ")}` : "No questions found" },
      { status: 400 }
    );
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode(8);

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
        selected_packs: packIds,
      })
      .select("code")
      .single();

    if (!ins.error) return NextResponse.json({ code: ins.data.code });
  }

  return NextResponse.json({ error: "Could not create room" }, { status: 500 });
}