export const runtime = "nodejs"

import { NextResponse } from "next/server"

import { isAuthorisedAdminRequest, unauthorisedAdminResponse } from "@/lib/adminAuth"
import { analyseQuestionAnswerAudit, matchesAuditFilter } from "@/lib/questionAudit"
import {
  analyseQuestionMetadata,
  type PackRowForMetadata,
  type QuestionRowForMetadata,
  type ShowRow,
} from "@/lib/questionMetadata"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type QuestionRow = QuestionRowForMetadata & {
  created_at: string
  updated_at: string
  options: unknown
  answer_index: number | null
}

type PackQuestionRow = {
  question_id: string
  pack_id: string
}

type PackRow = PackRowForMetadata

function parseBooleanParam(value: string | null) {
  if (value === null) return null
  const lowered = value.trim().toLowerCase()
  if (lowered === "true") return true
  if (lowered === "false") return false
  return null
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.floor(parsed)
}

function parseOptionalPositiveInt(value: string | null) {
  if (value === null || value.trim() === "") return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.floor(parsed)
}

function warningMatchesFilter(warningState: string | null, warningCount: number) {
  if (!warningState) return true
  if (warningState === "has_warnings") return warningCount > 0
  if (warningState === "no_warnings") return warningCount === 0
  return true
}

function isBlank(value: string | null | undefined) {
  return value === null || value === undefined || value === ""
}

function itemMatchesMetadataGap(
  item: {
    question: {
      round_type?: string | null
      primary_show_key?: string | null
      media_type?: string | null
      prompt_target?: string | null
      clue_source?: string | null
      media_duration_ms?: number | null
      audio_clip_type?: string | null
    }
  },
  metadataGap: string | null
) {
  if (!metadataGap) return true

  const isMissingPrimaryShowKey = isBlank(item.question.primary_show_key)
  const isMissingMediaType = isBlank(item.question.media_type)
  const isMissingPromptTarget = isBlank(item.question.prompt_target)
  const isMissingClueSource = isBlank(item.question.clue_source)
  const isAudioQuestion = String(item.question.media_type ?? "").trim() === "audio" || String(item.question.round_type ?? "").trim() === "audio"
  const isMissingAudioDuration = isAudioQuestion && item.question.media_duration_ms == null
  const isMissingAudioClipType = isAudioQuestion && !String(item.question.audio_clip_type ?? "").trim()

  if (metadataGap === "missing_primary_show_key") return isMissingPrimaryShowKey
  if (metadataGap === "missing_media_type") return isMissingMediaType
  if (metadataGap === "missing_prompt_target") return isMissingPromptTarget
  if (metadataGap === "missing_clue_source") return isMissingClueSource
  if (metadataGap === "missing_audio_duration") return isMissingAudioDuration
  if (metadataGap === "missing_audio_clip_type") return isMissingAudioClipType
  if (metadataGap === "missing_any_core_metadata") {
    return isMissingPrimaryShowKey || isMissingMediaType || isMissingPromptTarget || isMissingClueSource
  }

  return true
}

export async function GET(req: Request) {
  if (!isAuthorisedAdminRequest(req)) return unauthorisedAdminResponse()

  const url = new URL(req.url)
  const packId = url.searchParams.get("packId")?.trim() || null
  const legacyRoundType = url.searchParams.get("legacyRoundType")?.trim() || null
  const answerType = url.searchParams.get("answerType")?.trim() || null
  const mediaType = url.searchParams.get("mediaType")?.trim() || null
  const promptTarget = url.searchParams.get("promptTarget")?.trim() || null
  const clueSource = url.searchParams.get("clueSource")?.trim() || null
  const primaryShowKey = url.searchParams.get("primaryShowKey")?.trim() || null
  const audioClipType = url.searchParams.get("audioClipType")?.trim() || null
  const reviewState = url.searchParams.get("reviewState")?.trim() || null
  const warningState = url.searchParams.get("warningState")?.trim() || null
  const metadataGap = url.searchParams.get("metadataGap")?.trim() || null
  const auditFilter = url.searchParams.get("auditFilter")?.trim() || null
  const search = url.searchParams.get("search")?.trim() || null
  const hasAudio = parseBooleanParam(url.searchParams.get("hasAudio"))
  const hasImage = parseBooleanParam(url.searchParams.get("hasImage"))
  const limit = parseOptionalPositiveInt(url.searchParams.get("limit"))
  const offset = parsePositiveInt(url.searchParams.get("offset"), 0)

  let allowedQuestionIds: string[] | null = null

  if (packId) {
    const packLinksRes = await supabaseAdmin
      .from("pack_questions")
      .select("question_id")
      .eq("pack_id", packId)

    if (packLinksRes.error) {
      return NextResponse.json({ error: packLinksRes.error.message }, { status: 500 })
    }

    allowedQuestionIds = (packLinksRes.data ?? []).map((row: { question_id: string }) => row.question_id)

    if (!allowedQuestionIds.length) {
      return NextResponse.json({ ok: true, total: 0, limit, offset, items: [] })
    }
  }

  let countQuery = supabaseAdmin.from("questions").select("id", { count: "exact", head: true })
  let dataQuery = supabaseAdmin
    .from("questions")
    .select(
      "id, text, round_type, answer_type, options, answer_index, answer_text, explanation, audio_path, image_path, accepted_answers, media_type, prompt_target, clue_source, primary_show_key, metadata_review_state, media_duration_ms, audio_clip_type, created_at, updated_at"
    )
    .order("id", { ascending: true })

  if (allowedQuestionIds) {
    countQuery = countQuery.in("id", allowedQuestionIds)
    dataQuery = dataQuery.in("id", allowedQuestionIds)
  }

  if (limit !== null) {
    dataQuery = dataQuery.range(offset, offset + limit - 1)
  }

  if (legacyRoundType) {
    countQuery = countQuery.eq("round_type", legacyRoundType)
    dataQuery = dataQuery.eq("round_type", legacyRoundType)
  }

  if (answerType) {
    countQuery = countQuery.eq("answer_type", answerType)
    dataQuery = dataQuery.eq("answer_type", answerType)
  }

  if (mediaType) {
    countQuery = countQuery.eq("media_type", mediaType)
    dataQuery = dataQuery.eq("media_type", mediaType)
  }

  if (promptTarget) {
    countQuery = countQuery.eq("prompt_target", promptTarget)
    dataQuery = dataQuery.eq("prompt_target", promptTarget)
  }

  if (clueSource) {
    countQuery = countQuery.eq("clue_source", clueSource)
    dataQuery = dataQuery.eq("clue_source", clueSource)
  }

  if (primaryShowKey) {
    countQuery = countQuery.eq("primary_show_key", primaryShowKey)
    dataQuery = dataQuery.eq("primary_show_key", primaryShowKey)
  }

  if (audioClipType) {
    countQuery = countQuery.eq("audio_clip_type", audioClipType)
    dataQuery = dataQuery.eq("audio_clip_type", audioClipType)
  }

  if (reviewState) {
    countQuery = countQuery.eq("metadata_review_state", reviewState)
    dataQuery = dataQuery.eq("metadata_review_state", reviewState)
  }

  if (hasAudio === true) {
    countQuery = countQuery.not("audio_path", "is", null)
    dataQuery = dataQuery.not("audio_path", "is", null)
  } else if (hasAudio === false) {
    countQuery = countQuery.is("audio_path", null)
    dataQuery = dataQuery.is("audio_path", null)
  }

  if (hasImage === true) {
    countQuery = countQuery.not("image_path", "is", null)
    dataQuery = dataQuery.not("image_path", "is", null)
  } else if (hasImage === false) {
    countQuery = countQuery.is("image_path", null)
    dataQuery = dataQuery.is("image_path", null)
  }

  if (search) {
    countQuery = countQuery.ilike("text", `%${search}%`)
    dataQuery = dataQuery.ilike("text", `%${search}%`)
  }

  const [countRes, questionsRes, showsRes] = await Promise.all([
    countQuery,
    dataQuery,
    supabaseAdmin
      .from("shows")
      .select("show_key, display_name, alt_names, is_active")
      .eq("is_active", true)
      .order("display_name"),
  ])

  if (countRes.error) {
    return NextResponse.json({ error: countRes.error.message }, { status: 500 })
  }

  if (questionsRes.error) {
    return NextResponse.json({ error: questionsRes.error.message }, { status: 500 })
  }

  if (showsRes.error) {
    return NextResponse.json({ error: showsRes.error.message }, { status: 500 })
  }

  const questions = (questionsRes.data ?? []) as QuestionRow[]
  const shows = (showsRes.data ?? []) as ShowRow[]
  const questionIds = questions.map((question) => question.id)

  let packRowsByQuestionId = new Map<string, PackRow[]>()

  if (questionIds.length) {
    const packLinksRes = await supabaseAdmin
      .from("pack_questions")
      .select("question_id, pack_id")
      .in("question_id", questionIds)

    if (packLinksRes.error) {
      return NextResponse.json({ error: packLinksRes.error.message }, { status: 500 })
    }

    const packLinks = (packLinksRes.data ?? []) as PackQuestionRow[]
    const packIds = [...new Set(packLinks.map((row) => row.pack_id))]

    const packsRes = packIds.length
      ? await supabaseAdmin.from("packs").select("id, display_name, round_type").in("id", packIds)
      : { data: [] as PackRow[], error: null }

    if (packsRes.error) {
      return NextResponse.json({ error: packsRes.error.message }, { status: 500 })
    }

    const packsById = new Map<string, PackRow>()
    for (const pack of (packsRes.data ?? []) as PackRow[]) {
      packsById.set(pack.id, pack)
    }

    packRowsByQuestionId = new Map<string, PackRow[]>()
    for (const link of packLinks) {
      const pack = packsById.get(link.pack_id)
      if (!pack) continue
      const current = packRowsByQuestionId.get(link.question_id) ?? []
      current.push(pack)
      packRowsByQuestionId.set(link.question_id, current)
    }
  }

  const items = questions
    .map((question) => {
      const packs = packRowsByQuestionId.get(question.id) ?? []
      const analysis = analyseQuestionMetadata(question, shows, packs)
      const audit = analyseQuestionAnswerAudit(question)

      return {
        question,
        packs,
        metadata: {
          saved: {
            mediaType: question.media_type ?? null,
            promptTarget: question.prompt_target ?? null,
            clueSource: question.clue_source ?? null,
            primaryShowKey: question.primary_show_key ?? null,
            metadataReviewState: question.metadata_review_state ?? "unreviewed",
            mediaDurationMs: question.media_duration_ms ?? null,
            audioClipType: question.audio_clip_type ?? null,
          },
          suggested: analysis.suggested,
          reasons: analysis.reasons,
          warnings: analysis.warnings,
        },
        audit,
      }
    })
    .filter((item) => warningMatchesFilter(warningState, item.metadata.warnings.length))
    .filter((item) => itemMatchesMetadataGap(item, metadataGap))
    .filter((item) => matchesAuditFilter(item.audit, item.question.answer_type, auditFilter))

  const filteredTotal = warningState || metadataGap || auditFilter ? items.length : countRes.count ?? items.length

  return NextResponse.json({
    ok: true,
    total: filteredTotal,
    limit,
    offset,
    items,
  })
}
