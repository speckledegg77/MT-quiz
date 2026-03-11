export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { z } from "zod"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type RouteContext = {
  params: Promise<{
    showKey: string
  }>
}

function cleanAltNames(values: string[] | undefined) {
  return (values ?? []).map((value) => value.trim()).filter(Boolean)
}

const updateShowSchema = z
  .object({
    displayName: z.string().trim().min(1).optional(),
    altNames: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.altNames !== undefined ||
      value.isActive !== undefined,
    { message: "At least one field must be provided." }
  )

export async function PATCH(req: Request, context: RouteContext) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  const { showKey } = await context.params

  let body: unknown

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 })
  }

  const parsed = updateShowSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload." }, { status: 400 })
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (parsed.data.displayName !== undefined) {
    update.display_name = parsed.data.displayName.trim()
  }

  if (parsed.data.altNames !== undefined) {
    update.alt_names = cleanAltNames(parsed.data.altNames)
  }

  if (parsed.data.isActive !== undefined) {
    update.is_active = parsed.data.isActive
  }

  const updateRes = await supabaseAdmin
    .from("shows")
    .update(update)
    .eq("show_key", showKey)
    .select("show_key, display_name, alt_names, is_active, created_at, updated_at")
    .maybeSingle()

  if (updateRes.error) {
    return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
  }

  if (!updateRes.data) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 })
  }

  return NextResponse.json({ ok: true, show: updateRes.data })
}