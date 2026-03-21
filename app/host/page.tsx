"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import QRTile from "@/components/ui/QRTile"

import { supabase } from "@/lib/supabaseClient"
import { randomTeamName } from "@/lib/teamNameSuggestions"
import { firstRuleValue, type RoundTemplateRow } from "@/lib/roundTemplates"
import { getDefaultAnswerSecondsForBehaviour, getDefaultRoundReviewSecondsForBehaviour } from "@/lib/roomRoundPlan"

import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import HostJoinedTeamsPanel from "@/components/HostJoinedTeamsPanel"
import PageShell from "@/components/PageShell"

type PackRow = {
  id: string
  display_name: string
  round_type: string
  sort_order: number | null
  is_active: boolean | null
}

type ShowRow = {
  show_key: string
  display_name: string
  is_active: boolean | null
}

type SelectionStrategy = "all_packs" | "per_pack"
type RoundFilter =
  | "mixed"
  | "no_audio"
  | "no_image"
  | "audio_only"
  | "picture_only"
  | "audio_and_image"

type AudioMode = "display" | "phones" | "both"
type GameMode = "teams" | "solo"
type BuildMode = "manual_rounds" | "quick_random" | "legacy_pack_mode"
type SetupMode = "simple" | "advanced"
type SimplePresetId = "classic" | "balanced" | "quickfire_mix"
type RoundBehaviourType = "standard" | "quickfire"
type RoundSourceMode = "selected_packs" | "specific_packs" | "all_questions"
type RoomState = any

type RoundTemplatesResponse = {
  ok?: boolean
  templates?: RoundTemplateRow[]
}

type FeasibilityExplanation = {
  tone: "ok" | "warning" | "error"
  summary: string
  detail: string | null
  fallback: string | null
}

type FeasibilityRoundResult = {
  id: string
  name: string
  requestedCount: number
  eligibleCount: number
  assignedCount: number
  shortfall: number
  feasible: boolean
  setupError: string | null
  behaviourType: RoundBehaviourType
  sourceMode: RoundSourceMode
  notes: string[]
  explanation: FeasibilityExplanation
}

type FeasibilitySetResult = {
  rounds: FeasibilityRoundResult[]
  summary: {
    requestedTotal: number
    unionEligibleQuestionCount: number
    assignedTotal: number
    shortfallTotal: number
    allFeasible: boolean
    explanation: FeasibilityExplanation
  }
}

type FeasibilityResponse = {
  ok?: boolean
  candidateCount?: number
  scopePackCount?: number
  manual?: FeasibilitySetResult | null
  templates?: FeasibilitySetResult | null
  error?: string
}

type ManualRoundDraft = {
  id: string
  name: string
  questionCountStr: string
  behaviourType: RoundBehaviourType
  jokerEligible: boolean
  countsTowardsScore: boolean
  sourceMode: RoundSourceMode
  packIds: string[]
  mediaType: "" | "text" | "audio" | "image"
  promptTarget: string
  clueSource: string
  primaryShowKey: string
  audioClipType: string
  useTimingOverride: boolean
  answerSecondsStr: string
  roundReviewSecondsStr: string
}

const LAST_HOST_CODE_KEY = "mtq_last_host_code"

const PROMPT_TARGET_OPTIONS = [
  { value: "", label: "Any prompt target" },
  { value: "show_title", label: "show_title" },
  { value: "song_title", label: "song_title" },
  { value: "performer_name", label: "performer_name" },
  { value: "character_name", label: "character_name" },
  { value: "creative_name", label: "creative_name" },
  { value: "fact_value", label: "fact_value" },
]

const ROUND_BEHAVIOUR_OPTIONS: Array<{ value: RoundBehaviourType; label: string }> = [
  { value: "standard", label: "Standard" },
  { value: "quickfire", label: "Quickfire" },
]

const AUDIO_CLIP_TYPE_OPTIONS = [
  { value: "", label: "Any audio clip type" },
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
  { value: "", label: "Any clue source" },
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

const SIMPLE_PRESET_OPTIONS: Array<{
  value: SimplePresetId
  label: string
  description: string
}> = [
  {
    value: "classic",
    label: "Classic quiz",
    description: "Keeps the game in the standard question flow when possible.",
  },
  {
    value: "balanced",
    label: "Balanced mix",
    description: "Mostly standard rounds, with a little Quickfire when ready templates support it.",
  },
  {
    value: "quickfire_mix",
    label: "Fast mix",
    description: "Brings in more Quickfire rounds while keeping at least one standard round when possible.",
  },
]

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function parseIntOr(value: string, fallback: number) {
  const v = value.trim()
  if (v === "") return fallback
  const n = Number(v)
  return Number.isFinite(n) ? Math.floor(n) : fallback
}

function cleanRoomCode(input: string) {
  return String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12)
}

function defaultRoundName(i: number) {
  return `Round ${i + 1}`
}

function makeRoundId() {
  return `round_${Math.random().toString(36).slice(2, 10)}`
}

function normaliseManualRoundDraft(draft: ManualRoundDraft): ManualRoundDraft {
  const behaviourType = draft.behaviourType === "quickfire" ? "quickfire" : "standard"
  return {
    ...draft,
    behaviourType,
    jokerEligible: behaviourType === "quickfire" ? false : draft.jokerEligible,
  }
}

function makeManualRound(index: number): ManualRoundDraft {
  return normaliseManualRoundDraft({
    id: makeRoundId(),
    name: defaultRoundName(index),
    questionCountStr: "5",
    behaviourType: "standard",
    jokerEligible: true,
    countsTowardsScore: true,
    sourceMode: "selected_packs",
    packIds: [],
    mediaType: "",
    promptTarget: "",
    clueSource: "",
    primaryShowKey: "",
    audioClipType: "",
    useTimingOverride: false,
    answerSecondsStr: "",
    roundReviewSecondsStr: "",
  })
}

function buildSelectionRulesFromDraft(round: ManualRoundDraft) {
  return {
    mediaTypes: round.mediaType ? [round.mediaType] : [],
    promptTargets: round.promptTarget ? [round.promptTarget] : [],
    clueSources: round.clueSource ? [round.clueSource] : [],
    primaryShowKeys: round.primaryShowKey ? [round.primaryShowKey] : [],
    audioClipTypes: round.audioClipType ? [round.audioClipType] : [],
  }
}

function serialiseManualRoundDraft(round: ManualRoundDraft, index: number) {
  return {
    id: round.id,
    name: round.name.trim() || defaultRoundName(index),
    questionCount: clampInt(parseIntOr(round.questionCountStr, 0), 1, 200),
    behaviourType: round.behaviourType,
    jokerEligible: round.behaviourType === "quickfire" ? false : round.jokerEligible,
    countsTowardsScore: round.countsTowardsScore,
    sourceMode: round.sourceMode,
    packIds: round.packIds,
    selectionRules: buildSelectionRulesFromDraft(round),
    answerSeconds: getManualRoundAnswerSeconds(round),
    roundReviewSeconds: getManualRoundReviewSeconds(round),
  }
}

function normaliseTemplateTiming(raw: unknown, fallback: number) {
  const value = Math.floor(Number(raw ?? fallback))
  if (!Number.isFinite(value) || value < 0) return fallback
  return clampInt(value, 0, 120)
}

function serialiseTemplateAsRound(template: RoundTemplateRow, index: number) {
  const mediaType = firstRuleValue(template.selection_rules, "mediaTypes")
  const promptTarget = firstRuleValue(template.selection_rules, "promptTargets")
  const clueSource = firstRuleValue(template.selection_rules, "clueSources")
  const primaryShowKey = firstRuleValue(template.selection_rules, "primaryShowKeys")
  const audioClipType = firstRuleValue(template.selection_rules, "audioClipTypes")
  const defaultPackIds = Array.isArray(template.default_pack_ids)
    ? template.default_pack_ids.map((value) => String(value ?? "").trim()).filter(Boolean)
    : []
  const behaviourType: RoundBehaviourType = String(template.behaviour_type ?? "standard") === "quickfire" ? "quickfire" : "standard"
  const sourceMode: RoundSourceMode =
    String(template.source_mode ?? "selected_packs") === "specific_packs"
      ? "specific_packs"
      : String(template.source_mode ?? "selected_packs") === "all_questions"
        ? "all_questions"
        : "selected_packs"

  return {
    id: String(template.id ?? `template_${index + 1}`),
    name: String(template.name ?? "").trim() || defaultRoundName(index),
    questionCount: Math.max(1, Number(template.default_question_count ?? 5) || 5),
    behaviourType,
    jokerEligible: behaviourType === "quickfire" ? false : Boolean(template.joker_eligible ?? true),
    countsTowardsScore: Boolean(template.counts_towards_score ?? true),
    sourceMode,
    packIds: sourceMode === "specific_packs" ? defaultPackIds : [],
    selectionRules: {
      mediaTypes: mediaType ? [mediaType as "text" | "audio" | "image"] : [],
      promptTargets: promptTarget ? [promptTarget] : [],
      clueSources: clueSource ? [clueSource] : [],
      primaryShowKeys: primaryShowKey ? [primaryShowKey] : [],
      audioClipTypes: audioClipType ? [audioClipType] : [],
    },
    answerSeconds: normaliseTemplateTiming(
      template.default_answer_seconds,
      getDefaultAnswerSecondsForBehaviour(behaviourType)
    ),
    roundReviewSeconds: normaliseTemplateTiming(
      template.default_round_review_seconds,
      getDefaultRoundReviewSecondsForBehaviour(behaviourType)
    ),
  }
}

function getSimplePresetQuickfireTarget(preset: SimplePresetId, roundCount: number) {
  if (preset === "classic") return 0
  if (preset === "balanced") {
    if (roundCount >= 5) return 2
    if (roundCount >= 3) return 1
    return 0
  }
  if (roundCount <= 1) return 0
  return Math.min(roundCount - 1, Math.max(1, Math.floor(roundCount / 2)))
}

function sortTemplatesForSimplePlan(templates: RoundTemplateRow[]) {
  return [...templates].sort((a, b) => {
    const sortDiff = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
    if (sortDiff !== 0) return sortDiff
    return String(a.name ?? "").localeCompare(String(b.name ?? ""))
  })
}

function orderSimplePlanTemplates(params: {
  preset: SimplePresetId
  standardTemplates: RoundTemplateRow[]
  quickfireTemplates: RoundTemplateRow[]
}) {
  const standardTemplates = [...params.standardTemplates]
  const quickfireTemplates = [...params.quickfireTemplates]
  const ordered: RoundTemplateRow[] = []

  const pushStandard = () => {
    const next = standardTemplates.shift()
    if (next) ordered.push(next)
  }

  const pushQuickfire = () => {
    const next = quickfireTemplates.shift()
    if (next) ordered.push(next)
  }

  if (params.preset === "quickfire_mix") {
    if (standardTemplates.length) pushStandard()
    while (standardTemplates.length || quickfireTemplates.length) {
      if (quickfireTemplates.length) pushQuickfire()
      if (standardTemplates.length) pushStandard()
    }
    return ordered
  }

  if (params.preset === "balanced") {
    while (standardTemplates.length || quickfireTemplates.length) {
      if (standardTemplates.length) pushStandard()
      if (standardTemplates.length) pushStandard()
      if (quickfireTemplates.length) pushQuickfire()
    }
    return ordered
  }

  while (standardTemplates.length) pushStandard()
  while (quickfireTemplates.length) pushQuickfire()
  return ordered
}

function buildSimpleTemplatePlan(params: {
  templates: RoundTemplateRow[]
  feasibilityById: Map<string, FeasibilityRoundResult>
  roundCount: number
  preset: SimplePresetId
}) {
  const roundCount = clampInt(params.roundCount, 1, 20)
  const feasibleTemplates = sortTemplatesForSimplePlan(params.templates).filter((template) => {
    return params.feasibilityById.get(template.id)?.feasible
  })

  const standardTemplates = feasibleTemplates.filter((template) => template.behaviour_type !== "quickfire")
  const quickfireTemplates = feasibleTemplates.filter((template) => template.behaviour_type === "quickfire")

  if (feasibleTemplates.length === 0) {
    return {
      rounds: [],
      notes: [],
      error: "No ready round templates match the current pack choice.",
      availableTemplateCount: 0,
      availableStandardCount: 0,
      availableQuickfireCount: 0,
      standardCount: 0,
      quickfireCount: 0,
      jokerEligibleCount: 0,
    }
  }

  if (feasibleTemplates.length < roundCount) {
    return {
      rounds: [],
      notes: [],
      error: `Only ${feasibleTemplates.length} ready template${feasibleTemplates.length === 1 ? " is" : "s are"} available for ${roundCount} rounds.`,
      availableTemplateCount: feasibleTemplates.length,
      availableStandardCount: standardTemplates.length,
      availableQuickfireCount: quickfireTemplates.length,
      standardCount: 0,
      quickfireCount: 0,
      jokerEligibleCount: 0,
    }
  }

  const desiredQuickfireCount = getSimplePresetQuickfireTarget(params.preset, roundCount)
  let quickfireCount = Math.min(desiredQuickfireCount, quickfireTemplates.length)
  let standardCount = Math.min(roundCount - quickfireCount, standardTemplates.length)

  if (standardCount + quickfireCount < roundCount) {
    const missing = roundCount - (standardCount + quickfireCount)
    quickfireCount += Math.min(missing, quickfireTemplates.length - quickfireCount)
  }

  if (standardCount + quickfireCount < roundCount) {
    return {
      rounds: [],
      notes: [],
      error: "The current ready templates cannot fill that game plan.",
      availableTemplateCount: feasibleTemplates.length,
      availableStandardCount: standardTemplates.length,
      availableQuickfireCount: quickfireTemplates.length,
      standardCount: 0,
      quickfireCount: 0,
      jokerEligibleCount: 0,
    }
  }

  const desiredStandardCount = roundCount - desiredQuickfireCount
  const notes: string[] = []

  if (desiredQuickfireCount > 0 && quickfireCount === 0) {
    notes.push("No ready Quickfire templates were found for this pack choice, so this game falls back to standard rounds.")
  } else if (quickfireCount < desiredQuickfireCount) {
    notes.push(`Only ${quickfireTemplates.length} ready Quickfire template${quickfireTemplates.length === 1 ? " was" : "s were"} available, so the game uses fewer Quickfire rounds than the preset prefers.`)
  }

  if (standardCount < desiredStandardCount) {
    notes.push(`Only ${standardTemplates.length} ready standard template${standardTemplates.length === 1 ? " was" : "s were"} available, so extra Quickfire rounds were used to fill the plan.`)
  }

  const orderedTemplates = orderSimplePlanTemplates({
    preset: params.preset,
    standardTemplates: standardTemplates.slice(0, standardCount),
    quickfireTemplates: quickfireTemplates.slice(0, quickfireCount),
  }).slice(0, roundCount)

  const rounds = orderedTemplates.map((template, index) => serialiseTemplateAsRound(template, index))
  const jokerEligibleCount = rounds.filter((round) => round.jokerEligible).length

  return {
    rounds,
    notes,
    error: null,
    availableTemplateCount: feasibleTemplates.length,
    availableStandardCount: standardTemplates.length,
    availableQuickfireCount: quickfireTemplates.length,
    standardCount,
    quickfireCount,
    jokerEligibleCount,
  }
}

function feasibilityTone(result: FeasibilityRoundResult) {
  return result.explanation?.tone ?? (result.setupError || result.shortfall > 0 ? "error" : "ok")
}

function roundBehaviourLabel(behaviourType: RoundBehaviourType) {
  return behaviourType === "quickfire" ? "Quickfire" : "Standard"
}

function roundBehaviourBadgeClass(behaviourType: RoundBehaviourType) {
  return behaviourType === "quickfire"
    ? "border-violet-500/40 bg-violet-600/10 text-violet-200"
    : "border-emerald-500/40 bg-emerald-600/10 text-emerald-200"
}

function roundBehaviourSummary(behaviourType: RoundBehaviourType) {
  if (behaviourType === "quickfire") {
    return "Fast answers, no Joker, no reveal after each question, and the fastest correct player gets a bonus point. Quickfire audio is allowed only when the clip is 5 seconds or shorter."
  }

  return "Classic question flow with the normal reveal after each question. Joker can be enabled if you want it."
}

function roundBehaviourTimingText(behaviourType: RoundBehaviourType) {
  return `${getDefaultAnswerSecondsForBehaviour(behaviourType)}s answer window, ${getDefaultRoundReviewSecondsForBehaviour(behaviourType)}s round review`
}

function getManualRoundAnswerSeconds(round: ManualRoundDraft) {
  if (!round.useTimingOverride) return getDefaultAnswerSecondsForBehaviour(round.behaviourType)
  return clampInt(parseIntOr(round.answerSecondsStr, getDefaultAnswerSecondsForBehaviour(round.behaviourType)), 0, 120)
}

function getManualRoundReviewSeconds(round: ManualRoundDraft) {
  if (!round.useTimingOverride) return getDefaultRoundReviewSecondsForBehaviour(round.behaviourType)
  return clampInt(parseIntOr(round.roundReviewSecondsStr, getDefaultRoundReviewSecondsForBehaviour(round.behaviourType)), 0, 120)
}

function getManualRoundTimingSummary(round: ManualRoundDraft) {
  const answerSeconds = getManualRoundAnswerSeconds(round)
  const roundReviewSeconds = getManualRoundReviewSeconds(round)
  return `${answerSeconds}s answer window, ${roundReviewSeconds}s round review`
}

export default function HostPage() {
  const [packs, setPacks] = useState<PackRow[]>([])
  const [shows, setShows] = useState<ShowRow[]>([])
  const [templates, setTemplates] = useState<RoundTemplateRow[]>([])
  const [packsLoading, setPacksLoading] = useState(true)
  const [packsError, setPacksError] = useState<string | null>(null)

  const [setupMode, setSetupMode] = useState<SetupMode>("simple")
  const [advancedUnlocked, setAdvancedUnlocked] = useState(false)
  const [simplePreset, setSimplePreset] = useState<SimplePresetId>("balanced")
  const [buildMode, setBuildMode] = useState<BuildMode>("manual_rounds")
  const [selectPacks, setSelectPacks] = useState(false)
  const [selectedPacks, setSelectedPacks] = useState<Record<string, boolean>>({})
  const [selectionStrategy, setSelectionStrategy] = useState<SelectionStrategy>("all_packs")
  const [roundFilter, setRoundFilter] = useState<RoundFilter>("mixed")
  const [audioMode, setAudioMode] = useState<AudioMode>("display")

  const [totalQuestionsStr, setTotalQuestionsStr] = useState("20")
  const [answerSecondsStr, setAnswerSecondsStr] = useState("20")
  const [roundReviewSecondsStr, setRoundReviewSecondsStr] = useState("30")
  const [untimedAnswers, setUntimedAnswers] = useState(false)

  const [roundCountStr, setRoundCountStr] = useState("4")
  const [roundNames, setRoundNames] = useState<string[]>(["Round 1", "Round 2", "Round 3", "Round 4"])

  const [manualRounds, setManualRounds] = useState<ManualRoundDraft[]>([
    makeManualRound(0),
    makeManualRound(1),
    makeManualRound(2),
    makeManualRound(3),
  ])
  const [templateToAddId, setTemplateToAddId] = useState("")
  const [quickRandomUseTemplates, setQuickRandomUseTemplates] = useState(true)
  const [quickRandomTemplateIds, setQuickRandomTemplateIds] = useState<string[]>([])

  const [gameMode, setGameMode] = useState<GameMode>("teams")
  const [teamNames, setTeamNames] = useState<string[]>(() => {
    const first = randomTeamName()
    const second = randomTeamName([first])
    return [first, second]
  })

  const [perPackCounts, setPerPackCounts] = useState<Record<string, string>>({})

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [feasibilityBusy, setFeasibilityBusy] = useState(false)
  const [feasibilityError, setFeasibilityError] = useState<string | null>(null)
  const [manualFeasibility, setManualFeasibility] = useState<FeasibilitySetResult | null>(null)
  const [templateFeasibility, setTemplateFeasibility] = useState<FeasibilitySetResult | null>(null)
  const [simpleFeasibilityBusy, setSimpleFeasibilityBusy] = useState(false)
  const [simpleFeasibilityError, setSimpleFeasibilityError] = useState<string | null>(null)
  const [simpleTemplateFeasibility, setSimpleTemplateFeasibility] = useState<FeasibilitySetResult | null>(null)

  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [roomPhase, setRoomPhase] = useState("lobby")
  const [roomStage, setRoomStage] = useState("lobby")

  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [startOk, setStartOk] = useState<string | null>(null)

  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetOk, setResetOk] = useState<string | null>(null)

  const [forcingClose, setForcingClose] = useState(false)
  const [forceCloseError, setForceCloseError] = useState<string | null>(null)

  const [rehostCode, setRehostCode] = useState("")
  const [rehostBusy, setRehostBusy] = useState(false)
  const [rehostError, setRehostError] = useState<string | null>(null)

  const advancingRef = useRef(false)

  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const joinUrl = roomCode ? `${origin}/join?code=${roomCode}` : ""
  const joinPageUrl = roomCode ? `/join?code=${roomCode}` : ""
  const displayUrl = roomCode ? `/display/${roomCode}` : ""

  useEffect(() => {
    const raw = clampInt(parseIntOr(roundCountStr, 4), 1, 20)
    setRoundNames((prev) => {
      let next = [...prev]
      if (next.length < raw) {
        for (let i = next.length; i < raw; i++) next.push(defaultRoundName(i))
      }
      if (next.length > raw) next = next.slice(0, raw)
      next = next.map((n, i) => (String(n ?? "").trim() ? n : defaultRoundName(i)))
      return next
    })
  }, [roundCountStr])

  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_HOST_CODE_KEY)
      if (last) setRehostCode(cleanRoomCode(last))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setPacksLoading(true)
      setPacksError(null)

      const [packsRes, showsRes, templatesRes] = await Promise.all([
        supabase
          .from("packs")
          .select("id, display_name, round_type, sort_order, is_active")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase.from("shows").select("show_key, display_name, is_active").eq("is_active", true).order("display_name"),
        fetch("/api/round-templates", { cache: "no-store" }).then(async (res) => {
          const json = (await res.json().catch(() => ({}))) as RoundTemplatesResponse
          return res.ok ? (json.templates ?? []) : []
        }).catch(() => [] as RoundTemplateRow[]),
      ])

      if (cancelled) return

      if (packsRes.error) {
        setPacksError(packsRes.error.message)
        setPacks([])
        setPacksLoading(false)
        return
      }

      if (showsRes.error) {
        setPacksError(showsRes.error.message)
        setShows([])
        setPacks((packsRes.data ?? []) as PackRow[])
        setTemplates(templatesRes)
        setPacksLoading(false)
        return
      }

      setPacks((packsRes.data ?? []) as PackRow[])
      setShows((showsRes.data ?? []) as ShowRow[])
      setTemplates(templatesRes)
      setPacksLoading(false)
    }

    loadData()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!packs.length) return

    setSelectedPacks((prev) => {
      const next = { ...prev }
      for (const p of packs) {
        if (next[p.id] === undefined) next[p.id] = false
      }
      return next
    })

    setPerPackCounts((prev) => {
      const next = { ...prev }
      for (const p of packs) {
        if (next[p.id] === undefined) next[p.id] = ""
      }
      return next
    })
  }, [packs])


  useEffect(() => {
    if (!templates.length) {
      setTemplateToAddId("")
      return
    }

    setTemplateToAddId((current) => {
      if (current && templates.some((template) => template.id === current)) return current
      return templates[0]?.id ?? ""
    })
  }, [templates])

  useEffect(() => {
    if (!templates.length) {
      setQuickRandomTemplateIds([])
      return
    }

    setQuickRandomTemplateIds((current) => {
      const valid = current.filter((id) => templates.some((template) => template.id === id))
      return valid.length ? valid : templates.map((template) => template.id)
    })
  }, [templates])

  useEffect(() => {
    if (!roomCode) return

    let cancelled = false

    async function tick() {
      try {
        const res = await fetch(`/api/room/state?code=${roomCode}`, { cache: "no-store" })
        const data: RoomState = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok) {
          setRoomState(data)
          setRoomPhase(String(data?.phase ?? "lobby"))
          setRoomStage(String(data?.stage ?? "lobby"))
        }
      } catch {
        // ignore
      }
    }

    tick()
    const id = setInterval(tick, 1000)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [roomCode])

  useEffect(() => {
    if (!roomCode) return
    if (roomPhase !== "running") return
    if (roomStage !== "needs_advance") return
    if (advancingRef.current) return

    let cancelled = false
    advancingRef.current = true

    async function autoAdvance() {
      try {
        await fetch("/api/room/advance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: roomCode }),
        })
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          window.setTimeout(() => {
            advancingRef.current = false
          }, 300)
        } else {
          advancingRef.current = false
        }
      }
    }

    autoAdvance()

    return () => {
      cancelled = true
    }
  }, [roomCode, roomPhase, roomStage])

  function rememberHostCode(code: string) {
    try {
      localStorage.setItem(LAST_HOST_CODE_KEY, code)
    } catch {
      // ignore
    }
  }

  function openInNewWindow(url: string) {
    if (!url) return
    const w = window.open(url, "_blank", "noopener,noreferrer")
    if (w) w.opener = null
  }

  async function copyJoinLink() {
    if (!joinUrl) return
    try {
      await navigator.clipboard.writeText(joinUrl)
    } catch {
      // ignore
    }
  }

  function setAllSelected(value: boolean) {
    const next: Record<string, boolean> = {}
    for (const p of packs) next[p.id] = value
    setSelectedPacks(next)
  }

  function togglePack(id: string) {
    setSelectedPacks((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function selectedPackIds() {
    return packs.filter((p) => selectedPacks[p.id]).map((p) => p.id)
  }

  function buildLegacyRoundsPayload(packIds: string[]) {
    return packIds
      .map((packId) => {
        const raw = perPackCounts[packId] ?? ""
        const count = clampInt(parseIntOr(raw, 0), 0, 9999)
        return { packId, count }
      })
      .filter((round) => round.count > 0)
  }

  function addManualRound() {
    setManualRounds((prev) => [...prev, makeManualRound(prev.length)])
  }

  function removeManualRound(id: string) {
    setManualRounds((prev) => prev.filter((round) => round.id !== id))
  }

  function updateManualRound(id: string, changes: Partial<ManualRoundDraft>) {
    setManualRounds((prev) =>
      prev.map((round) => (round.id === id ? normaliseManualRoundDraft({ ...round, ...changes }) : round))
    )
  }

  function toggleManualRoundPack(roundId: string, packId: string) {
    setManualRounds((prev) =>
      prev.map((round) => {
        if (round.id !== roundId) return round
        const nextPackIds = round.packIds.includes(packId)
          ? round.packIds.filter((id) => id !== packId)
          : [...round.packIds, packId]
        return { ...round, packIds: nextPackIds }
      })
    )
  }

  function addManualRoundFromTemplate(template: RoundTemplateRow) {
    const mediaType = firstRuleValue(template.selection_rules, "mediaTypes")
    const promptTarget = firstRuleValue(template.selection_rules, "promptTargets")
    const clueSource = firstRuleValue(template.selection_rules, "clueSources")
    const primaryShowKey = firstRuleValue(template.selection_rules, "primaryShowKeys")
    const audioClipType = firstRuleValue(template.selection_rules, "audioClipTypes")
    const defaultPackIds = Array.isArray(template.default_pack_ids)
      ? template.default_pack_ids.map((value) => String(value ?? "").trim()).filter(Boolean)
      : []

    const sourceMode = String(template.source_mode ?? "selected_packs") as RoundSourceMode
    const behaviourType = String(template.behaviour_type ?? "standard") === "quickfire" ? "quickfire" : "standard"

    if (sourceMode === "selected_packs" && defaultPackIds.length) {
      setSelectedPacks((prev) => {
        const next = { ...prev }
        for (const packId of defaultPackIds) next[packId] = true
        return next
      })
      setSelectPacks(true)
    }

    setManualRounds((prev) => [
      ...prev,
      normaliseManualRoundDraft({
        id: makeRoundId(),
        name: String(template.name ?? "").trim() || defaultRoundName(prev.length),
        questionCountStr: String(Math.max(1, Number(template.default_question_count ?? 5))),
        behaviourType,
        jokerEligible: Boolean(template.joker_eligible ?? true),
        countsTowardsScore: Boolean(template.counts_towards_score ?? true),
        sourceMode,
        packIds: sourceMode === "specific_packs" ? defaultPackIds : [],
        mediaType: mediaType === "text" || mediaType === "audio" || mediaType === "image" ? mediaType : "",
        promptTarget,
        clueSource,
        primaryShowKey,
        audioClipType,
        useTimingOverride: false,
        answerSecondsStr: "",
        roundReviewSecondsStr: "",
      }),
    ])
  }

  const selectedTemplateToAdd = useMemo(
    () => templates.find((template) => template.id === templateToAddId) ?? null,
    [templates, templateToAddId]
  )

  const selectedQuickRandomTemplates = useMemo(
    () => templates.filter((template) => quickRandomTemplateIds.includes(template.id)),
    [templates, quickRandomTemplateIds]
  )

  const simpleSelectedPackIds = useMemo(() => {
    if (!selectPacks) return packs.map((pack) => pack.id)
    return selectedPackIds()
  }, [packs, selectPacks, selectedPacks])

  const manualRoundsPayload = useMemo(
    () => manualRounds.map((round, index) => serialiseManualRoundDraft(round, index)),
    [manualRounds]
  )

  const templateRoundsPayload = useMemo(
    () => selectedQuickRandomTemplates.map((template, index) => serialiseTemplateAsRound(template, index)),
    [selectedQuickRandomTemplates]
  )

  const allTemplateRoundsPayload = useMemo(
    () => templates.map((template, index) => serialiseTemplateAsRound(template, index)),
    [templates]
  )

  const quickRandomTemplatesQuestionTotal = useMemo(() => {
    return selectedQuickRandomTemplates.reduce(
      (sum, template) => sum + Math.max(1, Number(template.default_question_count ?? 0) || 0),
      0
    )
  }, [selectedQuickRandomTemplates])

  function toggleQuickRandomTemplate(templateId: string) {
    setQuickRandomTemplateIds((prev) =>
      prev.includes(templateId) ? prev.filter((id) => id !== templateId) : [...prev, templateId]
    )
  }

  function setAllQuickRandomTemplates(value: boolean) {
    setQuickRandomTemplateIds(value ? templates.map((template) => template.id) : [])
  }

  const manualRoundsTotal = useMemo(() => {
    return manualRounds.reduce((sum, round) => sum + clampInt(parseIntOr(round.questionCountStr, 0), 0, 200), 0)
  }, [manualRounds])

  const jokerEligibleCount = useMemo(() => manualRounds.filter((round) => round.jokerEligible).length, [manualRounds])

  const selectedPackIdsForManual = useMemo(() => selectedPackIds(), [packs, selectedPacks])

  const selectedPackIdsForQuickRandom = useMemo(() => {
    if (!selectPacks) return packs.map((pack) => pack.id)
    return selectedPackIds()
  }, [packs, selectPacks, selectedPacks])

  useEffect(() => {
    if (setupMode !== "simple") {
      setSimpleFeasibilityBusy(false)
      setSimpleFeasibilityError(null)
      setSimpleTemplateFeasibility(null)
      return
    }

    if (roomCode) return
    if (packsLoading) return
    if (!templates.length) {
      setSimpleFeasibilityBusy(false)
      setSimpleFeasibilityError(null)
      setSimpleTemplateFeasibility(null)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        setSimpleFeasibilityBusy(true)
        setSimpleFeasibilityError(null)

        const response = await fetch("/api/room/feasibility", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedPackIds: simpleSelectedPackIds,
            manualRounds: [],
            templateRounds: allTemplateRoundsPayload,
          }),
        })

        const json = (await response.json().catch(() => ({}))) as FeasibilityResponse
        if (cancelled) return

        if (!response.ok) {
          setSimpleFeasibilityError(json.error ?? "Could not check ready templates.")
          setSimpleTemplateFeasibility(null)
          setSimpleFeasibilityBusy(false)
          return
        }

        setSimpleTemplateFeasibility(json.templates ?? null)
        setSimpleFeasibilityBusy(false)
      } catch (error: any) {
        if (cancelled) return
        setSimpleFeasibilityError(error?.message ?? "Could not check ready templates.")
        setSimpleTemplateFeasibility(null)
        setSimpleFeasibilityBusy(false)
      }
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [allTemplateRoundsPayload, packsLoading, roomCode, setupMode, simpleSelectedPackIds, templates.length])

  useEffect(() => {
    if (setupMode !== "advanced") {
      setFeasibilityBusy(false)
      setFeasibilityError(null)
      setManualFeasibility(null)
      setTemplateFeasibility(null)
      return
    }

    if (roomCode) return
    if (packsLoading) return

    const shouldCheckManual = buildMode === "manual_rounds"
    const shouldCheckTemplates = buildMode === "quick_random" && quickRandomUseTemplates

    if (!shouldCheckManual && !shouldCheckTemplates) {
      setFeasibilityBusy(false)
      setFeasibilityError(null)
      setManualFeasibility(null)
      setTemplateFeasibility(null)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        setFeasibilityBusy(true)
        setFeasibilityError(null)

        const response = await fetch("/api/room/feasibility", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedPackIds: shouldCheckManual ? selectedPackIdsForManual : selectedPackIdsForQuickRandom,
            manualRounds: shouldCheckManual ? manualRoundsPayload : [],
            templateRounds: shouldCheckTemplates ? templateRoundsPayload : [],
          }),
        })

        const json = (await response.json().catch(() => ({}))) as FeasibilityResponse
        if (cancelled) return

        if (!response.ok) {
          setFeasibilityError(json.error ?? "Could not check round feasibility.")
          setManualFeasibility(null)
          setTemplateFeasibility(null)
          setFeasibilityBusy(false)
          return
        }

        setManualFeasibility(json.manual ?? null)
        setTemplateFeasibility(json.templates ?? null)
        setFeasibilityBusy(false)
      } catch (error: any) {
        if (cancelled) return
        setFeasibilityError(error?.message ?? "Could not check round feasibility.")
        setManualFeasibility(null)
        setTemplateFeasibility(null)
        setFeasibilityBusy(false)
      }
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    buildMode,
    manualRoundsPayload,
    packsLoading,
    quickRandomUseTemplates,
    roomCode,
    selectedPackIdsForManual,
    selectedPackIdsForQuickRandom,
    setupMode,
    templateRoundsPayload,
  ])

  const manualFeasibilityById = useMemo(() => {
    return new Map((manualFeasibility?.rounds ?? []).map((round) => [round.id, round]))
  }, [manualFeasibility])

  const templateFeasibilityById = useMemo(() => {
    return new Map((templateFeasibility?.rounds ?? []).map((round) => [round.id, round]))
  }, [templateFeasibility])

  const simpleTemplateFeasibilityById = useMemo(() => {
    return new Map((simpleTemplateFeasibility?.rounds ?? []).map((round) => [round.id, round]))
  }, [simpleTemplateFeasibility])

  const simpleRoundCount = clampInt(parseIntOr(roundCountStr, 4), 1, 20)

  const simpleTemplatePlan = useMemo(() => {
    return buildSimpleTemplatePlan({
      templates,
      feasibilityById: simpleTemplateFeasibilityById,
      roundCount: simpleRoundCount,
      preset: simplePreset,
    })
  }, [simplePreset, simpleRoundCount, simpleTemplateFeasibilityById, templates])

  const simpleUnavailableTemplateExamples = useMemo(() => {
    const unavailable = (simpleTemplateFeasibility?.rounds ?? []).filter((round) => !round.feasible)
    if (!unavailable.length) return [] as FeasibilityRoundResult[]

    const preferredBehaviour =
      simplePreset === "classic"
        ? ["standard", "quickfire"]
        : simplePreset === "quickfire_mix"
          ? ["quickfire", "standard"]
          : ["quickfire", "standard"]

    return [...unavailable]
      .sort((a, b) => {
        const behaviourDiff = preferredBehaviour.indexOf(a.behaviourType) - preferredBehaviour.indexOf(b.behaviourType)
        if (behaviourDiff !== 0) return behaviourDiff
        if (a.explanation.tone !== b.explanation.tone) {
          return a.explanation.tone === "error" ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })
      .slice(0, 3)
  }, [simplePreset, simpleTemplateFeasibility])

  const createBlockReason = useMemo(() => {
    if (buildMode === "manual_rounds" && manualFeasibility && !manualFeasibility.summary.allFeasible) {
      return manualFeasibility.summary.explanation.summary
    }

    if (buildMode === "quick_random" && quickRandomUseTemplates && templateFeasibility) {
      const invalidTemplates = templateFeasibility.rounds.filter((round) => !round.feasible)
      if (invalidTemplates.length > 0) {
        return invalidTemplates.length === 1
          ? `${invalidTemplates[0]?.name ?? "Template"}: ${invalidTemplates[0]?.explanation.summary ?? "Not ready yet."}`
          : templateFeasibility.summary.explanation.summary
      }
    }

    return null
  }, [buildMode, manualFeasibility, quickRandomUseTemplates, templateFeasibility])

  const simpleCreateBlockReason = useMemo(() => {
    if (simpleFeasibilityError) return simpleFeasibilityError
    if (selectPacks && simpleSelectedPackIds.length === 0) {
      return "Select at least one pack, or use all active packs."
    }
    return simpleTemplatePlan.error
  }, [selectPacks, simpleFeasibilityError, simpleSelectedPackIds.length, simpleTemplatePlan.error])

  const activeCreateBlockReason = setupMode === "simple" ? simpleCreateBlockReason : createBlockReason

  async function createRoom() {
    setCreating(true)
    setCreateError(null)
    setStartError(null)
    setStartOk(null)
    setResetError(null)
    setResetOk(null)
    setForceCloseError(null)

    try {
      if (activeCreateBlockReason) {
        setCreateError(activeCreateBlockReason)
        setCreating(false)
        return
      }

      const roundReviewSeconds = setupMode === "simple"
        ? getDefaultRoundReviewSecondsForBehaviour("standard")
        : clampInt(parseIntOr(roundReviewSecondsStr, 10), 0, 120)
      const countdownSeconds = roundReviewSeconds
      const answerSeconds = setupMode === "simple"
        ? getDefaultAnswerSecondsForBehaviour("standard")
        : untimedAnswers ? 0 : clampInt(parseIntOr(answerSecondsStr, 20), 5, 120)
      const cleanTeamNames = teamNames.map((t) => t.trim()).filter(Boolean)

      if (gameMode === "teams") {
        if (cleanTeamNames.length < 2) {
          setCreateError("Add at least two team names.")
          setCreating(false)
          return
        }

        const seen = new Set<string>()
        for (const teamName of cleanTeamNames) {
          const key = teamName.toLowerCase()
          if (seen.has(key)) {
            setCreateError("Team names must be unique.")
            setCreating(false)
            return
          }
          seen.add(key)
        }
      }

      let payload: any = {
        buildMode: setupMode === "simple" ? "manual_rounds" : buildMode,
        gameMode,
        teamNames: gameMode === "teams" ? cleanTeamNames : [],
        countdownSeconds,
        answerSeconds,
        audioMode: setupMode === "simple" ? "display" : audioMode,
      }

      if (setupMode === "simple") {
        if (simpleFeasibilityBusy) {
          setCreateError("Still checking which round templates are ready for this pack choice.")
          setCreating(false)
          return
        }

        if (simpleTemplatePlan.rounds.length === 0) {
          setCreateError(simpleTemplatePlan.error ?? "Could not build a simple game plan.")
          setCreating(false)
          return
        }

        payload = {
          ...payload,
          selectedPacks: simpleSelectedPackIds,
          manualRounds: simpleTemplatePlan.rounds,
        }
      } else if (buildMode === "manual_rounds") {
        if (manualRounds.length === 0) {
          setCreateError("Add at least one round.")
          setCreating(false)
          return
        }

        for (const round of manualRoundsPayload) {
          if (round.sourceMode === "selected_packs" && selectedPackIdsForManual.length === 0) {
            setCreateError(`Select at least one pack for rounds that use selected packs.`)
            setCreating(false)
            return
          }
          if (round.sourceMode === "specific_packs" && round.packIds.length === 0) {
            setCreateError(`Each specific-packs round needs at least one pack.`)
            setCreating(false)
            return
          }
        }

        payload = {
          ...payload,
          selectedPacks: selectedPackIdsForManual,
          manualRounds: manualRoundsPayload,
        }
      } else {
        const totalQuestions = clampInt(parseIntOr(totalQuestionsStr, 20), 1, 200)
        let roundCount = clampInt(parseIntOr(roundCountStr, 4), 1, 20)
        if (roundCount > totalQuestions) {
          roundCount = totalQuestions
          setRoundCountStr(String(roundCount))
        }

        const roundNamesToSend = Array.from({ length: roundCount }).map((_, i) => {
          const name = String(roundNames[i] ?? "").trim()
          return name || defaultRoundName(i)
        })

        const usingAllPacks = !selectPacks
        const packIds = usingAllPacks ? packs.map((p) => p.id) : selectedPackIds()

        if (!usingAllPacks && packIds.length === 0) {
          setCreateError("Select at least one pack, or untick Select packs to use all packs.")
          setCreating(false)
          return
        }

        if (buildMode === "legacy_pack_mode") {
          const strategy: SelectionStrategy = usingAllPacks ? "all_packs" : selectionStrategy
          const rounds = strategy === "per_pack" ? buildLegacyRoundsPayload(packIds) : []

          if (!usingAllPacks && strategy === "per_pack" && rounds.length === 0) {
            setCreateError("Add a count for at least one selected pack.")
            setCreating(false)
            return
          }

          payload = {
            ...payload,
            selectionStrategy: strategy,
            roundFilter,
            totalQuestions,
            selectedPacks: packIds,
            rounds,
            roundCount,
            roundNames: roundNamesToSend,
          }
        } else {
          if (quickRandomUseTemplates) {
            if (quickRandomTemplateIds.length === 0) {
              setCreateError("Select at least one round template, or untick Use round templates.")
              setCreating(false)
              return
            }

            if (roundCount > quickRandomTemplateIds.length) {
              setCreateError("Number of rounds cannot be greater than the number of selected templates.")
              setCreating(false)
              return
            }
          }

          payload = {
            ...payload,
            selectionStrategy: "all_packs",
            roundFilter,
            totalQuestions,
            selectedPacks: packIds,
            rounds: [],
            roundCount,
            roundNames: roundNamesToSend,
            quickRandomUseTemplates,
            quickRandomTemplateIds,
          }
        }
      }

      const res = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCreateError(json?.error ?? "Failed to create room")
        setCreating(false)
        return
      }

      const code = cleanRoomCode(String(json?.code ?? ""))
      if (!code) {
        setCreateError("Room created, but no code returned.")
        setCreating(false)
        return
      }

      setRoomCode(code)
      setRoomPhase("lobby")
      setRoomStage("lobby")
      rememberHostCode(code)
    } catch (error: any) {
      setCreateError(error?.message ?? "Failed to create room")
    } finally {
      setCreating(false)
    }
  }

  async function rehostRoom() {
    setRehostBusy(true)
    setRehostError(null)
    setCreateError(null)

    const code = cleanRoomCode(rehostCode)
    if (!code) {
      setRehostError("Enter a room code.")
      setRehostBusy(false)
      return
    }

    try {
      const res = await fetch(`/api/room/state?code=${encodeURIComponent(code)}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRehostError(String(data?.error ?? "Room not found."))
        setRehostBusy(false)
        return
      }
      setRoomCode(code)
      setRoomState(data)
      setRoomPhase(String(data?.phase ?? "lobby"))
      setRoomStage(String(data?.stage ?? "lobby"))
      rememberHostCode(code)
    } catch {
      setRehostError("Could not load that room.")
    } finally {
      setRehostBusy(false)
    }
  }

  async function startGame() {
    if (!roomCode) return
    setStarting(true)
    setStartError(null)
    setStartOk(null)
    try {
      const res = await fetch("/api/room/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStartError(data?.error ?? "Could not start game.")
        return
      }
      setRoomPhase("running")
      setRoomStage("open")
      setStartOk("Game started.\nJoining is now closed.")
    } catch (error: any) {
      setStartError(error?.message ?? "Could not start game.")
    } finally {
      setStarting(false)
    }
  }

  async function resetRoom() {
    if (!roomCode) return
    setResetting(true)
    setResetError(null)
    setResetOk(null)
    setStartError(null)
    setStartOk(null)
    setForceCloseError(null)
    try {
      const res = await fetch("/api/room/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setResetError(data?.error ?? "Reset failed.")
        return
      }
      setRoomPhase("lobby")
      setRoomStage("lobby")
      setResetOk("Room reset.\nTeams kept, scores set to 0, and joining is open again.")
    } catch (error: any) {
      setResetError(error?.message ?? "Reset failed.")
    } finally {
      setResetting(false)
    }
  }

  async function continueGame() {
    if (!roomCode) return
    setForcingClose(true)
    setForceCloseError(null)
    const route = roomStage === "open" ? "/api/room/force-close" : "/api/room/advance"
    try {
      const res = await fetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setForceCloseError(data?.error ?? "Could not move on.")
      }
    } catch {
      setForceCloseError("Could not move on.")
    } finally {
      setForcingClose(false)
    }
  }

  function clearRoom() {
    setRoomCode(null)
    setRoomState(null)
    setRoomPhase("lobby")
    setRoomStage("lobby")
    setStartError(null)
    setStartOk(null)
    setResetError(null)
    setResetOk(null)
    setForceCloseError(null)
  }

  const stagePill = useMemo(() => {
    if (roomPhase === "running") {
      if (roomStage === "countdown") return "Countdown"
      if (roomStage === "open") return "Answering"
      if (roomStage === "wait") return "Waiting"
      if (roomStage === "reveal") return "Reveal"
      if (roomStage === "round_summary") return "End of round"
      if (roomStage === "needs_advance") return "Next question"
      return "Running"
    }
    if (roomPhase === "finished") return "Finished"
    return "Lobby"
  }, [roomPhase, roomStage])

  const hasRoom = Boolean(roomCode)
  const selectedPackCount = packs.filter((p) => selectedPacks[p.id]).length
  const canStart = hasRoom && roomPhase === "lobby" && !starting
  const canContinue =
    hasRoom && roomPhase === "running" && ["open", "round_summary", "needs_advance"].includes(roomStage) && !forcingClose

  const continueLabel =
    roomStage === "open"
      ? forcingClose
        ? "Moving on..."
        : "Reveal answer"
      : roomStage === "round_summary"
        ? forcingClose
          ? "Moving on..."
          : Boolean(roomState?.flow?.isLastQuestionOverall)
            ? "Finish now"
            : "Skip round review"
        : forcingClose
          ? "Moving on..."
          : Boolean(roomState?.flow?.isLastQuestionOverall)
            ? "Finish now"
            : "Next question"

  const startLabel =
    roomPhase === "lobby"
      ? starting
        ? "Starting..."
        : "Start game"
      : roomPhase === "running"
        ? "Game running"
        : "Game finished"

  const roomSummaryText =
    roomPhase === "lobby"
      ? "Players can still join. When you are ready, start the game from the host controls."
      : roomPhase === "running"
        ? "Questions move on automatically between questions. End of round waits for the host or the round review timer."
        : "The game is finished. Reset the room to play again with the same teams."

  const quickfireCount = useMemo(
    () => manualRounds.filter((round) => round.behaviourType === "quickfire").length,
    [manualRounds]
  )

  const manualJokerNote = jokerEligibleCount >= 2
    ? `${jokerEligibleCount} rounds are Joker eligible.`
    : "Joker will be hidden because fewer than two rounds are Joker eligible."

  const simplePackScopeText = !selectPacks
    ? "all active packs"
    : selectedPackCount > 0
      ? `${selectedPackCount} selected pack${selectedPackCount === 1 ? "" : "s"}`
      : "no packs selected yet"

  const simpleJokerSummary = simpleTemplatePlan.jokerEligibleCount >= 2
    ? `Joker available in ${simpleTemplatePlan.jokerEligibleCount} round${simpleTemplatePlan.jokerEligibleCount === 1 ? "" : "s"}`
    : "Joker hidden for this game"

  const simpleTimingSummary = simpleTemplatePlan.quickfireCount > 0
    ? "Standard rounds use 20 second answers and 30 second reviews. Quickfire uses 10 second answers and 45 second round reviews."
    : "Standard rounds use 20 second answers and 30 second round reviews."

  const simpleGameSummaryText = simpleTemplatePlan.rounds.length > 0
    ? `This game will create ${simpleRoundCount} round${simpleRoundCount === 1 ? "" : "s"}: ${simpleTemplatePlan.standardCount} Standard and ${simpleTemplatePlan.quickfireCount} Quickfire, using ${simplePackScopeText}, with display audio and sensible default timings.`
    : "Simple mode will build a game from ready templates as soon as the current pack choice supports it."

  return (
    <PageShell width="full" contentClassName="max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Host</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create a room, share the code, and run the quiz.</p>
        </div>

        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          Back to home
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-6">
          {!hasRoom ? (
            <Card>
              <CardHeader>
                <CardTitle>Create a room</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-border p-3">
                  <div className="text-sm font-semibold text-foreground">Game</div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">Mode</div>
                      <select value={gameMode} onChange={(e) => setGameMode(e.target.value as GameMode)} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                        <option value="teams">Teams</option>
                        <option value="solo">No teams</option>
                      </select>
                      <div className="mt-1 text-xs text-muted-foreground">One phone per person.</div>
                    </div>

                    {gameMode === "teams" ? (
                      <div>
                        <div className="text-sm font-medium text-foreground">Scoring</div>
                        <div className="mt-2 text-sm text-muted-foreground">Total points. If team sizes differ, the scoreboard uses average points per player.</div>
                      </div>
                    ) : (
                      <div className="flex items-end text-sm text-muted-foreground">Players score individually.</div>
                    )}

                    {gameMode === "teams" ? (
                      <div className="flex items-end justify-end">
                        <Button variant="secondary" onClick={() => {
                          setTeamNames((prev) => {
                            const used = new Set(prev.map((x) => x.trim()).filter(Boolean))
                            const nextName = randomTeamName(used)
                            return [...prev, nextName]
                          })
                        }}>
                          Add team
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {gameMode === "teams" ? (
                    <div className="mt-3 space-y-2">
                      <div className="text-sm text-muted-foreground">Teams (players pick one when joining)</div>
                      {teamNames.map((t, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input value={t} onChange={(e) => setTeamNames((prev) => prev.map((x, i) => i === idx ? e.target.value : x))} placeholder="Team name" />
                          <Button variant="ghost" onClick={() => setTeamNames((prev) => prev.filter((_, i) => i !== idx))} disabled={teamNames.length <= 2}>Remove</Button>
                        </div>
                      ))}
                      {teamNames.length <= 2 ? <div className="text-xs text-muted-foreground">Keep at least two teams.</div> : null}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">Setup</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {setupMode === "simple"
                          ? "Quick recommended game using ready round templates and sensible defaults."
                          : "Full round builder with templates, metadata filters, timing overrides, and legacy options."}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={setupMode === "simple" ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => setSetupMode("simple")}
                      >
                        Simple
                      </Button>
                      <Button
                        variant={setupMode === "advanced" ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => {
                          setAdvancedUnlocked(true)
                          setSetupMode("advanced")
                        }}
                      >
                        {advancedUnlocked ? "Advanced" : "Advanced setup"}
                      </Button>
                    </div>
                  </div>
                </div>

                {setupMode === "simple" ? (
                  <>
                    <div className="rounded-2xl border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">Simple game</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Choose a game style and round count. The app builds a real round plan from templates that are currently ready for your pack choice.
                          </div>
                        </div>
                        <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                          {simpleRoundCount} round{simpleRoundCount === 1 ? "" : "s"}
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="text-sm font-medium text-foreground">Rounds</div>
                          <select
                            value={roundCountStr}
                            onChange={(e) => setRoundCountStr(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                          >
                            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
                              <option key={count} value={String(count)}>
                                {count}
                              </option>
                            ))}
                          </select>
                          <div className="mt-1 text-xs text-muted-foreground">Four or five rounds tends to feel best for a normal game.</div>
                        </div>

                        <div>
                          <div className="text-sm font-medium text-foreground">Game style</div>
                          <div className="mt-1 grid gap-2">
                            {SIMPLE_PRESET_OPTIONS.map((preset) => {
                              const selected = simplePreset === preset.value
                              return (
                                <label
                                  key={preset.value}
                                  className={`rounded-xl border p-3 text-sm transition-colors ${selected ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted"}`}
                                >
                                  <div className="flex items-start gap-2">
                                    <input
                                      type="radio"
                                      name="simple-preset"
                                      checked={selected}
                                      onChange={() => setSimplePreset(preset.value)}
                                      className="mt-0.5"
                                    />
                                    <div>
                                      <div className="font-medium text-foreground">{preset.label}</div>
                                      <div className="mt-1 text-xs text-muted-foreground">{preset.description}</div>
                                    </div>
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">Content</div>
                          <div className="mt-1 text-xs text-muted-foreground">Use all active packs, or narrow the game to a smaller pack set.</div>
                        </div>
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={selectPacks}
                            onChange={(e) => setSelectPacks(e.target.checked)}
                          />
                          Choose packs
                        </label>
                      </div>

                      {!selectPacks ? (
                        <div className="mt-3 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
                          Using all active packs.
                        </div>
                      ) : (
                        <div className="mt-3 space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <Button variant="secondary" size="sm" onClick={() => setAllSelected(true)} disabled={!packs.length}>Select all</Button>
                            <Button variant="secondary" size="sm" onClick={() => setAllSelected(false)} disabled={!selectedPackCount}>Clear</Button>
                            <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                              {selectedPackCount} selected
                            </div>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {packs.map((pack) => (
                              <label key={pack.id} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted">
                                <input type="checkbox" checked={Boolean(selectedPacks[pack.id])} onChange={() => togglePack(pack.id)} />
                                <span className="min-w-0 flex-1 truncate">{pack.display_name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">Game summary</div>
                          <div className="mt-1 text-xs text-muted-foreground">This is what Simple mode will create from the current ready templates.</div>
                        </div>
                        <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                          {simpleTemplatePlan.rounds.length > 0 ? "Ready to create" : "Needs changes"}
                        </div>
                      </div>

                      {simpleFeasibilityBusy ? (
                        <div className="mt-3 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">Checking ready templates...</div>
                      ) : simpleFeasibilityError ? (
                        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{simpleFeasibilityError}</div>
                      ) : simpleTemplatePlan.rounds.length > 0 ? (
                        <div className="mt-3 space-y-3">
                          <div className="rounded-xl border border-border bg-card p-3 text-sm text-foreground">{simpleGameSummaryText}</div>
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-xl border border-border bg-card p-3">
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Round mix</div>
                              <div className="mt-1 text-sm font-medium text-foreground">{simpleTemplatePlan.standardCount} Standard, {simpleTemplatePlan.quickfireCount} Quickfire</div>
                            </div>
                            <div className="rounded-xl border border-border bg-card p-3">
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Joker</div>
                              <div className="mt-1 text-sm font-medium text-foreground">{simpleJokerSummary}</div>
                            </div>
                            <div className="rounded-xl border border-border bg-card p-3">
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Packs</div>
                              <div className="mt-1 text-sm font-medium text-foreground">{!selectPacks ? "All active packs" : selectedPackCount > 0 ? `${selectedPackCount} selected` : "Choose pack"}</div>
                            </div>
                            <div className="rounded-xl border border-border bg-card p-3">
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Audio</div>
                              <div className="mt-1 text-sm font-medium text-foreground">Display audio</div>
                            </div>
                          </div>
                          <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">{simpleTimingSummary}</div>
                          {simpleTemplatePlan.notes.length ? (
                            <div className="space-y-2">
                              {simpleTemplatePlan.notes.map((note) => (
                                <div key={note} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                                  {note}
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {simpleUnavailableTemplateExamples.length ? (
                            <div className="space-y-2">
                              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Templates not ready now</div>
                              {simpleUnavailableTemplateExamples.map((template) => (
                                <div key={template.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                                  <div className="font-medium text-foreground">{template.name}</div>
                                  <div className={template.explanation.tone === "error" ? "mt-1 text-red-700 dark:text-red-200" : "mt-1 text-amber-700 dark:text-amber-200"}>
                                    {template.explanation.summary}
                                  </div>
                                  {template.explanation.detail ? (
                                    <div className="mt-1 text-xs text-muted-foreground">{template.explanation.detail}</div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                          {simpleTemplatePlan.error ?? "No simple plan is ready yet."}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">Recommended rounds</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Ready now: {simpleTemplatePlan.availableTemplateCount} template{simpleTemplatePlan.availableTemplateCount === 1 ? "" : "s"}, with {simpleTemplatePlan.availableStandardCount} standard and {simpleTemplatePlan.availableQuickfireCount} Quickfire.
                          </div>
                        </div>
                        <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                          {simpleTemplatePlan.jokerEligibleCount >= 2 ? "Joker ready" : "Joker hidden"}
                        </div>
                      </div>

                      {simpleFeasibilityBusy ? (
                        <div className="mt-3 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">Checking ready templates...</div>
                      ) : simpleFeasibilityError ? (
                        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{simpleFeasibilityError}</div>
                      ) : simpleTemplatePlan.rounds.length > 0 ? (
                        <div className="mt-3 space-y-3">
                          <div className="space-y-2">
                            {simpleTemplatePlan.rounds.map((round, index) => (
                              <div key={round.id} className="rounded-xl border border-border bg-card p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium text-foreground">{index + 1}. {round.name}</span>
                                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${roundBehaviourBadgeClass(round.behaviourType)}`}>
                                    {roundBehaviourLabel(round.behaviourType)}
                                  </span>
                                  {round.jokerEligible ? (
                                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">Joker eligible</span>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {round.questionCount} question{round.questionCount === 1 ? "" : "s"}. {round.answerSeconds}s answer window, {round.roundReviewSeconds}s round review.
                                </div>
                              </div>
                            ))}
                          </div>
                          {simpleTemplatePlan.notes.length ? (
                            <div className="space-y-2">
                              {simpleTemplatePlan.notes.map((note) => (
                                <div key={note} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                                  {note}
                                </div>
                              ))}
                            </div>
                          ) : null}
                          <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
                            Simple mode uses display audio, standard timing defaults, and only templates that are currently feasible for the chosen pack scope.
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                          {simpleTemplatePlan.error ?? "No simple plan is ready yet."}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                <div className="rounded-2xl border border-border p-3">
                  <div className="text-sm font-semibold text-foreground">Build mode</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">Mode</div>
                      <select value={buildMode} onChange={(e) => setBuildMode(e.target.value as BuildMode)} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                        <option value="manual_rounds">Manual rounds</option>
                        <option value="quick_random">Quick random</option>
                        <option value="legacy_pack_mode">Legacy pack mode</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2 text-sm text-muted-foreground">
                      {buildMode === "manual_rounds"
                        ? "Create each round directly. Packs stay as sources, and metadata decides eligibility."
                        : buildMode === "quick_random"
                          ? "Choose packs and either use saved round templates or let the app create a simple generic round plan for you."
                          : "Use the older pack-based builder with optional per-pack counts while you transition."}
                    </div>
                  </div>
                </div>

                {buildMode === "manual_rounds" ? (
                  <div className="rounded-2xl border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">Manual rounds</div>
                        <div className="mt-1 text-xs text-muted-foreground">Each round picks its own pool using pack scope and metadata rules.</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={templateToAddId}
                          onChange={(e) => setTemplateToAddId(e.target.value)}
                          className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
                          disabled={!templates.length}
                        >
                          {templates.length === 0 ? (
                            <option value="">No active templates</option>
                          ) : null}
                          {templates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            if (selectedTemplateToAdd) addManualRoundFromTemplate(selectedTemplateToAdd)
                          }}
                          disabled={!selectedTemplateToAdd}
                        >
                          Add from template
                        </Button>
                        <Button variant="secondary" onClick={addManualRound}>Add blank round</Button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <div>Total questions from rounds: {manualRoundsTotal}. {manualJokerNote}</div>
                      {quickfireCount > 0 ? <div>Quickfire skips Joker, skips per-question reveals, and only pulls MCQ questions. Audio is allowed only when media_duration_ms is set and the clip is 5 seconds or shorter.</div> : null}
                      {selectedTemplateToAdd?.description ? <div>Template: {selectedTemplateToAdd.description}</div> : null}
                    </div>

                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-2xl border border-border bg-card p-3">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${roundBehaviourBadgeClass("standard")}`}>
                            {roundBehaviourLabel("standard")}
                          </span>
                          <span className="text-xs text-muted-foreground">{roundBehaviourTimingText("standard")}</span>
                        </div>
                        <div className="mt-2 text-sm text-foreground">{roundBehaviourSummary("standard")}</div>
                      </div>

                      <div className="rounded-2xl border border-border bg-card p-3">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${roundBehaviourBadgeClass("quickfire")}`}>
                            {roundBehaviourLabel("quickfire")}
                          </span>
                          <span className="text-xs text-muted-foreground">{roundBehaviourTimingText("quickfire")}</span>
                        </div>
                        <div className="mt-2 text-sm text-foreground">{roundBehaviourSummary("quickfire")}</div>
                        <div className="mt-2 text-xs text-muted-foreground">Quickfire question pool: MCQ only. Audio is allowed when media_duration_ms is set and the clip is 5 seconds or shorter.</div>
                      </div>
                    </div>

                    {buildMode === "manual_rounds" ? (
                      <div className="mt-3 rounded-2xl border border-border bg-card p-3 text-sm">
                        {feasibilityBusy ? (
                          <div className="text-muted-foreground">Checking round feasibility...</div>
                        ) : feasibilityError ? (
                          <div className="text-red-700 dark:text-red-200">{feasibilityError}</div>
                        ) : manualFeasibility ? (
                          <div className="space-y-2">
                            <div className={manualFeasibility.summary.explanation.tone === "ok" ? "text-foreground" : manualFeasibility.summary.explanation.tone === "warning" ? "text-amber-700 dark:text-amber-200" : "text-red-700 dark:text-red-200"}>
                              {manualFeasibility.summary.explanation.summary}
                            </div>
                            {manualFeasibility.summary.explanation.detail ? (
                              <div className="text-xs text-muted-foreground">{manualFeasibility.summary.explanation.detail}</div>
                            ) : null}
                            {manualFeasibility.summary.explanation.fallback ? (
                              <div className="text-xs text-muted-foreground">{manualFeasibility.summary.explanation.fallback}</div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="text-muted-foreground">Feasibility will appear once round settings are ready.</div>
                        )}
                      </div>
                    ) : null}

                    <div className="mt-3 space-y-3">
                      {manualRounds.map((round, index) => (
                        <div key={round.id} className="rounded-2xl border border-border bg-card p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-medium text-foreground">Round {index + 1}</div>
                                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${roundBehaviourBadgeClass(round.behaviourType)}`}>
                                  {roundBehaviourLabel(round.behaviourType)}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">{roundBehaviourSummary(round.behaviourType)}</div>
                            </div>
                            <Button variant="ghost" onClick={() => removeManualRound(round.id)} disabled={manualRounds.length <= 1}>Remove</Button>
                          </div>

                          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div>
                              <div className="text-sm font-medium text-foreground">Name</div>
                              <Input value={round.name} onChange={(e) => updateManualRound(round.id, { name: e.target.value })} placeholder={defaultRoundName(index)} />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-foreground">Questions</div>
                              <Input value={round.questionCountStr} onChange={(e) => updateManualRound(round.id, { questionCountStr: e.target.value })} inputMode="numeric" />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-foreground">Behaviour</div>
                              <select value={round.behaviourType} onChange={(e) => updateManualRound(round.id, { behaviourType: e.target.value as RoundBehaviourType })} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                                {ROUND_BEHAVIOUR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                              <div className="mt-1 text-xs text-muted-foreground">{getManualRoundTimingSummary(round)}</div>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-foreground">Source mode</div>
                              <select value={round.sourceMode} onChange={(e) => updateManualRound(round.id, { sourceMode: e.target.value as RoundSourceMode })} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                                <option value="selected_packs">Selected packs</option>
                                <option value="specific_packs">Specific packs</option>
                                <option value="all_questions">All questions</option>
                              </select>
                            </div>
                            <div className="space-y-2 pt-6">
                              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                <input type="checkbox" checked={round.jokerEligible} onChange={(e) => updateManualRound(round.id, { jokerEligible: e.target.checked })} disabled={round.behaviourType === "quickfire"} />
                                Joker eligible
                              </label>
                              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                <input type="checkbox" checked={round.countsTowardsScore} onChange={(e) => updateManualRound(round.id, { countsTowardsScore: e.target.checked })} />
                                Counts towards score
                              </label>
                            </div>
                          </div>

                          {round.behaviourType === "quickfire" ? (
                            <div className="mt-3 rounded-2xl border border-border bg-background p-3">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-medium text-foreground">Quickfire timing override</div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    Default Quickfire timings are {roundBehaviourTimingText("quickfire")}. Turn this on if your group needs a slower or faster pace.
                                  </div>
                                </div>
                                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <input
                                    type="checkbox"
                                    checked={round.useTimingOverride}
                                    onChange={(e) =>
                                      updateManualRound(round.id, {
                                        useTimingOverride: e.target.checked,
                                        answerSecondsStr: e.target.checked
                                          ? round.answerSecondsStr || String(getDefaultAnswerSecondsForBehaviour(round.behaviourType))
                                          : "",
                                        roundReviewSecondsStr: e.target.checked
                                          ? round.roundReviewSecondsStr || String(getDefaultRoundReviewSecondsForBehaviour(round.behaviourType))
                                          : "",
                                      })
                                    }
                                  />
                                  Override timings
                                </label>
                              </div>

                              {round.useTimingOverride ? (
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                  <div>
                                    <div className="text-sm font-medium text-foreground">Question seconds</div>
                                    <Input
                                      value={round.answerSecondsStr}
                                      onChange={(e) => updateManualRound(round.id, { answerSecondsStr: e.target.value })}
                                      inputMode="numeric"
                                    />
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium text-foreground">Round review seconds</div>
                                    <Input
                                      value={round.roundReviewSecondsStr}
                                      onChange={(e) => updateManualRound(round.id, { roundReviewSecondsStr: e.target.value })}
                                      inputMode="numeric"
                                    />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div>
                              <div className="text-sm font-medium text-foreground">media_type</div>
                              <select value={round.mediaType} onChange={(e) => updateManualRound(round.id, { mediaType: e.target.value as ManualRoundDraft["mediaType"] })} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                                <option value="">Any media</option>
                                <option value="text">text</option>
                                <option value="audio">audio</option>
                                <option value="image">image</option>
                              </select>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-foreground">prompt_target</div>
                              <select value={round.promptTarget} onChange={(e) => updateManualRound(round.id, { promptTarget: e.target.value })} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                                {PROMPT_TARGET_OPTIONS.map((option) => <option key={option.value || "blank"} value={option.value}>{option.label}</option>)}
                              </select>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-foreground">clue_source</div>
                              <select value={round.clueSource} onChange={(e) => updateManualRound(round.id, { clueSource: e.target.value })} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                                {CLUE_SOURCE_OPTIONS.map((option) => <option key={option.value || "blank"} value={option.value}>{option.label}</option>)}
                              </select>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-foreground">primary_show_key</div>
                              <select value={round.primaryShowKey} onChange={(e) => updateManualRound(round.id, { primaryShowKey: e.target.value })} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                                <option value="">Any show</option>
                                {shows.map((show) => <option key={show.show_key} value={show.show_key}>{show.display_name}</option>)}
                              </select>
                            </div>

                            <div>
                              <div className="text-sm font-medium text-foreground">audio_clip_type</div>
                              <select value={round.audioClipType} onChange={(e) => updateManualRound(round.id, { audioClipType: e.target.value })} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm" disabled={round.mediaType !== "audio"}>
                                {AUDIO_CLIP_TYPE_OPTIONS.map((option) => <option key={option.value || "blank"} value={option.value}>{option.label}</option>)}
                              </select>
                            </div>
                          </div>

                          {(() => {
                            const feasibility = manualFeasibilityById.get(round.id)
                            if (!feasibility) return null
                            const tone = feasibilityTone(feasibility)
                            const toneClasses =
                              tone === "error"
                                ? {
                                    container: "mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950",
                                    text: "text-red-700 dark:text-red-200",
                                  }
                                : tone === "warning"
                                  ? {
                                      container: "mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950",
                                      text: "text-amber-800 dark:text-amber-200",
                                    }
                                  : {
                                      container: "mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950",
                                      text: "text-emerald-800 dark:text-emerald-200",
                                    }
                            return (
                              <div className={toneClasses.container}>
                                <div className={toneClasses.text}>{feasibility.explanation.summary}</div>
                                {feasibility.explanation.detail ? (
                                  <div className="mt-1 text-xs text-muted-foreground">{feasibility.explanation.detail}</div>
                                ) : null}
                                {feasibility.explanation.fallback ? (
                                  <div className="mt-1 text-xs text-muted-foreground">{feasibility.explanation.fallback}</div>
                                ) : null}
                                <div className="mt-1 text-xs text-muted-foreground">
                                  Eligible now: {feasibility.eligibleCount}. Guaranteed under the current overlap: {feasibility.assignedCount}.
                                </div>
                              </div>
                            )
                          })()}

                          {round.behaviourType === "quickfire" ? (
                            <div className="mt-3 rounded-xl border border-violet-500/30 bg-violet-600/10 px-3 py-2 text-xs text-muted-foreground">
                              Quickfire question pool: MCQ only. Audio is allowed when media_duration_ms is set and the clip is 5 seconds or shorter. Audio and typed answers are excluded automatically.
                            </div>
                          ) : null}

                          {round.sourceMode === "selected_packs" ? (
                            <div className="mt-3 text-xs text-muted-foreground">This round uses the packs selected in the pack panel on the right.</div>
                          ) : round.sourceMode === "all_questions" ? (
                            <div className="mt-3 text-xs text-muted-foreground">This round can draw from any question linked to an active pack.</div>
                          ) : (
                            <div className="mt-3 space-y-2">
                              <div className="text-xs text-muted-foreground">Choose packs for this round.</div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {packs.map((pack) => (
                                  <label key={pack.id} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm">
                                    <input type="checkbox" checked={round.packIds.includes(pack.id)} onChange={() => toggleManualRoundPack(round.id, pack.id)} />
                                    <span className="min-w-0 flex-1">{pack.display_name}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-border p-3">
                      <div className="text-sm font-semibold text-foreground">Rounds</div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <div>
                          <div className="text-sm font-medium text-foreground">Number of rounds</div>
                          <Input value={roundCountStr} onChange={(e) => setRoundCountStr(e.target.value)} inputMode="numeric" />
                          <div className="mt-1 text-xs text-muted-foreground">Players pick a Joker round in the lobby when enough rounds allow it.</div>
                        </div>
                        <div className="sm:col-span-2">
                          {buildMode === "quick_random" ? (
                            <>
                              <div className="text-sm font-medium text-foreground">Quick random source</div>
                              <div className="mt-2 flex flex-wrap items-center gap-3">
                                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <input
                                    type="checkbox"
                                    checked={quickRandomUseTemplates}
                                    onChange={(e) => setQuickRandomUseTemplates(e.target.checked)}
                                  />
                                  Use round templates
                                </label>
                              </div>
                              <div className="mt-2 text-xs text-muted-foreground">
                                {quickRandomUseTemplates
                                  ? "The app will randomly choose from the selected templates below. Each chosen template keeps its own default question count and filters."
                                  : "The app will create a simple generic round plan using the round names and total question count below."}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-sm font-medium text-foreground">Round names</div>
                              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                                {roundNames.map((name, idx) => (
                                  <Input key={idx} value={name} onChange={(e) => setRoundNames((prev) => prev.map((n, i) => i === idx ? e.target.value : n))} placeholder={defaultRoundName(idx)} />
                                ))}
                              </div>
                              <div className="mt-2 text-xs text-muted-foreground">Empty names fall back to Round 1, Round 2, and so on.</div>
                            </>
                          )}
                        </div>
                      </div>

                      {buildMode === "quick_random" && quickRandomUseTemplates ? (
                        <div className="mt-4 rounded-2xl border border-border bg-card p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-foreground">Template pool</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {selectedQuickRandomTemplates.length} template{selectedQuickRandomTemplates.length === 1 ? "" : "s"} selected. Default questions total: {quickRandomTemplatesQuestionTotal}.
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button variant="secondary" onClick={() => setAllQuickRandomTemplates(true)} disabled={!templates.length}>Select all</Button>
                              <Button variant="secondary" onClick={() => setAllQuickRandomTemplates(false)} disabled={!quickRandomTemplateIds.length}>Clear</Button>
                            </div>
                          </div>
                          {quickRandomUseTemplates ? (
                            <div className="mt-3 rounded-2xl border border-border bg-background p-3 text-sm">
                              {feasibilityBusy ? (
                                <div className="text-muted-foreground">Checking template feasibility...</div>
                              ) : feasibilityError ? (
                                <div className="text-red-700 dark:text-red-200">{feasibilityError}</div>
                              ) : templateFeasibility ? (
                                <div className="space-y-2">
                                  <div className={templateFeasibility.summary.explanation.tone === "ok" ? "text-foreground" : templateFeasibility.summary.explanation.tone === "warning" ? "text-amber-700 dark:text-amber-200" : "text-red-700 dark:text-red-200"}>
                                    {templateFeasibility.summary.explanation.summary}
                                  </div>
                                  {templateFeasibility.summary.explanation.detail ? (
                                    <div className="text-xs text-muted-foreground">{templateFeasibility.summary.explanation.detail}</div>
                                  ) : null}
                                  {templateFeasibility.summary.explanation.fallback ? (
                                    <div className="text-xs text-muted-foreground">{templateFeasibility.summary.explanation.fallback}</div>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="text-muted-foreground">Feasibility will appear once you choose templates.</div>
                              )}
                            </div>
                          ) : null}
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {templates.length === 0 ? (
                              <div className="text-sm text-muted-foreground">No active round templates are available yet.</div>
                            ) : (
                              templates.map((template) => {
                                const selected = quickRandomTemplateIds.includes(template.id)
                                const feasibility = templateFeasibilityById.get(template.id)
                                const tone = feasibility ? feasibilityTone(feasibility) : null
                                return (
                                  <label key={template.id} className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={() => toggleQuickRandomTemplate(template.id)}
                                      />
                                      <span className="min-w-0 flex-1">{template.name}</span>
                                      <span className="text-xs text-muted-foreground">{template.default_question_count}</span>
                                    </div>
                                    {feasibility ? (
                                      <div className="mt-2 pl-6 text-xs">
                                        <div className={tone === "error" ? "text-red-700 dark:text-red-200" : tone === "warning" ? "text-amber-700 dark:text-amber-200" : "text-emerald-700 dark:text-emerald-200"}>
                                          {feasibility.explanation.summary}
                                        </div>
                                        {feasibility.explanation.detail ? (
                                          <div className="mt-1 text-muted-foreground">{feasibility.explanation.detail}</div>
                                        ) : null}
                                        {selected && feasibility.explanation.fallback ? (
                                          <div className="mt-1 text-muted-foreground">{feasibility.explanation.fallback}</div>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </label>
                                )
                              })
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      {buildMode === "quick_random" && quickRandomUseTemplates ? (
                        <div>
                          <div className="text-sm font-medium text-foreground">Template randomiser</div>
                          <div className="mt-2 text-sm text-muted-foreground">Randomly picks the number of rounds you set above from the selected template pool.</div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-sm font-medium text-foreground">Total questions</div>
                          <Input value={totalQuestionsStr} onChange={(e) => setTotalQuestionsStr(e.target.value)} inputMode="numeric" />
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium text-foreground">Answer seconds</div>
                        <Input value={answerSecondsStr} onChange={(e) => setAnswerSecondsStr(e.target.value)} inputMode="numeric" disabled={untimedAnswers} />
                        <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                          <input type="checkbox" checked={untimedAnswers} onChange={(e) => setUntimedAnswers(e.target.checked)} />
                          Untimed answers (host controls)
                        </label>
                        {untimedAnswers ? <div className="mt-1 text-xs text-muted-foreground">The question stays open until everyone answers or you press Reveal answer.</div> : <div className="mt-1 text-xs text-muted-foreground">Questions open straight away. There is no get ready countdown.</div>}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">Round review seconds</div>
                        <Input value={roundReviewSecondsStr} onChange={(e) => setRoundReviewSecondsStr(e.target.value)} inputMode="numeric" />
                        <div className="mt-1 text-xs text-muted-foreground">After the last question in a round, the round summary shows for this long before the next round starts.</div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      {buildMode === "quick_random" && quickRandomUseTemplates ? (
                        <div>
                          <div className="text-sm font-medium text-foreground">Template rules</div>
                          <div className="mt-2 text-sm text-muted-foreground">Each chosen template keeps its own media, clue, and show filters.</div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-sm font-medium text-foreground">Round filter</div>
                          <select value={roundFilter} onChange={(e) => setRoundFilter(e.target.value as RoundFilter)} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                            <option value="mixed">Mixed</option>
                            <option value="no_audio">No audio</option>
                            <option value="no_image">No pictures</option>
                            <option value="audio_only">Audio only</option>
                            <option value="picture_only">Pictures only</option>
                            <option value="audio_and_image">Audio and pictures</option>
                          </select>
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium text-foreground">Audio mode</div>
                        <select value={audioMode} onChange={(e) => setAudioMode(e.target.value as AudioMode)} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                          <option value="display">Display only</option>
                          <option value="phones">Phones only</option>
                          <option value="both">Both</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <input type="checkbox" checked={selectPacks} onChange={(e) => setSelectPacks(e.target.checked)} />
                          Select packs
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {buildMode === "manual_rounds" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-sm font-medium text-foreground">Fallback answer seconds</div>
                      <Input value={answerSecondsStr} onChange={(e) => setAnswerSecondsStr(e.target.value)} inputMode="numeric" disabled={untimedAnswers} />
                      <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <input type="checkbox" checked={untimedAnswers} onChange={(e) => setUntimedAnswers(e.target.checked)} />
                        Untimed answers (host controls)
                      </label>
                      <div className="mt-1 text-xs text-muted-foreground">Manual rounds now carry their own standard or Quickfire timing defaults. This value is kept as the room fallback.</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">Fallback round review seconds</div>
                      <Input value={roundReviewSecondsStr} onChange={(e) => setRoundReviewSecondsStr(e.target.value)} inputMode="numeric" />
                      <div className="mt-1 text-xs text-muted-foreground">Used only if a round does not already carry its own review timing.</div>
                    </div>
                  </div>
                ) : null}

                  </>
                )}

                {createError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{createError}</div> : null}
                {!createError && activeCreateBlockReason ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">{activeCreateBlockReason}</div> : null}
              </CardContent>

              <CardFooter className="flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  {setupMode === "simple"
                    ? simpleFeasibilityBusy
                      ? "Checking ready templates..."
                      : !selectPacks
                        ? `${simpleRoundCount} round${simpleRoundCount === 1 ? "" : "s"} planned from ready templates using all active packs.`
                        : `${simpleRoundCount} round${simpleRoundCount === 1 ? "" : "s"} planned from ready templates across ${selectedPackCount} selected pack${selectedPackCount === 1 ? "" : "s"}.`
                    : buildMode === "manual_rounds"
                      ? `${manualRounds.length} round${manualRounds.length === 1 ? "" : "s"} planned.`
                      : buildMode === "quick_random" && quickRandomUseTemplates
                        ? `${quickRandomTemplateIds.length} template${quickRandomTemplateIds.length === 1 ? "" : "s"} in the quick-random pool.`
                        : !selectPacks
                          ? "Using all active packs."
                          : selectedPackCount > 0
                            ? `${selectedPackCount} pack${selectedPackCount === 1 ? "" : "s"} selected.`
                            : "No packs selected yet."}
                </div>
                <Button
                  onClick={createRoom}
                  disabled={creating || packsLoading || (setupMode === "simple" ? simpleFeasibilityBusy || Boolean(activeCreateBlockReason) : Boolean(activeCreateBlockReason))}
                >
                  {creating ? "Creating..." : packsLoading ? "Loading packs..." : "Create room"}
                </Button>
              </CardFooter>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>Host controls</CardTitle>
                    <div className="mt-1 text-sm text-muted-foreground">{roomSummaryText}</div>
                  </div>
                  <div className="rounded-full border border-border px-3 py-1 text-xs text-foreground">{stagePill}</div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {startError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{startError}</div> : null}
                {startOk ? <div className="whitespace-pre-line rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{startOk}</div> : null}
                {resetError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{resetError}</div> : null}
                {resetOk ? <div className="whitespace-pre-line rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{resetOk}</div> : null}
                {forceCloseError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{forceCloseError}</div> : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">Room code</div><div className="mt-1 text-2xl font-semibold tracking-widest text-foreground">{roomCode}</div></div>
                  <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">Current stage</div><div className="mt-1 text-lg font-semibold text-foreground">{stagePill}</div></div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button onClick={startGame} disabled={!canStart}>{startLabel}</Button>
                  <Button variant="secondary" onClick={resetRoom} disabled={resetting}>{resetting ? "Resetting..." : "Reset room"}</Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <Button variant="secondary" onClick={continueGame} disabled={!canContinue}>{continueLabel}</Button>
                  <div className="flex items-center rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">Round review advances automatically after the set time. Use the button to move on sooner.</div>
                </div>
                <div className="flex justify-end"><Button variant="ghost" onClick={clearRoom}>Create another room</Button></div>
              </CardContent>
            </Card>
          )}

          {packsError ? <Card><CardHeader><CardTitle>Packs</CardTitle></CardHeader><CardContent><div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{packsError}</div></CardContent></Card> : null}
        </div>

        <div className="space-y-6">
          {!hasRoom ? (
            <>
              <Card>
                <CardHeader><CardTitle>Re-host room</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-muted-foreground">Enter a room code to continue hosting an existing room.</div>
                  <div>
                    <div className="text-sm font-medium text-foreground">Room code</div>
                    <Input value={rehostCode} onChange={(e) => setRehostCode(cleanRoomCode(e.target.value))} placeholder="For example 3PDSXFT5" autoCapitalize="characters" spellCheck={false} />
                  </div>
                  {rehostError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{rehostError}</div> : null}
                  <Button onClick={rehostRoom} disabled={rehostBusy}>{rehostBusy ? "Loading..." : "Re-host"}</Button>
                </CardContent>
              </Card>

              {buildMode === "manual_rounds" ? (
                <Card className="lg:sticky lg:top-4 self-start">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>Selected packs</CardTitle>
                        <div className="mt-1 text-sm text-muted-foreground">Rounds using Selected packs will draw from these packs.</div>
                      </div>
                      <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{selectedPackCount} selected</div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 max-h-[70vh] overflow-y-auto">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => setAllSelected(true)}>Select all</Button>
                      <Button variant="secondary" onClick={() => setAllSelected(false)}>Clear</Button>
                    </div>
                    <div className="grid gap-2">
                      {packs.map((pack) => (
                        <label key={pack.id} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
                          <input type="checkbox" checked={Boolean(selectedPacks[pack.id])} onChange={() => togglePack(pack.id)} />
                          <span className="min-w-0 flex-1 text-sm">{pack.display_name}</span>
                        </label>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : selectPacks ? (
                <Card className="lg:sticky lg:top-4 self-start">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>Packs</CardTitle>
                        <div className="mt-1 text-sm text-muted-foreground">Choose which packs to include.</div>
                      </div>
                      <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{selectedPackCount} selected</div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 max-h-[70vh] overflow-y-auto">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => setAllSelected(true)}>Select all</Button>
                      <Button variant="secondary" onClick={() => setAllSelected(false)}>Clear</Button>
                      {buildMode === "legacy_pack_mode" ? (
                        <div className="ml-auto flex items-center gap-2">
                          <div className="text-sm text-muted-foreground">Strategy</div>
                          <select value={selectionStrategy} onChange={(e) => setSelectionStrategy(e.target.value as SelectionStrategy)} className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
                            <option value="all_packs">Mix all selected packs</option>
                            <option value="per_pack">Set counts per pack</option>
                          </select>
                        </div>
                      ) : null}
                    </div>
                    <div className="grid gap-2">
                      {packs.map((pack) => (
                        <label key={pack.id} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
                          <input type="checkbox" checked={Boolean(selectedPacks[pack.id])} onChange={() => togglePack(pack.id)} />
                          <span className="min-w-0 flex-1 text-sm">{pack.display_name}</span>
                          {buildMode === "legacy_pack_mode" && selectionStrategy === "per_pack" && selectedPacks[pack.id] ? (
                            <input value={perPackCounts[pack.id] ?? ""} onChange={(e) => setPerPackCounts((prev) => ({ ...prev, [pack.id]: e.target.value }))} inputMode="numeric" placeholder="Count" className="w-24 rounded-xl border border-border bg-card px-3 py-2 text-sm" />
                          ) : null}
                        </label>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader><CardTitle>Packs</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <div>You are currently using all active packs.</div>
                    <div>Tick Select packs on the left if you want to choose specific packs.</div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <>
              <Card>
                <CardHeader><CardTitle>Room access</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-3"><div className="text-2xl font-semibold tracking-widest text-foreground">{roomCode}</div><QRTile value={joinUrl} size={112} /></div>
                  <div className="text-sm text-muted-foreground">Players join at</div>
                  <div className="rounded-xl border border-border bg-card px-3 py-2 text-sm"><a href={joinUrl} className="break-all underline">{joinUrl}</a></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button onClick={() => openInNewWindow(displayUrl)}>Open TV display</Button>
                    <Button variant="secondary" onClick={() => openInNewWindow(joinPageUrl)}>Join room</Button>
                  </div>
                  <Button variant="secondary" onClick={copyJoinLink}>Copy join link</Button>
                </CardContent>
              </Card>
              <HostJoinedTeamsPanel code={roomCode ?? ""} />
            </>
          )}
        </div>
      </div>
    </PageShell>
  )
}
