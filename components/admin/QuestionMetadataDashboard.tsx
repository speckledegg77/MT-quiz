"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

type PackOption = {
  id: string
  label: string
  questionCount: number
  audioCount: number
}

type ShowOption = {
  show_key: string
  display_name: string
}

type MetadataSaved = {
  mediaType: string | null
  promptTarget: string | null
  clueSource: string | null
  primaryShowKey: string | null
  metadataReviewState: string | null
  mediaDurationMs: number | null
  audioClipType: string | null
}

type MetadataSuggested = {
  mediaType: string | null
  promptTarget: string | null
  clueSource: string | null
  primaryShowKey: string | null
}

type MetadataReasons = {
  mediaType: string | null
  promptTarget: string | null
  clueSource: string | null
  primaryShowKey: string | null
}

type MetadataWarning = {
  code: string
  message: string
}

type QuestionSummaryItem = {
  question: {
    id: string
    text: string
    round_type: string
    answer_type: string
    answer_text: string | null
    explanation: string | null
    audio_path: string | null
    image_path: string | null
    accepted_answers: unknown
    media_type: string | null
    prompt_target: string | null
    clue_source: string | null
    primary_show_key: string | null
    metadata_review_state: string | null
    media_duration_ms: number | null
    audio_clip_type: string | null
    created_at: string
    updated_at: string
  }
  packs: Array<{
    id: string
    display_name: string
    round_type: string
  }>
  metadata: {
    saved: MetadataSaved
    suggested: MetadataSuggested
    reasons: MetadataReasons
    warnings: MetadataWarning[]
  }
}

type QuestionDetailResponse = {
  ok: true
  item: QuestionSummaryItem
}

type QuestionListResponse = {
  ok: true
  total: number
  limit: number
  offset: number
  items: QuestionSummaryItem[]
}

type ShowsResponse = {
  ok: true
  shows: Array<{
    show_key: string
    display_name: string
  }>
}

type PacksResponse = {
  packs: PackOption[]
}

type EditorState = {
  mediaType: string
  promptTarget: string
  clueSource: string
  primaryShowKey: string
  audioClipType: string
  metadataReviewState: string
  mediaDurationMs: string
}

type AnswerEditorState = {
  answerText: string
  acceptedAnswers: string
}

type BulkEditorState = {
  mediaType: string
  promptTarget: string
  clueSource: string
  primaryShowKey: string
  audioClipType: string
  metadataReviewState: string
}

const UNCHANGED_VALUE = "__UNCHANGED__"

const MEDIA_TYPE_OPTIONS = [
  { value: "", label: "Blank" },
  { value: "text", label: "text" },
  { value: "audio", label: "audio" },
  { value: "image", label: "image" },
]

const PROMPT_TARGET_OPTIONS = [
  { value: "", label: "Blank" },
  { value: "show_title", label: "show_title" },
  { value: "song_title", label: "song_title" },
  { value: "performer_name", label: "performer_name" },
  { value: "character_name", label: "character_name" },
  { value: "creative_name", label: "creative_name" },
  { value: "fact_value", label: "fact_value" },
]

const AUDIO_CLIP_TYPE_OPTIONS = [
  { value: "", label: "Blank" },
  { value: "song_intro", label: "song_intro" },
  { value: "song_clip", label: "song_clip" },
  { value: "instrumental_section", label: "instrumental_section" },
  { value: "vocal_section", label: "vocal_section" },
  { value: "dialogue_quote", label: "dialogue_quote" },
  { value: "character_voice", label: "character_voice" },
  { value: "sound_effect", label: "sound_effect" },
  { value: "other", label: "other" },
]

const CLUE_SOURCE_OPTIONS = [
  { value: "", label: "Blank" },
  { value: "direct_fact", label: "direct_fact" },
  { value: "song_title", label: "song_title" },
  { value: "song_clip", label: "song_clip" },
  { value: "overture_clip", label: "overture_clip" },
  { value: "entracte_clip", label: "entracte_clip" },
  { value: "lyric_excerpt", label: "lyric_excerpt" },
  { value: "poster_art", label: "poster_art" },
  { value: "production_photo", label: "production_photo" },
  { value: "cast_headshot", label: "cast_headshot" },
  { value: "prop_image", label: "prop_image" },
]

const REVIEW_STATE_OPTIONS = [
  { value: "", label: "Any" },
  { value: "unreviewed", label: "unreviewed" },
  { value: "suggested", label: "suggested" },
  { value: "confirmed", label: "confirmed" },
  { value: "needs_attention", label: "needs_attention" },
]

const REVIEW_STATE_SAVE_OPTIONS = [
  { value: "unreviewed", label: "unreviewed" },
  { value: "suggested", label: "suggested" },
  { value: "confirmed", label: "confirmed" },
  { value: "needs_attention", label: "needs_attention" },
]

const WARNING_FILTER_OPTIONS = [
  { value: "", label: "Any warning state" },
  { value: "has_warnings", label: "Has warnings" },
  { value: "no_warnings", label: "No warnings" },
]

const METADATA_GAP_OPTIONS = [
  { value: "", label: "Any metadata state" },
  { value: "missing_primary_show_key", label: "Missing primary_show_key" },
  { value: "missing_media_type", label: "Missing media_type" },
  { value: "missing_prompt_target", label: "Missing prompt_target" },
  { value: "missing_clue_source", label: "Missing clue_source" },
  { value: "missing_audio_duration", label: "Missing media_duration_ms on audio" },
  { value: "missing_audio_clip_type", label: "Missing audio_clip_type on audio" },
  { value: "missing_any_core_metadata", label: "Missing any core metadata" },
]

const LEGACY_ROUND_TYPE_OPTIONS = [
  { value: "", label: "Any legacy round type" },
  { value: "general", label: "general" },
  { value: "audio", label: "audio" },
  { value: "picture", label: "picture" },
]

const ANSWER_TYPE_OPTIONS = [
  { value: "", label: "Any answer type" },
  { value: "mcq", label: "mcq" },
  { value: "text", label: "text" },
]

const BULK_MEDIA_TYPE_OPTIONS = [
  { value: UNCHANGED_VALUE, label: "Leave unchanged" },
  { value: "", label: "Set blank" },
  { value: "text", label: "text" },
  { value: "audio", label: "audio" },
  { value: "image", label: "image" },
]

const BULK_PROMPT_TARGET_OPTIONS = [
  { value: UNCHANGED_VALUE, label: "Leave unchanged" },
  { value: "", label: "Set blank" },
  { value: "show_title", label: "show_title" },
  { value: "song_title", label: "song_title" },
  { value: "performer_name", label: "performer_name" },
  { value: "character_name", label: "character_name" },
  { value: "creative_name", label: "creative_name" },
  { value: "fact_value", label: "fact_value" },
]

const BULK_CLUE_SOURCE_OPTIONS = [
  { value: UNCHANGED_VALUE, label: "Leave unchanged" },
  { value: "", label: "Set blank" },
  { value: "direct_fact", label: "direct_fact" },
  { value: "song_title", label: "song_title" },
  { value: "song_clip", label: "song_clip" },
  { value: "overture_clip", label: "overture_clip" },
  { value: "entracte_clip", label: "entracte_clip" },
  { value: "lyric_excerpt", label: "lyric_excerpt" },
  { value: "poster_art", label: "poster_art" },
  { value: "production_photo", label: "production_photo" },
  { value: "cast_headshot", label: "cast_headshot" },
  { value: "prop_image", label: "prop_image" },
]

const BULK_AUDIO_CLIP_TYPE_OPTIONS = [
  { value: UNCHANGED_VALUE, label: "Leave unchanged" },
  { value: "", label: "Set blank" },
  { value: "song_intro", label: "song_intro" },
  { value: "song_clip", label: "song_clip" },
  { value: "instrumental_section", label: "instrumental_section" },
  { value: "vocal_section", label: "vocal_section" },
  { value: "dialogue_quote", label: "dialogue_quote" },
  { value: "character_voice", label: "character_voice" },
  { value: "sound_effect", label: "sound_effect" },
  { value: "other", label: "other" },
]

const BULK_REVIEW_STATE_OPTIONS = [
  { value: UNCHANGED_VALUE, label: "Leave unchanged" },
  { value: "unreviewed", label: "unreviewed" },
  { value: "suggested", label: "suggested" },
  { value: "confirmed", label: "confirmed" },
  { value: "needs_attention", label: "needs_attention" },
]

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

function fieldCardClass() {
  return "rounded-lg border border-border bg-muted/30 p-3"
}

function compactInputClass() {
  return "h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-border"
}

function compactSelectClass() {
  return compactInputClass()
}

function compactCardContentClass() {
  return "space-y-3"
}

function metadataFieldLabelClass() {
  return "grid gap-1"
}

function metadataFieldHeaderClass() {
  return "flex items-center gap-1.5"
}

function metadataFieldNameClass() {
  return "text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground"
}

function metadataSelectClass() {
  return "h-7 rounded-md border border-border bg-background px-2 pr-7 text-[11px] text-foreground outline-none transition-colors focus:ring-2 focus:ring-border"
}

function metadataInputClass() {
  return "h-7 rounded-md border border-border bg-background px-2 text-[11px] text-foreground outline-none transition-colors focus:ring-2 focus:ring-border"
}

function metadataTooltipButtonClass() {
  return "inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-border"
}

function metadataWorkspaceButtonSize() {
  return "sm" as const
}

type MetadataHintProps = {
  label: string
  hint: string
}

function MetadataHint({ label, hint }: MetadataHintProps) {
  return (
    <button
      type="button"
      className={metadataTooltipButtonClass()}
      title={hint}
      aria-label={`${label}: ${hint}`}
    >
      ?
    </button>
  )
}

function pillClass(tone: "default" | "success" | "warning" | "accent" = "default") {
  if (tone === "success") {
    return "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
  }

  if (tone === "warning") {
    return "inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
  }

  if (tone === "accent") {
    return "inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700"
  }

  return "inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
}

function reviewStateTone(value: string | null | undefined): "default" | "success" | "warning" | "accent" {
  if (value === "confirmed") return "success"
  if (value === "needs_attention") return "warning"
  if (value === "suggested") return "accent"
  return "default"
}

function normaliseEditorValue(value: string | null | undefined) {
  return String(value ?? "")
}

function trimToNull(value: string) {
  const cleaned = value.trim()
  return cleaned.length ? cleaned : null
}

function normaliseDurationEditorValue(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? "" : String(Math.floor(Number(value)))
}

function parseAcceptedAnswersValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean)
  }

  const raw = String(value ?? "").trim()
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      if (parsed.length === 1 && typeof parsed[0] === "string") {
        try {
          const nested = JSON.parse(parsed[0])
          if (Array.isArray(nested)) {
            return nested.map((item) => String(item ?? "").trim()).filter(Boolean)
          }
        } catch {
          // ignore nested parse failure
        }
      }

      return parsed.map((item) => String(item ?? "").trim()).filter(Boolean)
    }
  } catch {
    // fall back to text parsing
  }

  return raw
    .split(/\||\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normaliseAcceptedAnswersEditorValue(value: unknown) {
  return parseAcceptedAnswersValue(value).join(" | ")
}

function parseAcceptedAnswersInput(value: string) {
  const seen = new Set<string>()
  const out: string[] = []

  for (const part of value.split(/\||\r?\n/)) {
    const cleaned = part.trim()
    if (!cleaned) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
  }

  return out
}

function parseDurationMs(value: string) {
  const cleaned = value.trim()
  if (!cleaned) return null
  const parsed = Math.floor(Number(cleaned))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function formatDurationMs(value: number | null | undefined) {
  const parsed = value === null || value === undefined ? null : Math.floor(Number(value))
  if (!Number.isFinite(parsed) || parsed === null || parsed < 0) return "Blank"
  const seconds = parsed / 1000
  return `${parsed} ms (${seconds.toFixed(seconds % 1 === 0 ? 0 : 2)}s)`
}

function buildSummaryText(item: QuestionSummaryItem) {
  const parts = [
    item.metadata.saved.mediaType || item.metadata.suggested.mediaType || "media ?",
    item.metadata.saved.promptTarget || item.metadata.suggested.promptTarget || "target ?",
    item.metadata.saved.clueSource || item.metadata.suggested.clueSource || "clue ?",
  ]
  if (item.metadata.saved.audioClipType) parts.push(item.metadata.saved.audioClipType)
  return parts.join(" · ")
}

function buildAdminHeaders(token: string) {
  return {
    "x-admin-token": token.trim(),
  }
}

export function QuestionMetadataDashboard() {
  const [token, setToken] = useState("")
  const cleanToken = token.trim()

  const [packs, setPacks] = useState<PackOption[]>([])
  const [shows, setShows] = useState<ShowOption[]>([])

  const [packId, setPackId] = useState("")
  const [legacyRoundType, setLegacyRoundType] = useState("")
  const [answerType, setAnswerType] = useState("")
  const [reviewState, setReviewState] = useState("")
  const [warningState, setWarningState] = useState("")
  const [metadataGap, setMetadataGap] = useState("")
  const [search, setSearch] = useState("")

  const [items, setItems] = useState<QuestionSummaryItem[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [listError, setListError] = useState("")
  const [selectedQuestionId, setSelectedQuestionId] = useState("")
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([])
  const [detailBusy, setDetailBusy] = useState(false)
  const [detailError, setDetailError] = useState("")
  const [detailItem, setDetailItem] = useState<QuestionSummaryItem | null>(null)

  const [saveBusy, setSaveBusy] = useState(false)
  const [saveResult, setSaveResult] = useState("")
  const [answerSaveBusy, setAnswerSaveBusy] = useState(false)
  const [answerSaveResult, setAnswerSaveResult] = useState("")

  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState("")

  const [applySuggestedBusy, setApplySuggestedBusy] = useState(false)
  const [applySuggestedResult, setApplySuggestedResult] = useState("")
  const [bulkExpanded, setBulkExpanded] = useState(false)
  const [guideExpanded, setGuideExpanded] = useState(false)

  const [editor, setEditor] = useState<EditorState>({
    mediaType: "",
    promptTarget: "",
    clueSource: "",
    primaryShowKey: "",
    audioClipType: "",
    metadataReviewState: "unreviewed",
    mediaDurationMs: "",
  })
  const [answerEditor, setAnswerEditor] = useState<AnswerEditorState>({
    answerText: "",
    acceptedAnswers: "",
  })

  const [bulkEditor, setBulkEditor] = useState<BulkEditorState>({
    mediaType: UNCHANGED_VALUE,
    promptTarget: UNCHANGED_VALUE,
    clueSource: UNCHANGED_VALUE,
    primaryShowKey: UNCHANGED_VALUE,
    audioClipType: UNCHANGED_VALUE,
    metadataReviewState: UNCHANGED_VALUE,
  })

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("mtq_admin_token") ?? ""
      if (saved) setToken(saved)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadPacks() {
      try {
        const res = await fetch("/api/packs", { cache: "no-store" })
        const json = (await res.json()) as PacksResponse
        if (!cancelled) setPacks(Array.isArray(json.packs) ? json.packs : [])
      } catch {
        if (!cancelled) setPacks([])
      }
    }

    loadPacks()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!cleanToken) {
      setShows([])
      return
    }

    let cancelled = false

    async function loadShows() {
      try {
        const res = await fetch("/api/admin/shows", {
          headers: buildAdminHeaders(cleanToken),
          cache: "no-store",
        })

        const json = (await res.json()) as ShowsResponse | { error?: string }

        if (!res.ok) {
          if (!cancelled) setShows([])
          return
        }

        if (!cancelled) {
          setShows(
            Array.isArray((json as ShowsResponse).shows)
              ? (json as ShowsResponse).shows.map((show) => ({
                  show_key: show.show_key,
                  display_name: show.display_name,
                }))
              : []
          )
        }
      } catch {
        if (!cancelled) setShows([])
      }
    }

    loadShows()

    return () => {
      cancelled = true
    }
  }, [cleanToken])

  async function loadQuestions(nextSelectedQuestionId?: string) {
    if (!cleanToken) {
      setListError("Enter your admin token first.")
      setItems([])
      return
    }

    setListBusy(true)
    setListError("")
    setSaveResult("")
    setAnswerSaveResult("")
    setBulkResult("")
    setApplySuggestedResult("")

    try {
      try {
        sessionStorage.setItem("mtq_admin_token", cleanToken)
      } catch {
        // ignore
      }

      const params = new URLSearchParams()
      params.set("limit", "100")

      if (packId) params.set("packId", packId)
      if (legacyRoundType) params.set("legacyRoundType", legacyRoundType)
      if (answerType) params.set("answerType", answerType)
      if (reviewState) params.set("reviewState", reviewState)
      if (warningState) params.set("warningState", warningState)
      if (metadataGap) params.set("metadataGap", metadataGap)
      if (search.trim()) params.set("search", search.trim())

      const res = await fetch(`/api/admin/questions?${params.toString()}`, {
        headers: buildAdminHeaders(cleanToken),
        cache: "no-store",
      })

      const json = (await res.json()) as QuestionListResponse | { error?: string }

      if (!res.ok) {
        setItems([])
        setListError((json as { error?: string }).error || "Could not load questions.")
        return
      }

      const nextItems = (json as QuestionListResponse).items || []
      const visibleIds = new Set(nextItems.map((item) => item.question.id))

      setItems(nextItems)
      setSelectedQuestionIds((current) => current.filter((id) => visibleIds.has(id)))

      const targetId =
        nextSelectedQuestionId ||
        selectedQuestionId ||
        (nextItems.length ? nextItems[0]?.question.id : "")

      if (targetId && nextItems.some((item) => item.question.id === targetId)) {
        setSelectedQuestionId(targetId)
        await loadQuestionDetail(targetId)
      } else {
        setSelectedQuestionId("")
        setDetailItem(null)
      }
    } catch (error: any) {
      setItems([])
      setListError(error?.message || "Could not load questions.")
    } finally {
      setListBusy(false)
    }
  }

  async function loadQuestionDetail(questionId: string) {
    if (!cleanToken || !questionId) return

    setDetailBusy(true)
    setDetailError("")
    setSaveResult("")
    setAnswerSaveResult("")

    try {
      const res = await fetch(`/api/admin/questions/${questionId}`, {
        headers: buildAdminHeaders(cleanToken),
        cache: "no-store",
      })

      const json = (await res.json()) as QuestionDetailResponse | { error?: string }

      if (!res.ok) {
        setDetailItem(null)
        setDetailError((json as { error?: string }).error || "Could not load question detail.")
        return
      }

      const nextItem = (json as QuestionDetailResponse).item
      setDetailItem(nextItem)
      setEditor({
        mediaType: normaliseEditorValue(nextItem.metadata.saved.mediaType),
        promptTarget: normaliseEditorValue(nextItem.metadata.saved.promptTarget),
        clueSource: normaliseEditorValue(nextItem.metadata.saved.clueSource),
        primaryShowKey: normaliseEditorValue(nextItem.metadata.saved.primaryShowKey),
        audioClipType: normaliseEditorValue(nextItem.metadata.saved.audioClipType),
        metadataReviewState: normaliseEditorValue(nextItem.metadata.saved.metadataReviewState || "unreviewed"),
        mediaDurationMs: normaliseDurationEditorValue(nextItem.metadata.saved.mediaDurationMs),
      })
      setAnswerEditor({
        answerText: normaliseEditorValue(nextItem.question.answer_text),
        acceptedAnswers: normaliseAcceptedAnswersEditorValue(nextItem.question.accepted_answers),
      })
    } catch (error: any) {
      setDetailItem(null)
      setDetailError(error?.message || "Could not load question detail.")
    } finally {
      setDetailBusy(false)
    }
  }

  function applySuggestedValues() {
    if (!detailItem) return

    setEditor((current) => ({
      ...current,
      mediaType: detailItem.metadata.suggested.mediaType || current.mediaType,
      promptTarget: detailItem.metadata.suggested.promptTarget || current.promptTarget,
      clueSource: detailItem.metadata.suggested.clueSource || current.clueSource,
      primaryShowKey: detailItem.metadata.suggested.primaryShowKey || current.primaryShowKey,
      audioClipType: current.audioClipType,
      metadataReviewState:
        current.metadataReviewState === "unreviewed" ? "suggested" : current.metadataReviewState,
    }))
  }

  async function saveMetadata() {
    if (!cleanToken || !detailItem) return

    setSaveBusy(true)
    setSaveResult("")

    try {
      const res = await fetch(`/api/admin/questions/${detailItem.question.id}/metadata`, {
        method: "PATCH",
        headers: {
          ...buildAdminHeaders(cleanToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mediaType: trimToNull(editor.mediaType),
          promptTarget: trimToNull(editor.promptTarget),
          clueSource: trimToNull(editor.clueSource),
          primaryShowKey: trimToNull(editor.primaryShowKey),
          audioClipType: trimToNull(editor.audioClipType),
          metadataReviewState: editor.metadataReviewState || "unreviewed",
          mediaDurationMs: parseDurationMs(editor.mediaDurationMs),
        }),
      })

      const json = (await res.json()) as { error?: string }

      if (!res.ok) {
        setSaveResult(json.error || "Save failed.")
        return
      }

      setSaveResult("Saved.")
      await loadQuestions(detailItem.question.id)
    } catch (error: any) {
      setSaveResult(error?.message || "Save failed.")
    } finally {
      setSaveBusy(false)
    }
  }

  async function saveAnswerFields() {
    if (!cleanToken || !detailItem || detailItem.question.answer_type !== "text") return

    setAnswerSaveBusy(true)
    setAnswerSaveResult("")

    try {
      const res = await fetch(`/api/admin/questions/${detailItem.question.id}/answer`, {
        method: "PATCH",
        headers: {
          ...buildAdminHeaders(cleanToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          answerText: answerEditor.answerText.trim(),
          acceptedAnswers: parseAcceptedAnswersInput(answerEditor.acceptedAnswers),
        }),
      })

      const json = (await res.json()) as { error?: string }

      if (!res.ok) {
        setAnswerSaveResult(json.error || "Answer save failed.")
        return
      }

      setAnswerSaveResult("Answers saved.")
      await loadQuestions(detailItem.question.id)
    } catch (error: any) {
      setAnswerSaveResult(error?.message || "Answer save failed.")
    } finally {
      setAnswerSaveBusy(false)
    }
  }

  async function applyBulkMetadata() {
    if (!cleanToken) {
      setBulkResult("Enter your admin token first.")
      return
    }

    if (!selectedQuestionIds.length) {
      setBulkResult("Select at least one question first.")
      return
    }

    const changes: Record<string, string | null> = {}

    if (bulkEditor.mediaType !== UNCHANGED_VALUE) {
      changes.mediaType = trimToNull(bulkEditor.mediaType)
    }

    if (bulkEditor.promptTarget !== UNCHANGED_VALUE) {
      changes.promptTarget = trimToNull(bulkEditor.promptTarget)
    }

    if (bulkEditor.clueSource !== UNCHANGED_VALUE) {
      changes.clueSource = trimToNull(bulkEditor.clueSource)
    }

    if (bulkEditor.primaryShowKey !== UNCHANGED_VALUE) {
      changes.primaryShowKey = trimToNull(bulkEditor.primaryShowKey)
    }

    if (bulkEditor.audioClipType !== UNCHANGED_VALUE) {
      changes.audioClipType = trimToNull(bulkEditor.audioClipType)
    }

    if (bulkEditor.metadataReviewState !== UNCHANGED_VALUE) {
      changes.metadataReviewState = bulkEditor.metadataReviewState
    }

    if (Object.keys(changes).length === 0) {
      setBulkResult("Choose at least one bulk change first.")
      return
    }

    setBulkBusy(true)
    setBulkResult("")
    setSaveResult("")
    setApplySuggestedResult("")

    try {
      const res = await fetch("/api/admin/questions/bulk-metadata", {
        method: "POST",
        headers: {
          ...buildAdminHeaders(cleanToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questionIds: selectedQuestionIds,
          changes,
        }),
      })

      const json = (await res.json()) as { error?: string; updatedCount?: number }

      if (!res.ok) {
        setBulkResult(json.error || "Bulk apply failed.")
        return
      }

      const updatedCount = json.updatedCount ?? selectedQuestionIds.length
      setBulkResult(`Updated ${updatedCount} question${updatedCount === 1 ? "" : "s"}.`)
      setSelectedQuestionIds([])
      await loadQuestions(selectedQuestionId || undefined)
    } catch (error: any) {
      setBulkResult(error?.message || "Bulk apply failed.")
    } finally {
      setBulkBusy(false)
    }
  }

  async function applySuggestedMetadataToSelected() {
    if (!cleanToken) {
      setApplySuggestedResult("Enter your admin token first.")
      return
    }

    if (!selectedQuestionIds.length) {
      setApplySuggestedResult("Select at least one question first.")
      return
    }

    setApplySuggestedBusy(true)
    setApplySuggestedResult("")
    setBulkResult("")
    setSaveResult("")

    try {
      const res = await fetch("/api/admin/questions/apply-suggestions", {
        method: "POST",
        headers: {
          ...buildAdminHeaders(cleanToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questionIds: selectedQuestionIds,
        }),
      })

      const json = (await res.json()) as {
        error?: string
        updatedCount?: number
        skippedCount?: number
      }

      if (!res.ok) {
        setApplySuggestedResult(json.error || "Could not apply suggested values.")
        return
      }

      const updatedCount = json.updatedCount ?? 0
      const skippedCount = json.skippedCount ?? 0
      setApplySuggestedResult(
        `Applied suggestions to ${updatedCount} question${updatedCount === 1 ? "" : "s"}${
          skippedCount ? ` and skipped ${skippedCount}` : ""
        }.`
      )
      setSelectedQuestionIds([])
      await loadQuestions(selectedQuestionId || undefined)
    } catch (error: any) {
      setApplySuggestedResult(error?.message || "Could not apply suggested values.")
    } finally {
      setApplySuggestedBusy(false)
    }
  }

  function clearToken() {
    setToken("")
    setItems([])
    setShows([])
    setSelectedQuestionId("")
    setSelectedQuestionIds([])
    setDetailItem(null)
    setListError("")
    setDetailError("")
    setSaveResult("")
    setAnswerSaveResult("")
    setAnswerSaveResult("")
    setBulkResult("")
    setApplySuggestedResult("")
    try {
      sessionStorage.removeItem("mtq_admin_token")
    } catch {
      // ignore
    }
  }

  function toggleSelectedQuestion(questionId: string) {
    setSelectedQuestionIds((current) =>
      current.includes(questionId) ? current.filter((id) => id !== questionId) : [...current, questionId]
    )
  }

  function selectAllVisible() {
    setSelectedQuestionIds(items.map((item) => item.question.id))
  }

  function clearSelection() {
    setSelectedQuestionIds([])
  }

  const selectedSummary = useMemo(() => {
    if (!detailItem) return null
    return {
      saved: detailItem.metadata.saved,
      suggested: detailItem.metadata.suggested,
      reasons: detailItem.metadata.reasons,
      warnings: detailItem.metadata.warnings,
    }
  }, [detailItem])

  const selectedCount = selectedQuestionIds.length

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.95fr)] xl:items-start">
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/70 px-5 pb-3 pt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-xl">Question workspace</CardTitle>
                <div className="mt-1 text-xs text-muted-foreground">
                  Filter the bank, preview audio, and edit metadata without leaving the page.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={pillClass()}>{items.length} visible</span>
                <span className={pillClass(selectedCount ? "accent" : "default")}>{selectedCount} selected</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pt-3 pb-4">
            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste ADMIN_TOKEN here"
                autoComplete="off"
                spellCheck={false}
                className={metadataInputClass()}
              />
              <div className="flex flex-wrap gap-2">
                <Button size={metadataWorkspaceButtonSize()} onClick={() => loadQuestions()}>Load questions</Button>
                <Button size={metadataWorkspaceButtonSize()} variant="secondary" onClick={clearToken}>
                  Clear token
                </Button>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <select
                value={packId}
                onChange={(event) => setPackId(event.target.value)}
                className={metadataSelectClass()}
              >
                <option value="">Any pack</option>
                {packs.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.label}
                  </option>
                ))}
              </select>

              <select
                value={legacyRoundType}
                onChange={(event) => setLegacyRoundType(event.target.value)}
                className={metadataSelectClass()}
              >
                {LEGACY_ROUND_TYPE_OPTIONS.map((option) => (
                  <option key={option.value || "blank"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                value={answerType}
                onChange={(event) => setAnswerType(event.target.value)}
                className={metadataSelectClass()}
              >
                {ANSWER_TYPE_OPTIONS.map((option) => (
                  <option key={option.value || "blank"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                value={reviewState}
                onChange={(event) => setReviewState(event.target.value)}
                className={metadataSelectClass()}
              >
                {REVIEW_STATE_OPTIONS.map((option) => (
                  <option key={option.value || "blank"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                value={warningState}
                onChange={(event) => setWarningState(event.target.value)}
                className={metadataSelectClass()}
              >
                {WARNING_FILTER_OPTIONS.map((option) => (
                  <option key={option.value || "blank"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                value={metadataGap}
                onChange={(event) => setMetadataGap(event.target.value)}
                className={metadataSelectClass()}
              >
                {METADATA_GAP_OPTIONS.map((option) => (
                  <option key={option.value || "blank"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search question text"
                className={metadataInputClass()}
              />

              <Button
                size={metadataWorkspaceButtonSize()}
                variant="secondary"
                onClick={() => {
                  setPackId("")
                  setLegacyRoundType("")
                  setAnswerType("")
                  setReviewState("")
                  setWarningState("")
                  setMetadataGap("")
                  setSearch("")
                }}
              >
                Reset filters
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
              Nothing writes to Supabase until you click Save, Bulk Apply, or Apply Suggested Values.
            </div>

            {listError ? (
              <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {listError}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={() => setBulkExpanded((current) => !current)}
            className="flex w-full items-center justify-between gap-3 border-b border-border/70 px-5 py-3 text-left"
          >
            <div>
              <div className="text-base font-semibold text-foreground">Bulk actions</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Apply the same metadata to selected questions, or apply each question’s suggested values in one pass.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={pillClass(selectedCount ? "accent" : "default")}>
                {selectedCount} selected
              </span>
              <span className={pillClass()}>{bulkExpanded ? "Hide" : "Show"}</span>
            </div>
          </button>

          {bulkExpanded ? (
            <CardContent className="space-y-3 pt-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={selectAllVisible} disabled={!items.length}>
                  Select all visible
                </Button>
                <Button variant="secondary" onClick={clearSelection} disabled={!selectedCount}>
                  Clear selection
                </Button>
                <Button
                  variant="secondary"
                  onClick={applySuggestedMetadataToSelected}
                  disabled={applySuggestedBusy || !selectedCount}
                >
                  {applySuggestedBusy ? "Applying suggested values…" : "Apply suggested values"}
                </Button>
              </div>

              {applySuggestedResult ? (
                <div
                  className={cx(
                    "rounded-lg px-3 py-2 text-sm",
                    applySuggestedResult.startsWith("Applied")
                      ? "border border-green-300 bg-green-50 text-green-700"
                      : "border border-red-300 bg-red-50 text-red-700"
                  )}
                >
                  {applySuggestedResult}
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <label className="grid gap-1">
                  <span className="text-sm font-medium">media_type</span>
                  <select
                    value={bulkEditor.mediaType}
                    onChange={(event) => setBulkEditor((current) => ({ ...current, mediaType: event.target.value }))}
                    className={metadataSelectClass()}
                  >
                    {BULK_MEDIA_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-medium">prompt_target</span>
                  <select
                    value={bulkEditor.promptTarget}
                    onChange={(event) => setBulkEditor((current) => ({ ...current, promptTarget: event.target.value }))}
                    className={metadataSelectClass()}
                  >
                    {BULK_PROMPT_TARGET_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-medium">clue_source</span>
                  <select
                    value={bulkEditor.clueSource}
                    onChange={(event) => setBulkEditor((current) => ({ ...current, clueSource: event.target.value }))}
                    className={metadataSelectClass()}
                  >
                    {BULK_CLUE_SOURCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-medium">primary_show_key</span>
                  <select
                    value={bulkEditor.primaryShowKey}
                    onChange={(event) => setBulkEditor((current) => ({ ...current, primaryShowKey: event.target.value }))}
                    className={metadataSelectClass()}
                  >
                    <option value={UNCHANGED_VALUE}>Leave unchanged</option>
                    <option value="">Set blank</option>
                    {shows.map((show) => (
                      <option key={show.show_key} value={show.show_key}>
                        {show.display_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-medium">audio_clip_type</span>
                  <select
                    value={bulkEditor.audioClipType}
                    onChange={(event) => setBulkEditor((current) => ({ ...current, audioClipType: event.target.value }))}
                    className={metadataSelectClass()}
                  >
                    {BULK_AUDIO_CLIP_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-medium">metadata_review_state</span>
                  <select
                    value={bulkEditor.metadataReviewState}
                    onChange={(event) =>
                      setBulkEditor((current) => ({
                        ...current,
                        metadataReviewState: event.target.value,
                      }))
                    }
                    className={metadataSelectClass()}
                  >
                    {BULK_REVIEW_STATE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={applyBulkMetadata} disabled={bulkBusy || !selectedCount}>
                  {bulkBusy ? "Applying…" : "Bulk Apply"}
                </Button>
              </div>

              {bulkResult ? (
                <div
                  className={cx(
                    "rounded-lg px-3 py-2 text-sm",
                    bulkResult.startsWith("Updated")
                      ? "border border-green-300 bg-green-50 text-green-700"
                      : "border border-red-300 bg-red-50 text-red-700"
                  )}
                >
                  {bulkResult}
                </div>
              ) : null}
            </CardContent>
          ) : null}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/70 pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Questions</CardTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={pillClass()}>{items.length} visible</span>
                <span className={pillClass(selectedCount ? "accent" : "default")}>{selectedCount} selected</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {listBusy ? (
              <div className="text-sm text-muted-foreground">Loading questions…</div>
            ) : items.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No questions loaded yet. Enter your token, then click Load questions.
              </div>
            ) : (
              <div className="space-y-2 xl:max-h-[calc(100vh-22rem)] xl:overflow-y-auto xl:pr-1">
                {items.map((item) => {
                  const isSelected = item.question.id === selectedQuestionId
                  const isTicked = selectedQuestionIds.includes(item.question.id)
                  const reviewValue = item.metadata.saved.metadataReviewState || item.question.metadata_review_state || "unreviewed"
                  const warningCount = item.metadata.warnings.length
                  const hasAudio = Boolean(item.question.audio_path)
                  const audioChipType = item.metadata.saved.audioClipType || item.question.audio_clip_type
                  const packNames = item.packs.map((pack) => pack.display_name).join(", ") || "None"
                  const summaryText = buildSummaryText(item)

                  return (
                    <div
                      key={item.question.id}
                      className={cx(
                        "rounded-lg border px-2.5 py-2 transition-colors",
                        isSelected
                          ? "border-foreground/60 bg-muted shadow-sm"
                          : "border-border bg-card hover:border-foreground/20 hover:bg-muted/30"
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={isTicked}
                          onChange={() => toggleSelectedQuestion(item.question.id)}
                          className="mt-0.5 h-3.5 w-3.5 rounded border-border"
                        />

                        <button
                          type="button"
                          onClick={async () => {
                            setSelectedQuestionId(item.question.id)
                            await loadQuestionDetail(item.question.id)
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                                {item.question.id}
                              </div>
                              <div className="mt-0.5 whitespace-pre-line text-[13px] leading-5 text-foreground">
                                {item.question.text}
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-wrap justify-end gap-1">
                              <span className={pillClass()}>{item.question.round_type}</span>
                              <span className={pillClass()}>{item.question.answer_type}</span>
                              <span className={pillClass(reviewStateTone(reviewValue))}>{reviewValue}</span>
                              {hasAudio ? <span className={pillClass("accent")}>audio</span> : null}
                              {audioChipType ? <span className={pillClass("accent")}>{audioChipType}</span> : null}
                              {warningCount ? (
                                <span className={pillClass("warning")}>
                                  {warningCount} warning{warningCount === 1 ? "" : "s"}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="truncate">Packs: {packNames}</span>
                            <span className="truncate">{summaryText}</span>
                          </div>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/70 pb-3">
            <CardTitle>Question detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {detailBusy ? (
              <div className="text-sm text-muted-foreground">Loading question detail…</div>
            ) : detailError ? (
              <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {detailError}
              </div>
            ) : !detailItem ? (
              <div className="text-sm text-muted-foreground">
                Select a question to review its metadata.
              </div>
            ) : (
              <>
                <div className={fieldCardClass()}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Question
                      </div>
                      <div className="mt-2 text-sm font-semibold text-foreground">{detailItem.question.id}</div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className={pillClass()}>{detailItem.question.round_type}</span>
                      <span className={pillClass()}>{detailItem.question.answer_type}</span>
                      <span className={pillClass(reviewStateTone(detailItem.metadata.saved.metadataReviewState || detailItem.question.metadata_review_state))}>
                        {detailItem.metadata.saved.metadataReviewState || detailItem.question.metadata_review_state || "unreviewed"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 whitespace-pre-line text-sm leading-6 text-foreground">{detailItem.question.text}</div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    Packs: {detailItem.packs.map((pack) => pack.display_name).join(", ") || "None"}
                  </div>

                  {detailItem.question.answer_type === "text" ? (
                    <div className="mt-4 rounded-lg border border-border bg-background p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Answer matching
                        </div>
                        <span className={pillClass("accent")}>text answer</span>
                      </div>
                      <div className="grid gap-3">
                        <label className={metadataFieldLabelClass()}>
                          <div className={metadataFieldHeaderClass()}>
                            <span className={metadataFieldNameClass()}>answer_text</span>
                            <MetadataHint label="answer_text" hint="Canonical answer shown in results and used for text matching" />
                          </div>
                          <input
                            value={answerEditor.answerText}
                            onChange={(event) =>
                              setAnswerEditor((current) => ({
                                ...current,
                                answerText: event.target.value,
                              }))
                            }
                            className={metadataInputClass()}
                          />
                        </label>

                        <label className={metadataFieldLabelClass()}>
                          <div className={metadataFieldHeaderClass()}>
                            <span className={metadataFieldNameClass()}>accepted_answers</span>
                            <MetadataHint label="accepted_answers" hint="Use pipes or one answer per line for fair alternatives" />
                          </div>
                          <textarea
                            value={answerEditor.acceptedAnswers}
                            onChange={(event) =>
                              setAnswerEditor((current) => ({
                                ...current,
                                acceptedAnswers: event.target.value,
                              }))
                            }
                            rows={4}
                            className={`${metadataInputClass()} min-h-28 resize-y py-2`}
                            placeholder="Example: The Ballad of Czolgosz | Ballad of Czolgosz"
                          />
                        </label>

                        <div className="text-xs leading-5 text-muted-foreground">
                          The matcher now ignores punctuation and handles mild spelling errors. Use accepted answers for genuinely fair title variants, alternate forms, and article-free versions you want to allow explicitly.
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {detailItem.question.audio_path ? (
                    <>
                      <div className="mt-2 text-xs text-muted-foreground break-all">
                        audio_path: {detailItem.question.audio_path}
                      </div>
                      <div className="mt-3 rounded-lg border border-border bg-background p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Audio preview
                          </div>
                          {detailItem.metadata.saved.mediaDurationMs !== null && detailItem.metadata.saved.mediaDurationMs !== undefined ? (
                            <span className={pillClass("accent")}>{formatDurationMs(detailItem.metadata.saved.mediaDurationMs)}</span>
                          ) : null}
                        </div>
                        <audio
                          key={`${detailItem.question.id}:${detailItem.question.audio_path}`}
                          controls
                          preload="metadata"
                          className="w-full"
                          src={`/api/audio?path=${encodeURIComponent(detailItem.question.audio_path)}`}
                        >
                          Your browser does not support audio preview.
                        </audio>
                      </div>
                    </>
                  ) : null}
                  {detailItem.question.image_path ? (
                    <div className="mt-2 text-xs text-muted-foreground break-all">
                      image_path: {detailItem.question.image_path}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <label className={cx(metadataFieldLabelClass(), "md:col-span-1")}>
                    <div className={metadataFieldHeaderClass()}>
                      <span className={metadataFieldNameClass()}>media_type</span>
                      <MetadataHint label="media_type" hint="Format shown to player" />
                    </div>
                    <select
                      value={editor.mediaType}
                      onChange={(event) => setEditor((current) => ({ ...current, mediaType: event.target.value }))}
                      className={metadataSelectClass()}
                    >
                      {MEDIA_TYPE_OPTIONS.map((option) => (
                        <option key={option.value || "blank"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={cx(metadataFieldLabelClass(), "md:col-span-1")}>
                    <div className={metadataFieldHeaderClass()}>
                      <span className={metadataFieldNameClass()}>prompt_target</span>
                      <MetadataHint label="prompt_target" hint="What the player identifies" />
                    </div>
                    <select
                      value={editor.promptTarget}
                      onChange={(event) => setEditor((current) => ({ ...current, promptTarget: event.target.value }))}
                      className={metadataSelectClass()}
                    >
                      {PROMPT_TARGET_OPTIONS.map((option) => (
                        <option key={option.value || "blank"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={cx(metadataFieldLabelClass(), "md:col-span-1")}>
                    <div className={metadataFieldHeaderClass()}>
                      <span className={metadataFieldNameClass()}>clue_source</span>
                      <MetadataHint label="clue_source" hint="Type of clue given" />
                    </div>
                    <select
                      value={editor.clueSource}
                      onChange={(event) => setEditor((current) => ({ ...current, clueSource: event.target.value }))}
                      className={metadataSelectClass()}
                    >
                      {CLUE_SOURCE_OPTIONS.map((option) => (
                        <option key={option.value || "blank"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={cx(metadataFieldLabelClass(), "md:col-span-1")}>
                    <div className={metadataFieldHeaderClass()}>
                      <span className={metadataFieldNameClass()}>primary_show_key</span>
                      <MetadataHint label="primary_show_key" hint="Main show for this question" />
                    </div>
                    <select
                      value={editor.primaryShowKey}
                      onChange={(event) => setEditor((current) => ({ ...current, primaryShowKey: event.target.value }))}
                      className={metadataSelectClass()}
                    >
                      <option value="">Blank</option>
                      {shows.map((show) => (
                        <option key={show.show_key} value={show.show_key}>
                          {show.display_name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={cx(metadataFieldLabelClass(), "md:col-span-1")}>
                    <div className={metadataFieldHeaderClass()}>
                      <span className={metadataFieldNameClass()}>audio_clip_type</span>
                      <MetadataHint label="audio_clip_type" hint="Intro, vocal, dialogue, or effects" />
                    </div>
                    <select
                      value={editor.audioClipType}
                      onChange={(event) => setEditor((current) => ({ ...current, audioClipType: event.target.value }))}
                      className={metadataSelectClass()}
                      disabled={editor.mediaType !== "audio"}
                    >
                      {AUDIO_CLIP_TYPE_OPTIONS.map((option) => (
                        <option key={option.value || "blank"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={cx(metadataFieldLabelClass(), "md:col-span-1")}>
                    <div className={metadataFieldHeaderClass()}>
                      <span className={metadataFieldNameClass()}>media_duration_ms</span>
                      <MetadataHint label="media_duration_ms" hint="Quickfire audio must be 5000 ms or less" />
                    </div>
                    <input
                      value={editor.mediaDurationMs}
                      onChange={(event) => setEditor((current) => ({ ...current, mediaDurationMs: event.target.value }))}
                      inputMode="numeric"
                      placeholder="For example 4500"
                      className={metadataInputClass()}
                    />
                  </label>

                  <label className={cx(metadataFieldLabelClass(), "md:col-span-2")}>
                    <div className={metadataFieldHeaderClass()}>
                      <span className={metadataFieldNameClass()}>metadata_review_state</span>
                      <MetadataHint label="metadata_review_state" hint="Controls readiness and warnings" />
                    </div>
                    <select
                      value={editor.metadataReviewState}
                      onChange={(event) =>
                        setEditor((current) => ({
                          ...current,
                          metadataReviewState: event.target.value,
                        }))
                      }
                      className={metadataSelectClass()}
                    >
                      {REVIEW_STATE_SAVE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="secondary" onClick={applySuggestedValues} disabled={!selectedSummary}>
                    Use suggested values
                  </Button>
                  {detailItem.question.answer_type === "text" ? (
                    <Button size="sm" variant="secondary" onClick={saveAnswerFields} disabled={answerSaveBusy}>
                      {answerSaveBusy ? "Saving answers…" : "Save answers"}
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={saveMetadata} disabled={saveBusy}>
                    {saveBusy ? "Saving metadata…" : "Save metadata"}
                  </Button>
                </div>

                {answerSaveResult ? (
                  <div
                    className={cx(
                      "rounded-lg border px-3 py-2 text-sm",
                      answerSaveResult === "Answers saved."
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-red-300 bg-red-50 text-red-700"
                    )}
                  >
                    {answerSaveResult}
                  </div>
                ) : null}

                {saveResult ? (
                  <div
                    className={cx(
                      "rounded-lg px-3 py-2 text-sm",
                      saveResult === "Saved."
                        ? "border border-green-300 bg-green-50 text-green-700"
                        : "border border-red-300 bg-red-50 text-red-700"
                    )}
                  >
                    {saveResult}
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/70 pb-3">
            <CardTitle>Suggestions and warnings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {!selectedSummary ? (
              <div className="text-sm text-muted-foreground">
                Select a question to see suggested values and warnings.
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className={fieldCardClass()}>
                    <div className="text-sm font-medium">Saved values</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className={pillClass()}>{selectedSummary.saved.mediaType || "media blank"}</span>
                      <span className={pillClass()}>{selectedSummary.saved.promptTarget || "target blank"}</span>
                      <span className={pillClass()}>{selectedSummary.saved.clueSource || "clue blank"}</span>
                      <span className={pillClass()}>{selectedSummary.saved.primaryShowKey || "show blank"}</span>
                      <span className={pillClass(reviewStateTone(selectedSummary.saved.metadataReviewState))}>
                        {selectedSummary.saved.metadataReviewState || "review blank"}
                      </span>
                      <span className={pillClass(selectedSummary.saved.audioClipType ? "accent" : "default")}>
                        {selectedSummary.saved.audioClipType || "audio type blank"}
                      </span>
                    </div>
                    <div className="mt-3 text-sm text-muted-foreground">
                      media_duration_ms: {formatDurationMs(selectedSummary.saved.mediaDurationMs)}
                    </div>
                  </div>

                  <div className={fieldCardClass()}>
                    <div className="text-sm font-medium">Suggested values</div>
                    <div className="mt-2 grid gap-2">
                      <div className="rounded-md border border-border bg-background/70 px-2.5 py-2">
                        <div className={metadataFieldNameClass()}>media_type</div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <MetadataHint
                            label="media_type suggested value"
                            hint={selectedSummary.reasons.mediaType || "No reason available."}
                          />
                          <span className="text-sm font-medium text-foreground">
                            {selectedSummary.suggested.mediaType || "Blank"}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-md border border-border bg-background/70 px-2.5 py-2">
                        <div className={metadataFieldNameClass()}>prompt_target</div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <MetadataHint
                            label="prompt_target suggested value"
                            hint={selectedSummary.reasons.promptTarget || "No reason available."}
                          />
                          <span className="text-sm font-medium text-foreground">
                            {selectedSummary.suggested.promptTarget || "Blank"}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-md border border-border bg-background/70 px-2.5 py-2">
                        <div className={metadataFieldNameClass()}>clue_source</div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <MetadataHint
                            label="clue_source suggested value"
                            hint={selectedSummary.reasons.clueSource || "No reason available."}
                          />
                          <span className="text-sm font-medium text-foreground">
                            {selectedSummary.suggested.clueSource || "Blank"}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-md border border-border bg-background/70 px-2.5 py-2">
                        <div className={metadataFieldNameClass()}>primary_show_key</div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <MetadataHint
                            label="primary_show_key suggested value"
                            hint={selectedSummary.reasons.primaryShowKey || "No reason available."}
                          />
                          <span className="text-sm font-medium text-foreground">
                            {selectedSummary.suggested.primaryShowKey || "Blank"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={fieldCardClass()}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">Warnings</div>
                    <span className={pillClass(selectedSummary.warnings.length ? "warning" : "default")}>
                      {selectedSummary.warnings.length} warning{selectedSummary.warnings.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {selectedSummary.warnings.length === 0 ? (
                    <div className="mt-2 text-sm text-muted-foreground">No warnings.</div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {selectedSummary.warnings.map((warning) => (
                        <div
                          key={warning.code}
                          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                        >
                          {warning.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={() => setGuideExpanded((current) => !current)}
            className="flex w-full items-center justify-between gap-3 border-b border-border/70 px-5 py-3 text-left"
          >
            <div>
              <div className="text-base font-semibold text-foreground">Field guide</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Keep this closed while you work, then open it when you need the rule-of-thumb examples.
              </div>
            </div>
            <span className={pillClass()}>{guideExpanded ? "Hide" : "Show"}</span>
          </button>

          {guideExpanded ? (
            <CardContent className="space-y-3 pt-4 text-sm">
              <div className={fieldCardClass()}>
                <div className="font-medium">media_type</div>
                <div className="mt-1 text-muted-foreground">
                  Choose the format the player receives. Use text, audio, or image.
                </div>
                <div className="mt-2 text-muted-foreground">
                  Example: if the player hears a clip, choose <span className="font-medium text-foreground">audio</span>.
                </div>
              </div>

              <div className={fieldCardClass()}>
                <div className="font-medium">prompt_target</div>
                <div className="mt-1 text-muted-foreground">Choose what the player must identify or supply.</div>
                <div className="mt-2 text-muted-foreground">
                  Example: “Name the show from this clip” should use <span className="font-medium text-foreground">show_title</span>.
                </div>
              </div>

              <div className={fieldCardClass()}>
                <div className="font-medium">clue_source</div>
                <div className="mt-1 text-muted-foreground">Choose the kind of clue the player receives.</div>
                <div className="mt-2 text-muted-foreground">
                  Example: a theatre poster should use <span className="font-medium text-foreground">poster_art</span>.
                </div>
              </div>

              <div className={fieldCardClass()}>
                <div className="font-medium">primary_show_key</div>
                <div className="mt-1 text-muted-foreground">
                  Choose the main show this question belongs to, even if the player is not asked to name the show directly.
                </div>
                <div className="mt-2 text-muted-foreground">
                  Example: a question about the overture from Follies should use the Follies show key.
                </div>
              </div>

              <div className={fieldCardClass()}>
                <div className="font-medium">media_duration_ms</div>
                <div className="mt-1 text-muted-foreground">
                  Store audio length in milliseconds. Quickfire only allows audio clips at or under 5000 ms.
                </div>
                <div className="mt-2 text-muted-foreground">
                  Example: a 4.5 second clip should use <span className="font-medium text-foreground">4500</span>.
                </div>
              </div>

              <div className={fieldCardClass()}>
                <div className="font-medium">audio_clip_type</div>
                <div className="mt-1 text-muted-foreground">
                  Use this to distinguish intros, dialogue, vocals, instrumental sections, character voices, and sound effects.
                </div>
                <div className="mt-2 text-muted-foreground">
                  Example: an opening bar used to identify a song should use <span className="font-medium text-foreground">song_intro</span>.
                </div>
              </div>
            </CardContent>
          ) : null}
        </Card>
      </div>
    </div>
  )
}