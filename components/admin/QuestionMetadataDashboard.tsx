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
  metadataReviewState: string
}

type BulkEditorState = {
  mediaType: string
  promptTarget: string
  clueSource: string
  primaryShowKey: string
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

const CLUE_SOURCE_OPTIONS = [
  { value: "", label: "Blank" },
  { value: "direct_fact", label: "direct_fact" },
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
  { value: "song_clip", label: "song_clip" },
  { value: "overture_clip", label: "overture_clip" },
  { value: "entracte_clip", label: "entracte_clip" },
  { value: "lyric_excerpt", label: "lyric_excerpt" },
  { value: "poster_art", label: "poster_art" },
  { value: "production_photo", label: "production_photo" },
  { value: "cast_headshot", label: "cast_headshot" },
  { value: "prop_image", label: "prop_image" },
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
  return "rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-3"
}

function normaliseEditorValue(value: string | null | undefined) {
  return String(value ?? "")
}

function trimToNull(value: string) {
  const cleaned = value.trim()
  return cleaned.length ? cleaned : null
}

function buildSummaryText(item: QuestionSummaryItem) {
  const parts = [
    item.metadata.saved.mediaType || item.metadata.suggested.mediaType || "media ?",
    item.metadata.saved.promptTarget || item.metadata.suggested.promptTarget || "target ?",
    item.metadata.saved.clueSource || item.metadata.suggested.clueSource || "clue ?",
  ]
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

  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState("")

  const [editor, setEditor] = useState<EditorState>({
    mediaType: "",
    promptTarget: "",
    clueSource: "",
    primaryShowKey: "",
    metadataReviewState: "unreviewed",
  })

  const [bulkEditor, setBulkEditor] = useState<BulkEditorState>({
    mediaType: UNCHANGED_VALUE,
    promptTarget: UNCHANGED_VALUE,
    clueSource: UNCHANGED_VALUE,
    primaryShowKey: UNCHANGED_VALUE,
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
    setBulkResult("")

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
        metadataReviewState: normaliseEditorValue(nextItem.metadata.saved.metadataReviewState || "unreviewed"),
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
      mediaType: detailItem.metadata.suggested.mediaType || current.mediaType,
      promptTarget: detailItem.metadata.suggested.promptTarget || current.promptTarget,
      clueSource: detailItem.metadata.suggested.clueSource || current.clueSource,
      primaryShowKey: detailItem.metadata.suggested.primaryShowKey || current.primaryShowKey,
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
          metadataReviewState: editor.metadataReviewState || "unreviewed",
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
    setBulkResult("")
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
    <div className="grid gap-4 xl:grid-cols-[1.2fr_minmax(360px,1fr)] xl:items-start">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Token and filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste ADMIN_TOKEN here"
                autoComplete="off"
                spellCheck={false}
                className="h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--border)]"
              />
              <Button variant="secondary" onClick={clearToken}>
                Clear token
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <select
                value={packId}
                onChange={(event) => setPackId(event.target.value)}
                className="h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
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
                className="h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
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
                className="h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
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
                className="h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
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
                className="h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
              >
                {WARNING_FILTER_OPTIONS.map((option) => (
                  <option key={option.value || "blank"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search question text"
                className="h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--border)]"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => loadQuestions()}>Load questions</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setPackId("")
                  setLegacyRoundType("")
                  setAnswerType("")
                  setReviewState("")
                  setWarningState("")
                  setSearch("")
                }}
              >
                Reset filters
              </Button>
            </div>

            <div className="text-sm text-[var(--muted-foreground)]">
              Nothing writes to Supabase until you click Save or Bulk Apply.
            </div>

            {listError ? (
              <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {listError}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bulk apply</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-[var(--muted-foreground)]">
              Apply the same metadata values to all selected visible questions.
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={selectAllVisible} disabled={!items.length}>
                Select all visible
              </Button>
              <Button variant="secondary" onClick={clearSelection} disabled={!selectedCount}>
                Clear selection
              </Button>
            </div>

            <div className="text-sm">
              Selected questions: <span className="font-medium">{selectedCount}</span>
            </div>

            <div className="grid gap-3">
              <label className="grid gap-1">
                <span className="text-sm font-medium">media_type</span>
                <select
                  value={bulkEditor.mediaType}
                  onChange={(event) => setBulkEditor((current) => ({ ...current, mediaType: event.target.value }))}
                  className="h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
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
                  className="h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
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
                  className="h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
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
                  onChange={(event) =>
                    setBulkEditor((current) => ({ ...current, primaryShowKey: event.target.value }))
                  }
                  className="h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
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
                <span className="text-sm font-medium">metadata_review_state</span>
                <select
                  value={bulkEditor.metadataReviewState}
                  onChange={(event) =>
                    setBulkEditor((current) => ({
                      ...current,
                      metadataReviewState: event.target.value,
                    }))
                  }
                  className="h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
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
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {listBusy ? (
              <div className="text-sm text-[var(--muted-foreground)]">Loading questions…</div>
            ) : items.length === 0 ? (
              <div className="text-sm text-[var(--muted-foreground)]">
                No questions loaded yet. Enter your token, then click Load questions.
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => {
                  const isSelected = item.question.id === selectedQuestionId
                  const isTicked = selectedQuestionIds.includes(item.question.id)

                  return (
                    <div
                      key={item.question.id}
                      className={cx(
                        "rounded-lg border px-3 py-3 transition-colors",
                        isSelected
                          ? "border-[var(--foreground)] bg-[var(--muted)]"
                          : "border-[var(--border)] bg-[var(--card)]"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isTicked}
                          onChange={() => toggleSelectedQuestion(item.question.id)}
                          className="mt-1 h-4 w-4 rounded border-[var(--border)]"
                        />

                        <button
                          type="button"
                          onClick={async () => {
                            setSelectedQuestionId(item.question.id)
                            await loadQuestionDetail(item.question.id)
                          }}
                          className="flex-1 text-left"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="font-medium">{item.question.id}</div>
                              <div className="mt-1 text-sm">{item.question.text}</div>
                            </div>
                            <div className="text-xs text-[var(--muted-foreground)]">
                              {item.metadata.warnings.length} warning{item.metadata.warnings.length === 1 ? "" : "s"}
                            </div>
                          </div>

                          <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                            Packs: {item.packs.map((pack) => pack.display_name).join(", ") || "None"}
                          </div>

                          <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                            Legacy: {item.question.round_type} · Answer: {item.question.answer_type}
                          </div>

                          <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                            {buildSummaryText(item)}
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
        <Card>
          <CardHeader>
            <CardTitle>Question detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {detailBusy ? (
              <div className="text-sm text-[var(--muted-foreground)]">Loading question detail…</div>
            ) : detailError ? (
              <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {detailError}
              </div>
            ) : !detailItem ? (
              <div className="text-sm text-[var(--muted-foreground)]">
                Select a question to review its metadata.
              </div>
            ) : (
              <>
                <div className={fieldCardClass()}>
                  <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                    Question
                  </div>
                  <div className="mt-2 text-sm font-medium">{detailItem.question.id}</div>
                  <div className="mt-2 text-sm">{detailItem.question.text}</div>
                  <div className="mt-3 text-xs text-[var(--muted-foreground)]">
                    Packs: {detailItem.packs.map((pack) => pack.display_name).join(", ") || "None"}
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                    Legacy round type: {detailItem.question.round_type} · Answer type: {detailItem.question.answer_type}
                  </div>
                  {detailItem.question.audio_path ? (
                    <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                      audio_path: {detailItem.question.audio_path}
                    </div>
                  ) : null}
                  {detailItem.question.image_path ? (
                    <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                      image_path: {detailItem.question.image_path}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3">
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">media_type</span>
                    <select
                      value={editor.mediaType}
                      onChange={(event) => setEditor((current) => ({ ...current, mediaType: event.target.value }))}
                      className="h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                    >
                      {MEDIA_TYPE_OPTIONS.map((option) => (
                        <option key={option.value || "blank"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      Choose the format the player receives: text, audio, or image.
                    </div>
                  </label>

                  <label className="grid gap-1">
                    <span className="text-sm font-medium">prompt_target</span>
                    <select
                      value={editor.promptTarget}
                      onChange={(event) => setEditor((current) => ({ ...current, promptTarget: event.target.value }))}
                      className="h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                    >
                      {PROMPT_TARGET_OPTIONS.map((option) => (
                        <option key={option.value || "blank"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      Choose what the player must identify or supply.
                    </div>
                  </label>

                  <label className="grid gap-1">
                    <span className="text-sm font-medium">clue_source</span>
                    <select
                      value={editor.clueSource}
                      onChange={(event) => setEditor((current) => ({ ...current, clueSource: event.target.value }))}
                      className="h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                    >
                      {CLUE_SOURCE_OPTIONS.map((option) => (
                        <option key={option.value || "blank"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      Choose the kind of clue the player receives.
                    </div>
                  </label>

                  <label className="grid gap-1">
                    <span className="text-sm font-medium">primary_show_key</span>
                    <select
                      value={editor.primaryShowKey}
                      onChange={(event) => setEditor((current) => ({ ...current, primaryShowKey: event.target.value }))}
                      className="h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                    >
                      <option value="">Blank</option>
                      {shows.map((show) => (
                        <option key={show.show_key} value={show.show_key}>
                          {show.display_name}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      Choose the main show this question belongs to.
                    </div>
                  </label>

                  <label className="grid gap-1">
                    <span className="text-sm font-medium">metadata_review_state</span>
                    <select
                      value={editor.metadataReviewState}
                      onChange={(event) =>
                        setEditor((current) => ({
                          ...current,
                          metadataReviewState: event.target.value,
                        }))
                      }
                      className="h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                    >
                      {REVIEW_STATE_SAVE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={applySuggestedValues} disabled={!selectedSummary}>
                    Use suggested values
                  </Button>
                  <Button onClick={saveMetadata} disabled={saveBusy}>
                    {saveBusy ? "Saving…" : "Save"}
                  </Button>
                </div>

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

        <Card>
          <CardHeader>
            <CardTitle>Suggestions and warnings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedSummary ? (
              <div className="text-sm text-[var(--muted-foreground)]">
                Select a question to see suggested values and warnings.
              </div>
            ) : (
              <>
                <div className={fieldCardClass()}>
                  <div className="text-sm font-medium">Saved values</div>
                  <div className="mt-2 space-y-1 text-sm text-[var(--muted-foreground)]">
                    <div>media_type: {selectedSummary.saved.mediaType || "Blank"}</div>
                    <div>prompt_target: {selectedSummary.saved.promptTarget || "Blank"}</div>
                    <div>clue_source: {selectedSummary.saved.clueSource || "Blank"}</div>
                    <div>primary_show_key: {selectedSummary.saved.primaryShowKey || "Blank"}</div>
                    <div>metadata_review_state: {selectedSummary.saved.metadataReviewState || "Blank"}</div>
                  </div>
                </div>

                <div className={fieldCardClass()}>
                  <div className="text-sm font-medium">Suggested values</div>
                  <div className="mt-2 space-y-3 text-sm">
                    <div>
                      <div className="font-medium">media_type: {selectedSummary.suggested.mediaType || "Blank"}</div>
                      <div className="text-[var(--muted-foreground)]">
                        {selectedSummary.reasons.mediaType || "No reason available."}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium">
                        prompt_target: {selectedSummary.suggested.promptTarget || "Blank"}
                      </div>
                      <div className="text-[var(--muted-foreground)]">
                        {selectedSummary.reasons.promptTarget || "No reason available."}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium">clue_source: {selectedSummary.suggested.clueSource || "Blank"}</div>
                      <div className="text-[var(--muted-foreground)]">
                        {selectedSummary.reasons.clueSource || "No reason available."}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium">
                        primary_show_key: {selectedSummary.suggested.primaryShowKey || "Blank"}
                      </div>
                      <div className="text-[var(--muted-foreground)]">
                        {selectedSummary.reasons.primaryShowKey || "No reason available."}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={fieldCardClass()}>
                  <div className="text-sm font-medium">Warnings</div>
                  {selectedSummary.warnings.length === 0 ? (
                    <div className="mt-2 text-sm text-[var(--muted-foreground)]">No warnings.</div>
                  ) : (
                    <div className="mt-2 space-y-2">
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

        <Card>
          <CardHeader>
            <CardTitle>Field guide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className={fieldCardClass()}>
              <div className="font-medium">media_type</div>
              <div className="mt-1 text-[var(--muted-foreground)]">
                Choose the format the player receives. Use text, audio, or image.
              </div>
              <div className="mt-2 text-[var(--muted-foreground)]">
                Example: if the player hears a clip, choose{" "}
                <span className="font-medium text-[var(--foreground)]">audio</span>.
              </div>
            </div>

            <div className={fieldCardClass()}>
              <div className="font-medium">prompt_target</div>
              <div className="mt-1 text-[var(--muted-foreground)]">
                Choose what the player must identify or supply.
              </div>
              <div className="mt-2 text-[var(--muted-foreground)]">
                Example: “Name the show from this clip” should use{" "}
                <span className="font-medium text-[var(--foreground)]">show_title</span>.
              </div>
            </div>

            <div className={fieldCardClass()}>
              <div className="font-medium">clue_source</div>
              <div className="mt-1 text-[var(--muted-foreground)]">
                Choose the kind of clue the player receives.
              </div>
              <div className="mt-2 text-[var(--muted-foreground)]">
                Example: a theatre poster should use{" "}
                <span className="font-medium text-[var(--foreground)]">poster_art</span>.
              </div>
            </div>

            <div className={fieldCardClass()}>
              <div className="font-medium">primary_show_key</div>
              <div className="mt-1 text-[var(--muted-foreground)]">
                Choose the main show this question belongs to, even if the player is not asked to name the show directly.
              </div>
              <div className="mt-2 text-[var(--muted-foreground)]">
                Example: a question about the overture from Follies should use the Follies show key.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}