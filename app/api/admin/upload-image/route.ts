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

  const form = await req.formData()
  const file = form.get("file") as File | null
  const desiredPath = String(form.get("path") ?? "").trim()

  if (!file) return NextResponse.json({ error: "Missing file field" }, { status: 400 })
  if (typeof (file as any).arrayBuffer !== "function") return NextResponse.json({ error: "Invalid file" }, { status: 400 })

  const originalName = safeName((file as any).name || "image")
  const folder = new Date().toISOString().slice(0, 10)
  const path = desiredPath ? desiredPath : `${folder}/${Date.now()}-${originalName}`

  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error } = await supabaseAdmin.storage.from("images").upload(path, bytes, {
    contentType: (file as any).type || "application/octet-stream",
    upsert: true,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, bucket: "images", path })
}
