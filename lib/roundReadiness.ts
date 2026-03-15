import { AUDIO_CLIP_TYPE_VALUES, normaliseAudioClipType } from "@/lib/audioClipTypes"
import { deriveMediaType } from "@/lib/manualRoundPlanBuilder"
import {
  QUICKFIRE_AUDIO_MAX_DURATION_MS,
  getQuickfireIneligibilityReasons,
  normaliseMediaDurationMs,
} from "@/lib/quickfireEligibility"

export type ReadinessQuestionRow = {
  id: string
  round_type: string | null
  answer_type: string | null
  media_type: string | null
  audio_path: string | null
  image_path: string | null
  prompt_target: string | null
  clue_source: string | null
  primary_show_key: string | null
  metadata_review_state: string | null
  media_duration_ms: number | null
  audio_clip_type: string | null
}

export type ReadinessPackRow = {
  id: string
  display_name: string
}

export type ReadinessPackLinkRow = {
  question_id: string
  pack_id: string
}

export type ReadinessShowRow = {
  show_key: string
  display_name: string
}

export type ReadinessBreakdownRow = {
  key: string
  label: string
  totalQuestions: number
  standardMcqCount: number
  standardPictureCount: number
  quickfireSafeCount: number
  quickfireSafeTextOrImageCount: number
  quickfireSafeAudioCount: number
  audioQuestionCount: number
  audioWithDurationCount: number
  audioMissingDurationCount: number
  quickfireAudioTooLongCount: number
}

export type ReadinessReport = {
  summary: {
    totalQuestions: number
    standardMcqCount: number
    standardPictureCount: number
    quickfireSafeCount: number
    quickfireSafeTextOrImageCount: number
    quickfireSafeAudioCount: number
    audioQuestionCount: number
    audioWithDurationCount: number
    audioMissingDurationCount: number
    quickfireAudioTooLongCount: number
    confirmedMetadataCount: number
    missingCoreMetadataCount: number
  }
  audioClipTypeCounts: Array<{ code: string; label: string; count: number }>
  quickfireExclusionReasons: Array<{ code: string; label: string; count: number }>
  metadataGapCounts: Array<{ code: string; label: string; count: number }>
  byPack: ReadinessBreakdownRow[]
  byShow: ReadinessBreakdownRow[]
}

type NormalisedQuestion = {
  id: string
  answerType: "mcq" | "text"
  mediaType: "text" | "audio" | "image"
  mediaDurationMs: number | null
  primaryShowKey: string | null
  metadataReviewState: string | null
  audioClipType: string | null
  hasCoreMetadataGap: boolean
  isAudioQuestion: boolean
  quickfireReasons: string[]
}

const QUICKFIRE_REASON_LABELS: Record<string, string> = {
  not_mcq: "Not MCQ",
  audio_missing_duration: "Audio missing duration",
  audio_too_long: `Audio over ${QUICKFIRE_AUDIO_MAX_DURATION_MS / 1000}s`,
}

const METADATA_GAP_LABELS: Record<string, string> = {
  missing_media_type: "Missing media_type",
  missing_prompt_target: "Missing prompt_target",
  missing_clue_source: "Missing clue_source",
  missing_primary_show_key: "Missing primary_show_key",
  missing_audio_duration: "Missing media_duration_ms on audio",
  missing_audio_clip_type: "Missing audio_clip_type on audio",
  missing_any_core_metadata: "Missing any core metadata",
}

function normaliseQuestion(row: ReadinessQuestionRow): NormalisedQuestion {
  const mediaType = deriveMediaType({
    mediaType: row.media_type,
    legacyRoundType: row.round_type,
  })
  const answerType: "mcq" | "text" = String(row.answer_type ?? "").trim().toLowerCase() === "text" ? "text" : "mcq"
  const mediaDurationMs = normaliseMediaDurationMs(row.media_duration_ms)
  const primaryShowKey = String(row.primary_show_key ?? "").trim() || null
  const metadataReviewState = String(row.metadata_review_state ?? "").trim() || null
  const audioClipType = normaliseAudioClipType(row.audio_clip_type)
  const isAudioQuestion = mediaType === "audio"
  const missingMediaType = !String(row.media_type ?? "").trim()
  const missingPromptTarget = !String(row.prompt_target ?? "").trim()
  const missingClueSource = !String(row.clue_source ?? "").trim()
  const missingPrimaryShowKey = !primaryShowKey
  const missingAudioDuration = isAudioQuestion && mediaDurationMs === null

  return {
    id: row.id,
    answerType,
    mediaType,
    mediaDurationMs,
    primaryShowKey,
    metadataReviewState,
    audioClipType,
    hasCoreMetadataGap: missingMediaType || missingPromptTarget || missingClueSource || missingPrimaryShowKey,
    isAudioQuestion,
    quickfireReasons: getQuickfireIneligibilityReasons({
      answerType,
      mediaType,
      mediaDurationMs,
      audioClipType,
    }),
  }
}

function emptyBreakdownRow(key: string, label: string): ReadinessBreakdownRow {
  return {
    key,
    label,
    totalQuestions: 0,
    standardMcqCount: 0,
    standardPictureCount: 0,
    quickfireSafeCount: 0,
    quickfireSafeTextOrImageCount: 0,
    quickfireSafeAudioCount: 0,
    audioQuestionCount: 0,
    audioWithDurationCount: 0,
    audioMissingDurationCount: 0,
    quickfireAudioTooLongCount: 0,
  }
}

function addQuestionToBreakdown(row: ReadinessBreakdownRow, question: NormalisedQuestion) {
  row.totalQuestions += 1
  if (question.answerType === "mcq") row.standardMcqCount += 1
  if (question.mediaType === "image") row.standardPictureCount += 1
  if (question.isAudioQuestion) {
    row.audioQuestionCount += 1
    if (question.mediaDurationMs === null) {
      row.audioMissingDurationCount += 1
    } else {
      row.audioWithDurationCount += 1
    }
  }

  if (question.quickfireReasons.length === 0) {
    row.quickfireSafeCount += 1
    if (question.mediaType === "audio") {
      row.quickfireSafeAudioCount += 1
    } else {
      row.quickfireSafeTextOrImageCount += 1
    }
  }

  if (question.quickfireReasons.includes("audio_too_long")) {
    row.quickfireAudioTooLongCount += 1
  }
}

export function buildRoundReadinessReport(params: {
  questions: ReadinessQuestionRow[]
  packLinks: ReadinessPackLinkRow[]
  packs: ReadinessPackRow[]
  shows: ReadinessShowRow[]
}): ReadinessReport {
  const normalisedQuestions = params.questions.map(normaliseQuestion)
  const questionById = new Map(normalisedQuestions.map((question) => [question.id, question]))
  const packById = new Map(params.packs.map((pack) => [pack.id, pack]))
  const showByKey = new Map(params.shows.map((show) => [show.show_key, show]))

  const byPackMap = new Map<string, ReadinessBreakdownRow>()
  for (const link of params.packLinks) {
    const question = questionById.get(link.question_id)
    const pack = packById.get(link.pack_id)
    if (!question || !pack) continue
    const current = byPackMap.get(pack.id) ?? emptyBreakdownRow(pack.id, pack.display_name)
    addQuestionToBreakdown(current, question)
    byPackMap.set(pack.id, current)
  }

  const byShowMap = new Map<string, ReadinessBreakdownRow>()
  for (const question of normalisedQuestions) {
    const showKey = question.primaryShowKey ?? "(blank)"
    const showLabel = question.primaryShowKey ? showByKey.get(question.primaryShowKey)?.display_name ?? question.primaryShowKey : "No primary_show_key"
    const current = byShowMap.get(showKey) ?? emptyBreakdownRow(showKey, showLabel)
    addQuestionToBreakdown(current, question)
    byShowMap.set(showKey, current)
  }

  const quickfireReasonCounts = new Map<string, number>()
  const metadataGapCounts = new Map<string, number>()
  const audioClipTypeCounts = new Map<string, number>()
  let summary = emptyBreakdownRow("summary", "Summary")
  let confirmedMetadataCount = 0
  let missingCoreMetadataCount = 0

  for (const row of params.questions) {
    const question = questionById.get(row.id)
    if (!question) continue
    addQuestionToBreakdown(summary, question)
    if (question.metadataReviewState === "confirmed") confirmedMetadataCount += 1
    if (question.hasCoreMetadataGap) missingCoreMetadataCount += 1

    for (const reason of question.quickfireReasons) {
      quickfireReasonCounts.set(reason, (quickfireReasonCounts.get(reason) ?? 0) + 1)
    }

    if (!String(row.media_type ?? "").trim()) {
      metadataGapCounts.set("missing_media_type", (metadataGapCounts.get("missing_media_type") ?? 0) + 1)
    }
    if (!String(row.prompt_target ?? "").trim()) {
      metadataGapCounts.set("missing_prompt_target", (metadataGapCounts.get("missing_prompt_target") ?? 0) + 1)
    }
    if (!String(row.clue_source ?? "").trim()) {
      metadataGapCounts.set("missing_clue_source", (metadataGapCounts.get("missing_clue_source") ?? 0) + 1)
    }
    if (!String(row.primary_show_key ?? "").trim()) {
      metadataGapCounts.set("missing_primary_show_key", (metadataGapCounts.get("missing_primary_show_key") ?? 0) + 1)
    }
    if (question.isAudioQuestion && question.mediaDurationMs === null) {
      metadataGapCounts.set("missing_audio_duration", (metadataGapCounts.get("missing_audio_duration") ?? 0) + 1)
    }
    if (question.isAudioQuestion && question.audioClipType === null) {
      metadataGapCounts.set("missing_audio_clip_type", (metadataGapCounts.get("missing_audio_clip_type") ?? 0) + 1)
    }
    if (question.isAudioQuestion) {
      const code = question.audioClipType ?? "(blank)"
      audioClipTypeCounts.set(code, (audioClipTypeCounts.get(code) ?? 0) + 1)
    }
    if (question.hasCoreMetadataGap) {
      metadataGapCounts.set("missing_any_core_metadata", (metadataGapCounts.get("missing_any_core_metadata") ?? 0) + 1)
    }
  }

  return {
    summary: {
      totalQuestions: summary.totalQuestions,
      standardMcqCount: summary.standardMcqCount,
      standardPictureCount: summary.standardPictureCount,
      quickfireSafeCount: summary.quickfireSafeCount,
      quickfireSafeTextOrImageCount: summary.quickfireSafeTextOrImageCount,
      quickfireSafeAudioCount: summary.quickfireSafeAudioCount,
      audioQuestionCount: summary.audioQuestionCount,
      audioWithDurationCount: summary.audioWithDurationCount,
      audioMissingDurationCount: summary.audioMissingDurationCount,
      quickfireAudioTooLongCount: summary.quickfireAudioTooLongCount,
      confirmedMetadataCount,
      missingCoreMetadataCount,
    },
    audioClipTypeCounts: ["(blank)", ...AUDIO_CLIP_TYPE_VALUES]
      .map((code) => ({ code, label: code === "(blank)" ? "Blank" : code, count: audioClipTypeCounts.get(code) ?? 0 }))
      .filter((item) => item.count > 0),
    quickfireExclusionReasons: Object.entries(QUICKFIRE_REASON_LABELS)
      .map(([code, label]) => ({ code, label, count: quickfireReasonCounts.get(code) ?? 0 }))
      .filter((item) => item.count > 0),
    metadataGapCounts: Object.entries(METADATA_GAP_LABELS)
      .map(([code, label]) => ({ code, label, count: metadataGapCounts.get(code) ?? 0 }))
      .filter((item) => item.count > 0),
    byPack: [...byPackMap.values()].sort((a, b) => a.label.localeCompare(b.label)),
    byShow: [...byShowMap.values()].sort((a, b) => a.label.localeCompare(b.label)),
  }
}
