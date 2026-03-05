export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

type GameMode = "teams" | "solo";

function isNameTakenError(err: any) {
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "");
  if (code === "23505") return true;
  if (msg.includes("players_room_normalised_name_unique")) return true;
  return false;
}

function normaliseTeamNames(raw: any): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
  return [];
}

function isTeamAllowed(teamName: string, allowed: string[]) {
  const key = teamName.trim().toLowerCase();
  return allowed.some((t) => t.trim().toLowerCase() === key);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const code = String(body.code ?? "").trim().toUpperCase();

  // Backwards compatible:
  // - old clients send { name }
  // - new clients send { playerName }
  const playerName = String(body.playerName ?? body.name ?? "").trim();
  const teamNameRaw = body.teamName;
  const teamName = teamNameRaw == null ? "" : String(teamNameRaw).trim();

  if (!code || !playerName) return NextResponse.json({ error: "Missing code or name" }, { status: 400 });

  const roomRes = await supabaseAdmin
    .from("rooms")
    .select("id, code, phase, game_mode, team_names")
    .eq("code", code)
    .single();

  if (roomRes.error) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  if (roomRes.data.phase !== "lobby") {
    return NextResponse.json(
      { error: "Game already started. Ask the host to reset the room." },
      { status: 400 }
    );
  }

  const gameMode: GameMode = String(roomRes.data.game_mode ?? "teams") === "solo" ? "solo" : "teams";
  const allowedTeams = normaliseTeamNames(roomRes.data.team_names);

  let teamToSave: string | null = null;

  if (gameMode === "teams") {
    if (!teamName) {
      return NextResponse.json({ error: "Pick a team." }, { status: 400 });
    }

    if (allowedTeams.length > 0 && !isTeamAllowed(teamName, allowedTeams)) {
      return NextResponse.json({ error: "That team is not available for this room." }, { status: 400 });
    }

    teamToSave = allowedTeams.length > 0
      ? allowedTeams.find((t) => t.trim().toLowerCase() === teamName.trim().toLowerCase()) ?? teamName
      : teamName;
  }

  const playerRes = await supabaseAdmin
    .from("players")
    .insert({ room_id: roomRes.data.id, name: playerName, team_name: teamToSave })
    .select("id")
    .single();

  if (playerRes.error) {
    if (isNameTakenError(playerRes.error)) {
      return NextResponse.json(
        { error: "That name is already taken in this room. Try another one.", code: "NAME_TAKEN" },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "Could not join" }, { status: 500 });
  }

  return NextResponse.json({ playerId: playerRes.data.id, code });
}
