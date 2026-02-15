export const runtime = "nodejs"

import { supabaseAdmin } from "../../../lib/supabaseAdmin"

function contentTypeForPath(path: string) {
  const lower = path.toLowerCase()
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".webp")) return "image/webp"
  if (lower.endsWith(".gif")) return "image/gif"
  return "application/octet-stream"
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const path = String(searchParams.get("path") ?? "").trim()

  if (!path) return new Response("Missing path", { status: 400 })

  const { data, error } = await supabaseAdmin.storage.from("images").download(path)
  if (error || !data) return new Response("Image not found", { status: 404 })

  const buf = await data.arrayBuffer()
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": contentTypeForPath(path),
      "Cache-Control": "public, max-age=3600",
    },
  })
}
