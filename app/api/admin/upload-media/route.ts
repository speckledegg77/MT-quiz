export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function unauthorised() {
  return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
}

function cleanFolder(raw: string) {
  const s = String(raw ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return s ? `${s}/` : "";
}

function cleanName(raw: string) {
  // Keep it simple and safe for object keys
  return String(raw ?? "")
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/\s+/g, "-");
}

export async function POST(req: Request) {
  const token = req.headers.get("x-admin-token");
  if (!token || token !== process.env.ADMIN_TOKEN) return unauthorised();

  const contentType = String(req.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Use multipart/form-data with fields: bucket, folder (optional), files" },
      { status: 400 }
    );
  }

  const form = await req.formData();

  const bucketRaw = String(form.get("bucket") ?? "").trim().toLowerCase();
  const bucket = bucketRaw === "audio" || bucketRaw === "images" ? bucketRaw : "";
  if (!bucket) {
    return NextResponse.json({ error: "Invalid bucket. Use audio or images." }, { status: 400 });
  }

  const folder = cleanFolder(String(form.get("folder") ?? ""));
  const upsert = String(form.get("upsert") ?? "true").toLowerCase() !== "false";

  const files = form.getAll("files").filter((f) => typeof (f as any)?.arrayBuffer === "function") as File[];
  if (!files.length) {
    return NextResponse.json({ error: "No files found. Use field name: files" }, { status: 400 });
  }

  const uploaded: Array<{ filename: string; path: string; size: number; contentType: string }> = [];
  const failed: Array<{ filename: string; error: string }> = [];

  for (const file of files) {
    const filename = cleanName(file.name);
    const path = `${folder}${filename}`;

    const bytes = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "application/octet-stream";

    const res = await supabaseAdmin.storage.from(bucket).upload(path, bytes, {
      upsert,
      contentType,
    });

    if (res.error) {
      failed.push({ filename: file.name, error: res.error.message });
      continue;
    }

    uploaded.push({ filename: file.name, path, size: file.size, contentType });
  }

  return NextResponse.json({
    ok: failed.length === 0,
    bucket,
    folder: folder || "",
    upsert,
    uploadedCount: uploaded.length,
    failedCount: failed.length,
    uploaded,
    failed,
  });
}