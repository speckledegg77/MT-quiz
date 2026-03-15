export const runtime = "nodejs"

import { NextResponse } from "next/server"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import {
  buildRoundReadinessReport,
  type ReadinessPackLinkRow,
  type ReadinessPackRow,
  type ReadinessQuestionRow,
  type ReadinessShowRow,
} from "@/lib/roundReadiness"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function GET(req: Request) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  const [questionsRes, packLinksRes, packsRes, showsRes] = await Promise.all([
    supabaseAdmin
      .from("questions")
      .select(
        "id, round_type, answer_type, media_type, audio_path, image_path, prompt_target, clue_source, primary_show_key, metadata_review_state, media_duration_ms, audio_clip_type"
      )
      .order("id", { ascending: true }),
    supabaseAdmin.from("pack_questions").select("question_id, pack_id"),
    supabaseAdmin.from("packs").select("id, display_name").eq("is_active", true).order("display_name"),
    supabaseAdmin.from("shows").select("show_key, display_name").eq("is_active", true).order("display_name"),
  ])

  if (questionsRes.error) return NextResponse.json({ error: questionsRes.error.message }, { status: 500 })
  if (packLinksRes.error) return NextResponse.json({ error: packLinksRes.error.message }, { status: 500 })
  if (packsRes.error) return NextResponse.json({ error: packsRes.error.message }, { status: 500 })
  if (showsRes.error) return NextResponse.json({ error: showsRes.error.message }, { status: 500 })

  const report = buildRoundReadinessReport({
    questions: (questionsRes.data ?? []) as ReadinessQuestionRow[],
    packLinks: (packLinksRes.data ?? []) as ReadinessPackLinkRow[],
    packs: (packsRes.data ?? []) as ReadinessPackRow[],
    shows: (showsRes.data ?? []) as ReadinessShowRow[],
  })

  return NextResponse.json({
    ok: true,
    report,
  })
}
