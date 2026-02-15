export const runtime = "nodejs"

import { supabaseAdmin } from "../../../lib/supabaseAdmin"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const raw = String(searchParams.get("path") ?? "").trim()
  const path = raw.replace(/^\/+/, "")
  if (!path) return new Response("Missing path", { status: 400 })

  const { data, error } = await supabaseAdmin.storage.from("audio").createSignedUrl(path, 60 * 60)

  if (error || !data?.signedUrl) {
    return new Response("Audio not found", { status: 404 })
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: data.signedUrl,
      "Cache-Control": "private, max-age=300",
    },
  })
}
