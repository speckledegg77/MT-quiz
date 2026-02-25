export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function isNameTakenError(err: any) {
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "");
  if (code === "23505") return true;
  if (msg.includes("players_room_normalised_name_unique")) return true;
  return false;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase();
  const name = String(body.name ?? "").trim();

  if (!code || !name) return NextResponse.json({ error: "Missing code or name" }, { status: 400 });

  const roomRes = await supabaseAdmin
    .from("rooms")
    .select("id, code, phase")
    .eq("code", code)
    .single();

  if (roomRes.error) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  if (roomRes.data.phase !== "lobby") {
    return NextResponse.json(
      { error: "Game already started. Ask the host to reset the room." },
      { status: 400 }
    );
  }

  const playerRes = await supabaseAdmin
    .from("players")
    .insert({ room_id: roomRes.data.id, name })
    .select("id")
    .single();

  if (playerRes.error) {
    if (isNameTakenError(playerRes.error)) {
      return NextResponse.json(
        { error: "That team name is already taken. Try another one.", code: "NAME_TAKEN" },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "Could not join" }, { status: 500 });
  }

  return NextResponse.json({ playerId: playerRes.data.id, code });
}