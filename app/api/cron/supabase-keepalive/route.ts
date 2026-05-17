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
  const expectedHeader = `Bearer ${cronSecret}`

  if (authHeader !== expectedHeader) {
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