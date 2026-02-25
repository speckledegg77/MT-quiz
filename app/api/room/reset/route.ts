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

function normaliseRoundFilter(raw: any): RoundFilter {
  const v = String(raw ?? "").toLowerCase();

  if (v === "no_audio") return "no_audio";
  if (v === "no_image") return "no_image";
  if (v === "audio_only") return "audio_only";
  if (v === "picture_only") return "picture_only";
  if (v === "audio_and_image") return "audio_and_image";

  return "mixed";
}

function normaliseStrategy(raw: any): SelectionStrategy {
  const v = String(raw ?? "").toLowerCase();
  return v === "per_pack" ? "per_pack" : "all_packs";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const roomRes = await supabaseAdmin.from("rooms").select("*").eq("code", code).single();
  if (roomRes.error) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  const room = roomRes.data;

  const selectedPacks: string[] = Array.isArray(room.selected_packs) ? room.selected_packs : [];
  const roundsRaw: any[] = Array.isArray(room.rounds) ? room.rounds : [];

  const strategy: SelectionStrategy = normaliseStrategy(room.selection_strategy);
  const roundFilter: RoundFilter = normaliseRoundFilter(room.round_filter);

  const previousCount = Array.isArray(room.question_ids) ? room.question_ids.length : 0;
  const totalQuestionsRaw = Number(room.total_questions ?? previousCount);
  const totalQuestions =
    Number.isFinite(totalQuestionsRaw) && totalQuestionsRaw > 0 ? Math.floor(totalQuestionsRaw) : 20;

  const packIdsFromRounds = roundsRaw
    .map((r) => String(r?.pack_id ?? "").trim())
    .filter(Boolean);

  const packIds = Array.from(new Set([...(selectedPacks ?? []), ...packIdsFromRounds])).filter(Boolean);

  if (packIds.length === 0) {
    return NextResponse.json({ error: "No packs stored for this room" }, { status: 400 });
  }

  let selectionPacks: PackSelectionInput[] = [];

  if (strategy === "per_pack" && roundsRaw.length > 0) {
    selectionPacks = roundsRaw
      .map((r) => ({
        pack_id: String(r?.pack_id ?? "").trim(),
        count: Math.max(1, Math.floor(Number(r?.count ?? 0))),
      }))
      .filter((r) => r.pack_id && Number.isFinite(r.count) && r.count > 0);
  }

  if (selectionPacks.length === 0) {
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
    return NextResponse.json({ error: "No questions available for reset" }, { status: 400 });
  }

  // Clear game data
  const delAnswers = await supabaseAdmin.from("answers").delete().eq("room_id", room.id);
  if (delAnswers.error) {
    return NextResponse.json({ error: delAnswers.error.message }, { status: 500 });
  }

  const delResults = await supabaseAdmin.from("round_results").delete().eq("room_id", room.id);
  if (delResults.error) {
    return NextResponse.json({ error: delResults.error.message }, { status: 500 });
  }

  const resetPlayers = await supabaseAdmin.from("players").update({ score: 0 }).eq("room_id", room.id);
  if (resetPlayers.error) {
    return NextResponse.json({ error: resetPlayers.error.message }, { status: 500 });
  }

  const resetRoom = await supabaseAdmin
    .from("rooms")
    .update({
      phase: "lobby",
      question_ids: pickedIds,
      question_index: 0,
      countdown_start_at: null,
      open_at: null,
      close_at: null,
      reveal_at: null,
      next_at: null,
    })
    .eq("id", room.id);

  if (resetRoom.error) {
    return NextResponse.json({ error: resetRoom.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, code });
}