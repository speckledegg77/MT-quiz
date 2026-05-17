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
        error: "CRON_SECRET is not set.",
      },
      500,
    )
  }

  const authHeader = request.headers.get("authorization")

  if (authHeader !== `Bearer ${cronSecret}`) {
    return jsonResponse(
      {
        ok: false,
        error: "Unauthorised.",
      },
      401,
    )
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL

  const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE

  if (!supabaseUrl) {
    return jsonResponse(
      {
        ok: false,
        error: "Supabase URL is not set.",
      },
      500,
    )
  }

  if (!supabaseSecretKey) {
    return jsonResponse(
      {
        ok: false,
        error:
          "No server-side Supabase secret key found. Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
      },
      500,
    )
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const { data, error, count } = await supabase
    .from("shows")
    .select("show_key", { count: "exact" })
    .limit(1)

  if (error) {
    return jsonResponse(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        table: "shows",
        error: error.message,
      },
      500,
    )
  }

  return jsonResponse({
    ok: true,
    checkedAt: new Date().toISOString(),
    table: "shows",
    rowsReturned: data?.length ?? 0,
    totalRows: count ?? null,
  })
}