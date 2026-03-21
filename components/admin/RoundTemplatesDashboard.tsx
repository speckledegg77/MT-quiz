"use client"

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react"

import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import {
  firstRuleValue,
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
  mediaType: string
  promptTarget: string
  clueSource: string
  primaryShowKey: string
  audioClipType: string
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
  { value: "", label: "No filter" },
  { value: "text", label: "text" },
  { value: "audio", label: "audio" },
  { value: "image", label: "image" },
]

const PROMPT_TARGET_OPTIONS = [
  { value: "", label: "No filter" },
  { value: "show_title", label: "show_title" },
  { value: "song_title", label: "song_title" },
  { value: "performer_name", label: "performer_name" },
  { value: "character_name", label: "character_name" },
  { value: "creative_name", label: "creative_name" },
  { value: "fact_value", label: "fact_value" },
]

const AUDIO_CLIP_TYPE_OPTIONS = [
  { value: "", label: "No filter" },
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
  { value: "", label: "No filter" },
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

  if (editor.mediaType) rules.mediaTypes = [editor.mediaType]
  if (editor.promptTarget) rules.promptTargets = [editor.promptTarget]
  if (editor.clueSource) rules.clueSources = [editor.clueSource]
  if (editor.primaryShowKey) rules.primaryShowKeys = [editor.primaryShowKey]
  if (editor.audioClipType) rules.audioClipTypes = [editor.audioClipType]

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
    mediaType: "",
    promptTarget: "",
    clueSource: "",
    primaryShowKey: "",
    audioClipType: "",
    isActive: true,
  }
}

function editorFromTemplate(template: RoundTemplateRow): TemplateEditorState {
  const defaultPackIds = Array.isArray(template.default_pack_ids)
    ? template.default_pack_ids.map((value) => String(value ?? "").trim()).filter(Boolean)
    : []

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
    mediaType: firstRuleValue(template.selection_rules, "mediaTypes"),
    promptTarget: firstRuleValue(template.selection_rules, "promptTargets"),
    clueSource: firstRuleValue(template.selection_rules, "clueSources"),
    primaryShowKey: firstRuleValue(template.selection_rules, "primaryShowKeys"),
    audioClipType: firstRuleValue(template.selection_rules, "audioClipTypes"),
    isActive: !!template.is_active,
  }
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
    if (!needle) return templates

    return templates.filter((template) => {
      const defaultPackIds = Array.isArray(template.default_pack_ids)
        ? template.default_pack_ids.map((value) => String(value ?? "")).join(" ").toLowerCase()
        : ""

      return (
        template.name.toLowerCase().includes(needle) ||
        String(template.description ?? "").toLowerCase().includes(needle) ||
        defaultPackIds.includes(needle)
      )
    })
  }, [templates, search])

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_minmax(380px,1fr)] xl:items-start">
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
            <CardTitle>Round templates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
        <Card>
          <CardHeader>
            <CardTitle>Add round template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <TemplateFields
              editor={createEditor}
              setEditor={setCreateEditor}
              packs={packs}
              shows={shows}
            />

            <Button onClick={createTemplate} disabled={createBusy}>
              {createBusy ? "Creating…" : "Create round template"}
            </Button>

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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Edit selected template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedTemplateId ? (
              <div className="text-sm text-muted-foreground">
                Select a round template from the list to edit it.
              </div>
            ) : (
              <>
                <TemplateFields
                  editor={editEditor}
                  setEditor={setEditEditor}
                  packs={packs}
                  shows={shows}
                />

                <Button onClick={saveTemplate} disabled={saveBusy}>
                  {saveBusy ? "Saving…" : "Save changes"}
                </Button>

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
          </CardContent>
        </Card>
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
  return (
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

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-sm font-medium">Behaviour</span>
          <select
            value={editor.behaviourType}
            onChange={(event) =>
              setEditor((current) => ({
                ...current,
                behaviourType: event.target.value as RoundTemplateBehaviourType,
                jokerEligible: event.target.value === "quickfire" ? false : current.jokerEligible,
                mediaType: event.target.value === "quickfire" && current.mediaType === "audio" ? "" : current.mediaType,
                defaultAnswerSeconds:
                  current.defaultAnswerSeconds.trim() === ""
                    ? current.defaultAnswerSeconds
                    : String(getDefaultAnswerSecondsForBehaviour(event.target.value as RoundTemplateBehaviourType)),
                defaultRoundReviewSeconds:
                  current.defaultRoundReviewSeconds.trim() === ""
                    ? current.defaultRoundReviewSeconds
                    : String(getDefaultRoundReviewSecondsForBehaviour(event.target.value as RoundTemplateBehaviourType)),
              }))
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

      <div className="grid gap-3 md:grid-cols-1">
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
      </div>

      {editor.behaviourType === "quickfire" ? (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Quickfire allows MCQ questions only. Audio is allowed when media_duration_ms is set and the clip is 5 seconds or shorter.
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="text-sm font-medium">Default packs</div>
        <div className="mt-1 text-xs text-muted-foreground">
          These are saved with the template and can later prefill pack choices.
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {packs.map((pack) => {
            const checked = editor.defaultPackIds.includes(pack.id)
            return (
              <label key={pack.id} className="flex items-start gap-2 text-sm">
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

      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="text-sm font-medium">Selection rules</div>
        <div className="mt-1 text-xs text-muted-foreground">
          v1 supports one value per rule type. More complex combinations can come later.
        </div>

        <div className="mt-3 grid gap-3">
          <label className="grid gap-1">
            <span className="text-sm font-medium">media_type</span>
            <select
              value={editor.mediaType}
              onChange={(event) => setEditor((current) => ({ ...current, mediaType: event.target.value }))}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
            >
              {MEDIA_TYPE_OPTIONS.map((option) => (
                <option key={option.value || "blank"} value={option.value} disabled={option.value === "audio" && editor.behaviourType === "quickfire"}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-medium">prompt_target</span>
            <select
              value={editor.promptTarget}
              onChange={(event) => setEditor((current) => ({ ...current, promptTarget: event.target.value }))}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
            >
              {PROMPT_TARGET_OPTIONS.map((option) => (
                <option key={option.value || "blank"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-medium">clue_source</span>
            <select
              value={editor.clueSource}
              onChange={(event) => setEditor((current) => ({ ...current, clueSource: event.target.value }))}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
            >
              {CLUE_SOURCE_OPTIONS.map((option) => (
                <option key={option.value || "blank"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-medium">primary_show_key</span>
            <select
              value={editor.primaryShowKey}
              onChange={(event) => setEditor((current) => ({ ...current, primaryShowKey: event.target.value }))}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="">No filter</option>
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
              value={editor.audioClipType}
              onChange={(event) => setEditor((current) => ({ ...current, audioClipType: event.target.value }))}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
              disabled={editor.mediaType !== "audio"}
            >
              {AUDIO_CLIP_TYPE_OPTIONS.map((option) => (
                <option key={option.value || "blank"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
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
