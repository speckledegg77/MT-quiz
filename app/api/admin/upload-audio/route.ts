export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"

function unauthorised() {
  return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
}

function safeName(name: string) {
  return String(name ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
}

export async function POST(req: Request) {
  const token = req.headers.get("x-admin-token")
  if (!token || token !== process.env.ADMIN_TOKEN) return unauthorised()

  const contentType = String(req.headers.get("content-type") ?? "").toLowerCase()
  if (!contentType.includes("application/json")) {
    return NextResponse.json(
      { error: "Send JSON body with { filename, path? }. Do not upload the file to this endpoint." },
      { status: 400 }
    )
  }

  const body = (await req.json().catch(() => null)) as null | { filename?: string; path?: string }
  const filename = safeName(body?.filename || "audio")
  const desiredPath = String(body?.path ?? "").trim()

  const folder = new Date().toISOString().slice(0, 10)
  const path = desiredPath ? desiredPath : `${folder}/${Date.now()}-${filename}`

  const { data, error } = await supabaseAdmin.storage.from("audio").createSignedUploadUrl(path, { upsert: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.token) return NextResponse.json({ error: "No signed upload token returned" }, { status: 500 })

  return NextResponse.json({ ok: true, bucket: "audio", path: data.path ?? path, token: data.token })
}
