export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function normaliseRoundCount(raw: any, questionCount: number) {
  const qc = Math.max(1, Math.floor(Number(questionCount ?? 0)) || 1);
  const requested = Math.floor(Number(raw ?? 4));
  const safe = Number.isFinite(requested) ? requested : 4;
  const capped = clampInt(safe, 1, 20);
  return Math.min(capped, qc);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const code = String(body.code ?? "").trim().toUpperCase();
  const playerId = String(body.playerId ?? "").trim();
  const jokerRoundIndex = Number(body.jokerRoundIndex);

  if (!code || !playerId || !Number.isFinite(jokerRoundIndex)) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const roomRes = await supabaseAdmin
    .from("rooms")
    .select("id, phase, question_ids, round_count")
    .eq("code", code)
    .single();

  if (roomRes.error) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const room = roomRes.data;

  if (room.phase !== "lobby") {
    return NextResponse.json({ error: "Joker selection is only available before the game starts." }, { status: 400 });
  }

  const ids = Array.isArray(room.question_ids) ? room.question_ids : [];
  const roundCount = normaliseRoundCount(room.round_count, ids.length);

  if (jokerRoundIndex < 0 || jokerRoundIndex >= roundCount) {
    return NextResponse.json({ error: "Invalid joker round." }, { status: 400 });
  }

  const playerRes = await supabaseAdmin
    .from("players")
    .select("id, room_id")
    .eq("id", playerId)
    .single();

  if (playerRes.error) return NextResponse.json({ error: "Player not found" }, { status: 404 });
  if (playerRes.data.room_id !== room.id) return NextResponse.json({ error: "Player not in this room" }, { status: 400 });

  const upd = await supabaseAdmin
    .from("players")
    .update({ joker_round_index: jokerRoundIndex })
    .eq("id", playerId);

  if (upd.error) return NextResponse.json({ error: "Could not save joker selection" }, { status: 500 });

  return NextResponse.json({ ok: true, jokerRoundIndex });
}