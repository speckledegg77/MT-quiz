import { createClient } from "@supabase/supabase-js"
import type { NextRequest } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    return jsonResponse(
      {
        ok: false,
        error: "CRON_SECRET is missing from the environment.",
      },
      500,
    )
  }

  const authHeader = request.headers.get("authorization")

  if (authHeader !== `Bearer ${cronSecret}`) {
    return jsonResponse(
      {
        ok: false,
        error: "Unauthorised. The Authorization header does not match CRON_SECRET.",
      },
      401,
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    return jsonResponse(
      {
        ok: false,
        error: "NEXT_PUBLIC_SUPABASE_URL is missing from the environment.",
      },
      500,
    )
  }

  if (!supabaseServiceRoleKey) {
    return jsonResponse(
      {
        ok: false,
        error: "SUPABASE_SERVICE_ROLE_KEY is missing from the environment.",
      },
      500,
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const checkedAt = new Date().toISOString()

  const { error: writeError } = await supabase
    .from("app_keepalive")
    .upsert(
      {
        id: "vercel-cron",
        last_seen_at: checkedAt,
        source: "vercel-cron",
        note: "Daily keepalive for hobby project.",
      },
      {
        onConflict: "id",
      },
    )

  if (writeError) {
    return jsonResponse(
      {
        ok: false,
        checkedAt,
        step: "write_keepalive",
        error: writeError.message,
      },
      500,
    )
  }

  const { data, error: readError, count } = await supabase
    .from("shows")
    .select("show_key", { count: "exact" })
    .limit(1)

  if (readError) {
    return jsonResponse(
      {
        ok: false,
        checkedAt,
        step: "read_shows",
        error: readError.message,
      },
      500,
    )
  }

  return jsonResponse({
    ok: true,
    checkedAt,
    keepalive: "updated",
    tableChecked: "shows",
    rowsReturned: data?.length ?? 0,
    totalRows: count ?? null,
  })
}