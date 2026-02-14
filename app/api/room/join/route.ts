export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const code = String(body.code ?? "").trim().toUpperCase()
  const name = String(body.name ?? "").trim()

  if (!code || !name) return NextResponse.json({ error: "Missing code or name" }, { status: 400 })

  const roomRes = await supabaseAdmin
    .from("rooms")
    .select("id, code, phase")
    .eq("code", code)
    .single()

  if (roomRes.error) return NextResponse.json({ error: "Room not found" }, { status: 404 })

  if (roomRes.data.phase !== "lobby") {
    return NextResponse.json({ error: "Game already started. Ask the host to create a new room." }, { status: 400 })
  }

  const playerRes = await supabaseAdmin
    .from("players")
    .insert({ room_id: roomRes.data.id, name })
    .select("id")
    .single()

  if (playerRes.error) return NextResponse.json({ error: "Could not join" }, { status: 500 })

  return NextResponse.json({ playerId: playerRes.data.id, code })
}
