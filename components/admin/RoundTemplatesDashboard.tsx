"use client"

import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react"

import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import {
  normaliseDefaultPackIds,
  normaliseSelectionRules,
  type RoundTemplateBehaviourType,
  type RoundTemplateRow,
  type RoundTemplateSourceMode,
} from "@/lib/roundTemplates"
import { getDefaultAnswerSecondsForBehaviour, getDefaultRoundReviewSecondsForBehaviour } from "@/lib/roomRoundPlan"

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

type TemplatesResponse = {
  ok: true
  templates: RoundTemplateRow[]
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

type TemplateEditorState = {
  name: string
  description: string
  behaviourType: RoundTemplateBehaviourType
  defaultQuestionCount: number
  defaultAnswerSeconds: string
  defaultRoundReviewSeconds: string
  jokerEligible: boolean
  countsTowardsScore: boolean
  sourceMode: RoundTemplateSourceMode
  defaultPackIds: string[]
  mediaTypes: string[]
  answerTypes: string[]
  promptTargets: string[]
  clueSources: string[]
  primaryShowKeys: string[]
  audioClipTypes: string[]
  isActive: boolean
}

const BEHAVIOUR_TYPE_OPTIONS: Array<{ value: RoundTemplateBehaviourType; label: string }> = [
  { value: "standard", label: "standard" },
  { value: "quickfire", label: "quickfire" },
]

const SOURCE_MODE_OPTIONS: Array<{ value: RoundTemplateSourceMode; label: string }> = [
  { value: "selected_packs", label: "selected_packs" },
  { value: "specific_packs", label: "specific_packs" },
  { value: "all_questions", label: "all_questions" },
]

const MEDIA_TYPE_OPTIONS = [
  { value: "text", label: "text" },
  { value: "audio", label: "audio" },
  { value: "image", label: "image" },
]

const ANSWER_TYPE_OPTIONS = [
  { value: "mcq", label: "mcq" },
  { value: "text", label: "text" },
]

const PROMPT_TARGET_OPTIONS = [
  { value: "show_title", label: "show_title" },
  { value: "song_title", label: "song_title" },
  { value: "performer_name", label: "performer_name" },
  { value: "character_name", label: "character_name" },
  { value: "creative_name", label: "creative_name" },
  { value: "fact_value", label: "fact_value" },
]

const AUDIO_CLIP_TYPE_OPTIONS = [
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

function buildAdminHeaders(token: string) {
  return {
    "x-admin-token": token.trim(),
  }
}

function toggleInArray(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function buildSelectionRulesFromEditor(editor: TemplateEditorState) {
  const rules: Record<string, string[]> = {}

  if (editor.mediaTypes.length) rules.mediaTypes = editor.mediaTypes
  if (editor.answerTypes.length === 1) rules.answerTypes = editor.answerTypes
  if (editor.promptTargets.length) rules.promptTargets = editor.promptTargets
  if (editor.clueSources.length) rules.clueSources = editor.clueSources
  if (editor.primaryShowKeys.length) rules.primaryShowKeys = editor.primaryShowKeys
  if (editor.audioClipTypes.length) rules.audioClipTypes = editor.audioClipTypes

  return rules
}

function buildTemplateTimingPayload(editor: TemplateEditorState) {
  const payload: Record<string, number | null> = {}

  if (editor.defaultAnswerSeconds.trim() === "") {
    payload.defaultAnswerSeconds = null
  } else {
    const answerSeconds = Number(editor.defaultAnswerSeconds.trim())
    if (Number.isFinite(answerSeconds) && answerSeconds >= 0) {
      payload.defaultAnswerSeconds = Math.floor(answerSeconds)
    }
  }

  if (editor.defaultRoundReviewSeconds.trim() === "") {
    payload.defaultRoundReviewSeconds = null
  } else {
    const roundReviewSeconds = Number(editor.defaultRoundReviewSeconds.trim())
    if (Number.isFinite(roundReviewSeconds) && roundReviewSeconds >= 0) {
      payload.defaultRoundReviewSeconds = Math.floor(roundReviewSeconds)
    }
  }

  return payload
}

function createBlankEditor(): TemplateEditorState {
  return {
    name: "",
    description: "",
    behaviourType: "standard",
    defaultQuestionCount: 10,
    defaultAnswerSeconds: "",
    defaultRoundReviewSeconds: "",
    jokerEligible: true,
    countsTowardsScore: true,
    sourceMode: "selected_packs",
    defaultPackIds: [],
    mediaTypes: [],
    answerTypes: [],
    promptTargets: [],
    clueSources: [],
    primaryShowKeys: [],
    audioClipTypes: [],
    isActive: true,
  }
}

function editorFromTemplate(template: RoundTemplateRow): TemplateEditorState {
  const defaultPackIds = normaliseDefaultPackIds(template.default_pack_ids)
  const selectionRules = normaliseSelectionRules(template.selection_rules)

  return {
    name: template.name,
    description: template.description ?? "",
    behaviourType: (template.behaviour_type ?? "standard") as RoundTemplateBehaviourType,
    defaultQuestionCount: Number(template.default_question_count ?? 10),
    defaultAnswerSeconds:
      template.default_answer_seconds == null ? "" : String(template.default_answer_seconds),
    defaultRoundReviewSeconds:
      template.default_round_review_seconds == null ? "" : String(template.default_round_review_seconds),
    jokerEligible: !!template.joker_eligible,
    countsTowardsScore: !!template.counts_towards_score,
    sourceMode: (template.source_mode ?? "selected_packs") as RoundTemplateSourceMode,
    defaultPackIds,
    mediaTypes: selectionRules.mediaTypes ?? [],
    answerTypes: selectionRules.answerTypes ?? [],
    promptTargets: selectionRules.promptTargets ?? [],
    clueSources: selectionRules.clueSources ?? [],
    primaryShowKeys: selectionRules.primaryShowKeys ?? [],
    audioClipTypes: selectionRules.audioClipTypes ?? [],
    isActive: template.is_active !== false,
  }
}

function ruleSummary(editor: TemplateEditorState) {
  const parts: string[] = []
  if (editor.mediaTypes.length) parts.push(`media ${editor.mediaTypes.length}`)
  if (editor.answerTypes.length === 1) parts.push(`answer ${editor.answerTypes[0]}`)
  if (editor.promptTargets.length) parts.push(`prompt ${editor.promptTargets.length}`)
  if (editor.clueSources.length) parts.push(`clue ${editor.clueSources.length}`)
  if (editor.primaryShowKeys.length) parts.push(`shows ${editor.primaryShowKeys.length}`)
  if (editor.audioClipTypes.length) parts.push(`audio clips ${editor.audioClipTypes.length}`)
  return parts.length ? parts.join(" · ") : "No filters"
}

function countSelectedRules(editor: TemplateEditorState) {
  return (
    editor.mediaTypes.length +
    editor.promptTargets.length +
    editor.clueSources.length +
    editor.primaryShowKeys.length +
    editor.audioClipTypes.length
  )
}

function packSummary(editor: TemplateEditorState, packs: PackOption[]) {
  if (!editor.defaultPackIds.length) return "No default packs"
  const labels = packs
    .filter((pack) => editor.defaultPackIds.includes(pack.id))
    .map((pack) => pack.label)
  if (!labels.length) return `${editor.defaultPackIds.length} default pack${editor.defaultPackIds.length === 1 ? "" : "s"}`
  const preview = labels.slice(0, 2).join(" · ")
  const remaining = labels.length - 2
  return remaining > 0 ? `${preview} +${remaining}` : preview
}

function multiSelectSummary(
  values: string[],
  options: Array<{ value: string; label: string }>,
  emptyLabel = "No filter",
) {
  if (!values.length) return emptyLabel
  const labels = options
    .filter((option) => values.includes(option.value))
    .map((option) => option.label)
  if (!labels.length) return `${values.length} selected`
  const preview = labels.slice(0, 2).join(" · ")
  const remaining = labels.length - 2
  return remaining > 0 ? `${preview} +${remaining}` : preview
}

function SectionCard({
  title,
  subtitle,
  open,
  onToggle,
  children,
  badge,
}: {
  title: string
  subtitle?: string
  open: boolean
  onToggle: () => void
  children: ReactNode
  badge?: string
}) {
  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 px-6 py-4 text-left hover:bg-muted/30"
      >
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{title}</CardTitle>
            {badge ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{badge}</span>
            ) : null}
          </div>
          {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
        </div>
        <span className="mt-0.5 text-xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? <CardContent className="pt-0">{children}</CardContent> : null}
    </Card>
  )
}

export function RoundTemplatesDashboard() {
  const [token, setToken] = useState("")
  const cleanToken = token.trim()

  const [search, setSearch] = useState("")
  const [templates, setTemplates] = useState<RoundTemplateRow[]>([])
  const [packs, setPacks] = useState<PackOption[]>([])
  const [shows, setShows] = useState<ShowOption[]>([])

  const [listBusy, setListBusy] = useState(false)
  const [listError, setListError] = useState("")

  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [createBusy, setCreateBusy] = useState(false)
  const [createResult, setCreateResult] = useState("")
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveResult, setSaveResult] = useState("")

  const [createEditor, setCreateEditor] = useState<TemplateEditorState>(createBlankEditor())
  const [editEditor, setEditEditor] = useState<TemplateEditorState>(createBlankEditor())

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

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

  async function loadTemplates(nextSelectedTemplateId?: string) {
    if (!cleanToken) {
      setListError("Enter your admin token first.")
      setTemplates([])
      return
    }

    setListBusy(true)
    setListError("")
    setCreateResult("")
    setSaveResult("")

    try {
      try {
        sessionStorage.setItem("mtq_admin_token", cleanToken)
      } catch {
        // ignore
      }

      const res = await fetch("/api/admin/round-templates", {
        headers: buildAdminHeaders(cleanToken),
        cache: "no-store",
      })

      const json = (await res.json()) as TemplatesResponse | { error?: string }

      if (!res.ok) {
        setTemplates([])
        setListError((json as { error?: string }).error || "Could not load round templates.")
        return
      }

      const nextTemplates = (json as TemplatesResponse).templates || []
      setTemplates(nextTemplates)

      const targetId =
        nextSelectedTemplateId ||
        selectedTemplateId ||
        (nextTemplates.length ? nextTemplates[0]?.id : "")

      if (targetId && nextTemplates.some((template) => template.id === targetId)) {
        const selected = nextTemplates.find((template) => template.id === targetId)!
        setSelectedTemplateId(selected.id)
        setEditEditor(editorFromTemplate(selected))
      } else {
        setSelectedTemplateId("")
        setEditEditor(createBlankEditor())
      }
    } catch (error: any) {
      setTemplates([])
      setListError(error?.message || "Could not load round templates.")
    } finally {
      setListBusy(false)
    }
  }

  async function createTemplate() {
    if (!cleanToken) {
      setCreateResult("Enter your admin token first.")
      return
    }

    if (!createEditor.name.trim()) {
      setCreateResult("Name is required.")
      return
    }

    setCreateBusy(true)
    setCreateResult("")
    setSaveResult("")

    try {
      const res = await fetch("/api/admin/round-templates", {
        method: "POST",
        headers: {
          ...buildAdminHeaders(cleanToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: createEditor.name.trim(),
          description: createEditor.description.trim(),
          behaviourType: createEditor.behaviourType,
          defaultQuestionCount: createEditor.defaultQuestionCount,
          ...buildTemplateTimingPayload(createEditor),
          jokerEligible: createEditor.jokerEligible,
          countsTowardsScore: createEditor.countsTowardsScore,
          sourceMode: createEditor.sourceMode,
          defaultPackIds: createEditor.defaultPackIds,
          selectionRules: buildSelectionRulesFromEditor(createEditor),
          isActive: createEditor.isActive,
        }),
      })

      const json = (await res.json()) as { error?: string; template?: RoundTemplateRow }

      if (!res.ok) {
        setCreateResult(json.error || "Could not create round template.")
        return
      }

      const created = json.template
      setCreateResult("Round template created.")
      setCreateEditor(createBlankEditor())
      setCreateOpen(false)
      await loadTemplates(created?.id)
    } catch (error: any) {
      setCreateResult(error?.message || "Could not create round template.")
    } finally {
      setCreateBusy(false)
    }
  }

  async function saveTemplate() {
    if (!cleanToken) {
      setSaveResult("Enter your admin token first.")
      return
    }

    if (!selectedTemplateId) {
      setSaveResult("Select a round template first.")
      return
    }

    if (!editEditor.name.trim()) {
      setSaveResult("Name is required.")
      return
    }

    setSaveBusy(true)
    setSaveResult("")
    setCreateResult("")

    try {
      const res = await fetch(`/api/admin/round-templates/${encodeURIComponent(selectedTemplateId)}`, {
        method: "PATCH",
        headers: {
          ...buildAdminHeaders(cleanToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editEditor.name.trim(),
          description: editEditor.description.trim(),
          behaviourType: editEditor.behaviourType,
          defaultQuestionCount: editEditor.defaultQuestionCount,
          ...buildTemplateTimingPayload(editEditor),
          jokerEligible: editEditor.jokerEligible,
          countsTowardsScore: editEditor.countsTowardsScore,
          sourceMode: editEditor.sourceMode,
          defaultPackIds: editEditor.defaultPackIds,
          selectionRules: buildSelectionRulesFromEditor(editEditor),
          isActive: editEditor.isActive,
        }),
      })

      const json = (await res.json()) as { error?: string }

      if (!res.ok) {
        setSaveResult(json.error || "Could not save round template.")
        return
      }

      setSaveResult("Saved.")
      await loadTemplates(selectedTemplateId)
    } catch (error: any) {
      setSaveResult(error?.message || "Could not save round template.")
    } finally {
      setSaveBusy(false)
    }
  }

  function clearToken() {
    setToken("")
    setTemplates([])
    setShows([])
    setSelectedTemplateId("")
    setListError("")
    setCreateResult("")
    setSaveResult("")
    try {
      sessionStorage.removeItem("mtq_admin_token")
    } catch {
      // ignore
    }
  }

  const filteredTemplates = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const sorted = [...templates].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    if (!needle) return sorted

    return sorted.filter((template) => {
      const defaultPackIds = normaliseDefaultPackIds(template.default_pack_ids).join(" ").toLowerCase()

      return (
        template.name.toLowerCase().includes(needle) ||
        String(template.description ?? "").toLowerCase().includes(needle) ||
        defaultPackIds.includes(needle)
      )
    })
  }, [templates, search])

  const selectedTemplate = useMemo(
    () => filteredTemplates.find((template) => template.id === selectedTemplateId) ?? templates.find((template) => template.id === selectedTemplateId) ?? null,
    [filteredTemplates, selectedTemplateId, templates]
  )

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(360px,1fr)_minmax(420px,1fr)] xl:items-start">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Token and controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste ADMIN_TOKEN here"
                autoComplete="off"
                spellCheck={false}
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
              />
              <Button variant="secondary" onClick={clearToken}>
                Clear token
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search round templates"
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
              />
              <Button onClick={() => loadTemplates()}>Load templates</Button>
            </div>

            <div className="text-sm text-muted-foreground">
              Round templates are reusable definitions. They do not store actual question IDs for a game.
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
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Round templates</CardTitle>
              <div className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                {filteredTemplates.length} shown
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedTemplate ? (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                <div className="font-medium">Selected: {selectedTemplate.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {selectedTemplate.default_question_count} questions · {selectedTemplate.behaviour_type} · {selectedTemplate.source_mode}
                </div>
              </div>
            ) : null}

            {listBusy ? (
              <div className="text-sm text-muted-foreground">Loading round templates…</div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No round templates loaded yet. Enter your token, then click Load templates.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTemplates.map((template) => {
                  const isSelected = template.id === selectedTemplateId
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => {
                        setSelectedTemplateId(template.id)
                        setEditEditor(editorFromTemplate(template))
                        setEditOpen(true)
                        setSaveResult("")
                      }}
                      className={`block w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                        isSelected
                          ? "border-foreground bg-muted"
                          : "border-border bg-card hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">{template.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {template.default_question_count} questions · {template.behaviour_type} · {template.source_mode}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {template.default_answer_seconds == null
                              ? `Answer: ${getDefaultAnswerSecondsForBehaviour(template.behaviour_type)}s default`
                              : `Answer: ${template.default_answer_seconds}s`}
                            {" · "}
                            {template.default_round_review_seconds == null
                              ? `Round review: ${getDefaultRoundReviewSecondsForBehaviour(template.behaviour_type)}s default`
                              : `Round review: ${template.default_round_review_seconds}s`}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {template.is_active ? "Active" : "Inactive"}
                        </div>
                      </div>

                      {template.description ? (
                        <div className="mt-2 text-sm text-muted-foreground">{template.description}</div>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1">
        <SectionCard
          title="Add round template"
          subtitle={`New template · ${packSummary(createEditor, packs)} · ${ruleSummary(createEditor)}`}
          open={createOpen}
          onToggle={() => setCreateOpen((current) => !current)}
        >
          <TemplateFields editor={createEditor} setEditor={setCreateEditor} packs={packs} shows={shows} />

          <div className="flex flex-wrap gap-2">
            <Button onClick={createTemplate} disabled={createBusy}>
              {createBusy ? "Creating…" : "Create round template"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setCreateEditor(createBlankEditor())
                setCreateResult("")
              }}
            >
              Reset form
            </Button>
          </div>

          {createResult ? (
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                createResult === "Round template created."
                  ? "border border-green-300 bg-green-50 text-green-700"
                  : "border border-red-300 bg-red-50 text-red-700"
              }`}
            >
              {createResult}
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Edit selected template"
          subtitle={
            selectedTemplate
              ? `${selectedTemplate.name} · ${packSummary(editEditor, packs)} · ${ruleSummary(editEditor)}`
              : "Select a template from the list to edit it"
          }
          badge={selectedTemplate ? (selectedTemplate.is_active ? "Active" : "Inactive") : undefined}
          open={editOpen}
          onToggle={() => setEditOpen((current) => !current)}
        >
          {!selectedTemplateId ? (
            <div className="text-sm text-muted-foreground">
              Select a round template from the list to edit it.
            </div>
          ) : (
            <>
              <TemplateFields editor={editEditor} setEditor={setEditEditor} packs={packs} shows={shows} />

              <div className="flex flex-wrap gap-2">
                <Button onClick={saveTemplate} disabled={saveBusy}>
                  {saveBusy ? "Saving…" : "Save changes"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const template = templates.find((item) => item.id === selectedTemplateId)
                    if (template) {
                      setEditEditor(editorFromTemplate(template))
                      setSaveResult("")
                    }
                  }}
                >
                  Reset edits
                </Button>
              </div>

              {saveResult ? (
                <div
                  className={`rounded-lg px-3 py-2 text-sm ${
                    saveResult === "Saved."
                      ? "border border-green-300 bg-green-50 text-green-700"
                      : "border border-red-300 bg-red-50 text-red-700"
                  }`}
                >
                  {saveResult}
                </div>
              ) : null}
            </>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

function TemplateFields({
  editor,
  setEditor,
  packs,
  shows,
}: {
  editor: TemplateEditorState
  setEditor: Dispatch<SetStateAction<TemplateEditorState>>
  packs: PackOption[]
  shows: ShowOption[]
}) {
  const [showPackSection, setShowPackSection] = useState(false)
  const [showRuleSection, setShowRuleSection] = useState(true)

  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-sm font-medium">Name</span>
          <input
            value={editor.name}
            onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))}
            placeholder="Song Intros"
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">Description</span>
          <textarea
            value={editor.description}
            onChange={(event) => setEditor((current) => ({ ...current, description: event.target.value }))}
            rows={3}
            placeholder="Audio clips that ask players to identify songs from their openings."
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-border"
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-sm font-medium">Behaviour</span>
          <select
            value={editor.behaviourType}
            onChange={(event) =>
              setEditor((current) => {
                const nextBehaviour = event.target.value as RoundTemplateBehaviourType
                const nextMediaTypes = nextBehaviour === "quickfire" ? current.mediaTypes.filter((value) => value !== "audio") : current.mediaTypes
                const nextAnswerTypes = nextBehaviour === "quickfire"
                  ? current.answerTypes.includes("mcq") ? ["mcq"] : ["mcq"]
                  : current.answerTypes
                return {
                  ...current,
                  behaviourType: nextBehaviour,
                  jokerEligible: nextBehaviour === "quickfire" ? false : current.jokerEligible,
                  mediaTypes: nextMediaTypes,
                  answerTypes: nextAnswerTypes,
                  audioClipTypes: nextMediaTypes.includes("audio") ? current.audioClipTypes : [],
                  defaultAnswerSeconds:
                    current.defaultAnswerSeconds.trim() === ""
                      ? current.defaultAnswerSeconds
                      : String(getDefaultAnswerSecondsForBehaviour(nextBehaviour)),
                  defaultRoundReviewSeconds:
                    current.defaultRoundReviewSeconds.trim() === ""
                      ? current.defaultRoundReviewSeconds
                      : String(getDefaultRoundReviewSecondsForBehaviour(nextBehaviour)),
                }
              })
            }
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
          >
            {BEHAVIOUR_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">Default question count</span>
          <input
            type="number"
            min={1}
            value={editor.defaultQuestionCount}
            onChange={(event) =>
              setEditor((current) => ({
                ...current,
                defaultQuestionCount: Math.max(1, Number(event.target.value) || 1),
              }))
            }
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-sm font-medium">Default answer seconds</span>
          <input
            type="number"
            min={0}
            max={120}
            value={editor.defaultAnswerSeconds}
            onChange={(event) =>
              setEditor((current) => ({
                ...current,
                defaultAnswerSeconds: event.target.value,
              }))
            }
            placeholder={String(getDefaultAnswerSecondsForBehaviour(editor.behaviourType))}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
          />
          <span className="text-xs text-muted-foreground">
            Leave blank to use the {getDefaultAnswerSecondsForBehaviour(editor.behaviourType)} second {editor.behaviourType} default. Use 0 for untimed.
          </span>
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">Default round review seconds</span>
          <input
            type="number"
            min={0}
            max={120}
            value={editor.defaultRoundReviewSeconds}
            onChange={(event) =>
              setEditor((current) => ({
                ...current,
                defaultRoundReviewSeconds: event.target.value,
              }))
            }
            placeholder={String(getDefaultRoundReviewSecondsForBehaviour(editor.behaviourType))}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
          />
          <span className="text-xs text-muted-foreground">
            Leave blank to use the {getDefaultRoundReviewSecondsForBehaviour(editor.behaviourType)} second {editor.behaviourType} default.
          </span>
        </label>
      </div>

      <label className="grid gap-1">
        <span className="text-sm font-medium">Source mode</span>
        <select
          value={editor.sourceMode}
          onChange={(event) =>
            setEditor((current) => ({
              ...current,
              sourceMode: event.target.value as RoundTemplateSourceMode,
            }))
          }
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
        >
          {SOURCE_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {editor.behaviourType === "quickfire" ? (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Quickfire allows MCQ questions only. Audio is allowed when media_duration_ms is set and the clip is 5 seconds or shorter.
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-muted/20">
        <button
          type="button"
          onClick={() => setShowPackSection((current) => !current)}
          className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left"
        >
          <div>
            <div className="text-sm font-medium">Default packs</div>
            <div className="mt-1 text-xs text-muted-foreground">{packSummary(editor, packs)}</div>
          </div>
          <span className="text-xs text-muted-foreground">{showPackSection ? "Hide" : "Show"}</span>
        </button>
        {showPackSection ? (
          <div className="border-t border-border px-3 py-3">
            <div className="mb-3 text-xs text-muted-foreground">
              {editor.sourceMode === "specific_packs"
                ? "These saved packs define the template pool."
                : editor.sourceMode === "selected_packs"
                  ? "These saved packs are optional reference defaults. The host-selected packs still control the pool."
                  : "Saved packs are ignored when the template uses all_questions."}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {packs.map((pack) => {
                const checked = editor.defaultPackIds.includes(pack.id)
                return (
                  <label key={pack.id} className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setEditor((current) => ({
                          ...current,
                          defaultPackIds: toggleInArray(current.defaultPackIds, pack.id),
                        }))
                      }
                      className="mt-0.5"
                    />
                    <span>{pack.label}</span>
                  </label>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-muted/20">
        <button
          type="button"
          onClick={() => setShowRuleSection((current) => !current)}
          className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left"
        >
          <div>
            <div className="text-sm font-medium">Selection rules</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {ruleSummary(editor)} · Within a field, choices behave as OR. Across different fields, rules combine as AND.
            </div>
          </div>
          <span className="text-xs text-muted-foreground">{showRuleSection ? "Hide" : "Show"}</span>
        </button>
        {showRuleSection ? (
          <div className="border-t border-border px-3 py-3">
            <div className="grid gap-3 lg:grid-cols-2">
              <InlineChipMultiSelectField
                title="media_type"
                values={editor.mediaTypes}
                options={MEDIA_TYPE_OPTIONS.map((option) => ({ ...option, disabled: option.value === "audio" && editor.behaviourType === "quickfire" }))}
                onToggle={(value) =>
                  setEditor((current) => {
                    const mediaTypes = toggleInArray(current.mediaTypes, value)
                    return {
                      ...current,
                      mediaTypes,
                      audioClipTypes: mediaTypes.includes("audio") ? current.audioClipTypes : [],
                    }
                  })
                }
                onClear={() => setEditor((current) => ({ ...current, mediaTypes: [], audioClipTypes: [] }))}
              />

              <InlineChipMultiSelectField
                title="answer_type"
                values={editor.answerTypes.length === 2 ? [] : editor.answerTypes}
                options={ANSWER_TYPE_OPTIONS.map((option) => ({
                  ...option,
                  disabled: option.value === "text" && editor.behaviourType === "quickfire",
                }))}
                onToggle={(value) =>
                  setEditor((current) => {
                    const next = toggleInArray(current.answerTypes, value)
                    const compact = next.includes("mcq") && next.includes("text") ? [] : next
                    return {
                      ...current,
                      answerTypes: current.behaviourType === "quickfire" ? ["mcq"] : compact,
                    }
                  })
                }
                onClear={() =>
                  setEditor((current) => ({
                    ...current,
                    answerTypes: current.behaviourType === "quickfire" ? ["mcq"] : [],
                  }))
                }
                description={editor.behaviourType === "quickfire" ? "Quickfire is limited to MCQ." : undefined}
              />

              <SearchableMultiSelectField
                title="prompt_target"
                values={editor.promptTargets}
                options={PROMPT_TARGET_OPTIONS}
                searchPlaceholder="Search prompt targets"
                onToggle={(value) =>
                  setEditor((current) => ({
                    ...current,
                    promptTargets: toggleInArray(current.promptTargets, value),
                  }))
                }
                onClear={() => setEditor((current) => ({ ...current, promptTargets: [] }))}
              />

              <SearchableMultiSelectField
                title="clue_source"
                values={editor.clueSources}
                options={CLUE_SOURCE_OPTIONS}
                searchPlaceholder="Search clue sources"
                onToggle={(value) =>
                  setEditor((current) => ({
                    ...current,
                    clueSources: toggleInArray(current.clueSources, value),
                  }))
                }
                onClear={() => setEditor((current) => ({ ...current, clueSources: [] }))}
              />

              <SearchableMultiSelectField
                title="primary_show_key"
                values={editor.primaryShowKeys}
                options={shows.map((show) => ({ value: show.show_key, label: show.display_name }))}
                searchPlaceholder="Search shows"
                onToggle={(value) =>
                  setEditor((current) => ({
                    ...current,
                    primaryShowKeys: toggleInArray(current.primaryShowKeys, value),
                  }))
                }
                onClear={() => setEditor((current) => ({ ...current, primaryShowKeys: [] }))}
              />

              <SearchableMultiSelectField
                title="audio_clip_type"
                description="Available when media_type includes audio."
                values={editor.audioClipTypes}
                options={AUDIO_CLIP_TYPE_OPTIONS.map((option) => ({ ...option, disabled: !editor.mediaTypes.includes("audio") }))}
                searchPlaceholder="Search audio clip types"
                onToggle={(value) =>
                  setEditor((current) => ({
                    ...current,
                    audioClipTypes: toggleInArray(current.audioClipTypes, value),
                  }))
                }
                onClear={() => setEditor((current) => ({ ...current, audioClipTypes: [] }))}
                className="lg:col-span-2"
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={editor.jokerEligible}
            onChange={(event) => setEditor((current) => ({ ...current, jokerEligible: event.target.checked }))}
            disabled={editor.behaviourType === "quickfire"}
          />
          Joker eligible
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={editor.countsTowardsScore}
            onChange={(event) => setEditor((current) => ({ ...current, countsTowardsScore: event.target.checked }))}
          />
          Counts towards score
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={editor.isActive}
            onChange={(event) => setEditor((current) => ({ ...current, isActive: event.target.checked }))}
          />
          Active
        </label>
      </div>
    </div>
  )
}

function InlineChipMultiSelectField({
  title,
  description,
  values,
  options,
  onToggle,
  onClear,
  className = "",
}: {
  title: string
  description?: string
  values: string[]
  options: Array<{ value: string; label: string; disabled?: boolean }>
  onToggle: (value: string) => void
  onClear: () => void
  className?: string
}) {
  return (
    <div className={`rounded-lg border border-border bg-background p-3 ${className}`.trim()}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">{multiSelectSummary(values, options)}</div>
          {description ? <div className="mt-1 text-xs text-muted-foreground">{description}</div> : null}
        </div>
        {values.length ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            Clear
          </button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = values.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              disabled={option.disabled}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${selected ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted/60"} ${option.disabled ? "cursor-not-allowed opacity-50" : ""}`.trim()}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SearchableMultiSelectField({
  title,
  description,
  values,
  options,
  onToggle,
  onClear,
  className = "",
  searchPlaceholder = "Search",
}: {
  title: string
  description?: string
  values: string[]
  options: Array<{ value: string; label: string; disabled?: boolean }>
  onToggle: (value: string) => void
  onClear: () => void
  className?: string
  searchPlaceholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const filteredOptions = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    return [...options]
      .filter((option) => {
        if (!trimmed) return true
        return option.label.toLowerCase().includes(trimmed) || option.value.toLowerCase().includes(trimmed)
      })
      .sort((a, b) => {
        const aSelected = values.includes(a.value) ? 1 : 0
        const bSelected = values.includes(b.value) ? 1 : 0
        if (aSelected !== bSelected) return bSelected - aSelected
        return a.label.localeCompare(b.label)
      })
  }, [options, query, values])

  const summary = multiSelectSummary(values, options)

  return (
    <div className={`rounded-lg border border-border bg-background p-3 ${className}`.trim()}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">{summary}</div>
          {description ? <div className="mt-1 text-xs text-muted-foreground">{description}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {values.length ? (
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-muted-foreground underline underline-offset-2"
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground"
          >
            {open ? "Hide" : "Choose"}
          </button>
        </div>
      </div>

      {values.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {options
            .filter((option) => values.includes(option.value))
            .slice(0, 6)
            .map((option) => (
              <span key={option.value} className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
                {option.label}
              </span>
            ))}
          {values.length > 6 ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              +{values.length - 6} more
            </span>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
          />
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-card">
            {filteredOptions.length ? (
              <div className="divide-y divide-border">
                {filteredOptions.map((option) => {
                  const selected = values.includes(option.value)
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-3 px-3 py-2 text-sm ${option.disabled ? "cursor-not-allowed opacity-50" : "hover:bg-muted/40"}`.trim()}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggle(option.value)}
                        className="mt-0.5"
                        disabled={option.disabled}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-foreground">{option.label}</div>
                        {option.label !== option.value ? (
                          <div className="text-xs text-muted-foreground">{option.value}</div>
                        ) : null}
                      </div>
                    </label>
                  )
                })}
              </div>
            ) : (
              <div className="px-3 py-4 text-sm text-muted-foreground">No matches</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
