export const runtime = "nodejs"

import { supabaseAdmin } from "../../../lib/supabaseAdmin"

function contentTypeForPath(path: string) {
  const lower = path.toLowerCase()
  if (lower.endsWith(".mp3")) return "audio/mpeg"
  if (lower.endsWith(".wav")) return "audio/wav"
  if (lower.endsWith(".m4a")) return "audio/mp4"
  if (lower.endsWith(".ogg")) return "audio/ogg"
  return "application/octet-stream"
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const path = String(searchParams.get("path") ?? "").trim()

  if (!path) {
    return new Response("Missing path", { status: 400 })
  }

  const { data, error } = await supabaseAdmin.storage.from("audio").download(path)
  if (error || !data) {
    return new Response("Audio not found", { status: 404 })
  }

  const buf = await data.arrayBuffer()

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": contentTypeForPath(path),
      "Cache-Control": "public, max-age=3600"
    }
  })
}
