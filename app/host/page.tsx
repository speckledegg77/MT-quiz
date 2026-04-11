"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode, type SelectHTMLAttributes } from "react"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import QRTile from "@/components/ui/QRTile"

import { supabase } from "@/lib/supabaseClient"
import { randomTeamName } from "@/lib/teamNameSuggestions"
import { normaliseDefaultPackIds, normaliseSelectionRules, type RoundTemplateRow } from "@/lib/roundTemplates"
import { getDefaultAnswerSecondsForBehaviour, getDefaultRoundReviewSecondsForBehaviour } from "@/lib/roomRoundPlan"
import { getRoomStagePillLabel, getRunModeSummaryLabel } from "@/lib/gameMode"

import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import HostJoinedTeamsPanel from "@/components/HostJoinedTeamsPanel"
import PageShell from "@/components/PageShell"
import RoundSummaryCard from "@/components/RoundSummaryCard"

type PackRow = {
  id: string
  display_name: string
  round_type: string
  sort_order: number | null
  is_active: boolean | null
}

type HeadsUpPackRow = {
  id: string
  name: string
  description: string
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
type BuildMode = "manual_rounds" | "quick_random" | "legacy_pack_mode" | "infinite"
type SetupMode = "simple" | "advanced"
type SimpleGameType = "recommended" | "infinite" | "heads_up"
type SimplePresetId = "classic" | "balanced" | "quickfire_mix"
type RoundBehaviourType = "standard" | "quickfire" | "heads_up"
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
  headsUpDifficulty: "" | "easy" | "medium" | "hard"
  headsUpTvDisplayMode: "show_clue" | "timer_only"
  headsUpTurnSeconds: 60 | 90
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
  { value: "heads_up", label: "Heads Up" },
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


const HEADS_UP_TV_DISPLAY_OPTIONS = [
  { value: "timer_only", label: "Timer only on TV" },
  { value: "show_clue", label: "Show clue on TV" },
]

const HEADS_UP_TURN_OPTIONS = [
  { value: 60, label: "60 seconds" },
  { value: 90, label: "90 seconds" },
]

const HEADS_UP_DIFFICULTY_OPTIONS = [
  { value: "", label: "Any difficulty" },
  { value: "easy", label: "easy" },
  { value: "medium", label: "medium" },
  { value: "hard", label: "hard" },
]

const CLUE_SOURCE_OPTIONS = [
  { value: "", label: "Any clue source" },
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

type SelectControlProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode
  compact?: boolean
}

function SelectControl({ children, className = "", compact = false, ...props }: SelectControlProps) {
  return (
    <div className="relative">
      <select
        {...props}
        className={`${className} w-full appearance-none border border-border/70 bg-card text-foreground shadow-sm outline-none transition-colors hover:border-border focus:border-foreground/30 focus:bg-card focus:ring-2 focus:ring-foreground/10 disabled:cursor-not-allowed disabled:opacity-60 ${compact ? "h-9 rounded-lg pr-8 pl-3 text-sm" : "h-10 rounded-lg pr-9 pl-3 text-sm"}`}
      >
        {children}
      </select>
      <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground ${compact ? "h-4 w-4" : "h-4 w-4"}`} />
    </div>
  )
}

function audioModeLabel(mode: AudioMode) {
  if (mode === "phones") return "phone"
  if (mode === "both") return "TV and phone"
  return "TV"
}

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
  const behaviourType: RoundBehaviourType =
    draft.behaviourType === "quickfire" ? "quickfire" : draft.behaviourType === "heads_up" ? "heads_up" : "standard"
  return {
    ...draft,
    behaviourType,
    jokerEligible: behaviourType === "quickfire" || behaviourType === "heads_up" ? false : draft.jokerEligible,
    countsTowardsScore: behaviourType === "heads_up" ? false : draft.countsTowardsScore,
    sourceMode: behaviourType === "heads_up" ? "specific_packs" : draft.sourceMode === "selected_packs" ? "specific_packs" : draft.sourceMode,
    mediaType: behaviourType === "heads_up" ? "" : draft.mediaType,
    promptTarget: behaviourType === "heads_up" ? "" : draft.promptTarget,
    clueSource: behaviourType === "heads_up" ? "" : draft.clueSource,
    audioClipType: behaviourType === "heads_up" ? "" : draft.audioClipType,
    headsUpTvDisplayMode: behaviourType === "heads_up" ? draft.headsUpTvDisplayMode : "timer_only",
    headsUpTurnSeconds: behaviourType === "heads_up" ? draft.headsUpTurnSeconds : 60,
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
    sourceMode: "specific_packs",
    packIds: [],
    mediaType: "",
    promptTarget: "",
    clueSource: "",
    primaryShowKey: "",
    audioClipType: "",
    headsUpDifficulty: "",
    headsUpTvDisplayMode: "timer_only",
    headsUpTurnSeconds: 60,
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
    headsUpDifficulties: round.behaviourType === "heads_up" && round.headsUpDifficulty ? [round.headsUpDifficulty] : [],
  }
}

function serialiseManualRoundDraft(round: ManualRoundDraft, index: number) {
  return {
    id: round.id,
    name: round.name.trim() || defaultRoundName(index),
    questionCount: round.behaviourType === "heads_up" ? 0 : clampInt(parseIntOr(round.questionCountStr, 0), 1, 200),
    behaviourType: round.behaviourType,
    jokerEligible: round.behaviourType === "quickfire" || round.behaviourType === "heads_up" ? false : round.jokerEligible,
    countsTowardsScore: round.behaviourType === "heads_up" ? false : round.countsTowardsScore,
    sourceMode: round.sourceMode,
    packIds: round.packIds,
    selectionRules: buildSelectionRulesFromDraft(round),
    answerSeconds: round.behaviourType === "heads_up" ? round.headsUpTurnSeconds : getManualRoundAnswerSeconds(round),
    roundReviewSeconds: round.behaviourType === "heads_up" ? getManualRoundReviewSeconds(round) : getManualRoundReviewSeconds(round),
    headsUpTvDisplayMode: round.behaviourType === "heads_up" ? round.headsUpTvDisplayMode : undefined,
  }
}

function normaliseTemplateTiming(raw: unknown, fallback: number) {
  const value = Math.floor(Number(raw ?? fallback))
  if (!Number.isFinite(value) || value < 0) return fallback
  return clampInt(value, 0, 120)
}

function serialiseTemplateAsRound(template: RoundTemplateRow, index: number) {
  const selectionRules = normaliseSelectionRules(template.selection_rules)
  const defaultPackIds = normaliseDefaultPackIds(template.default_pack_ids)
  const behaviourType: RoundBehaviourType = String(template.behaviour_type ?? "standard") === "quickfire" ? "quickfire" : String(template.behaviour_type ?? "standard") === "heads_up" ? "heads_up" : "standard"
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
    jokerEligible: behaviourType === "quickfire" || behaviourType === "heads_up" ? false : Boolean(template.joker_eligible ?? true),
    countsTowardsScore: behaviourType === "heads_up" ? false : Boolean(template.counts_towards_score ?? true),
    sourceMode,
    packIds: sourceMode === "specific_packs" ? defaultPackIds : [],
    selectionRules: {
      mediaTypes: selectionRules.mediaTypes ?? [],
      promptTargets: selectionRules.promptTargets ?? [],
      clueSources: selectionRules.clueSources ?? [],
      primaryShowKeys: selectionRules.primaryShowKeys ?? [],
      audioClipTypes: selectionRules.audioClipTypes ?? [],
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
  return [...templates].sort((a, b) =>
    String(a.name ?? "").localeCompare(String(b.name ?? ""))
  )
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
  return behaviourType === "quickfire" ? "Quickfire" : behaviourType === "heads_up" ? "Heads Up" : "Standard"
}

function roundBehaviourBadgeClass(behaviourType: RoundBehaviourType) {
  return behaviourType === "quickfire"
    ? "border-violet-500/40 bg-violet-600/10 text-violet-200"
    : behaviourType === "heads_up"
      ? "border-amber-500/40 bg-amber-600/10 text-amber-200"
      : "border-emerald-500/40 bg-emerald-600/10 text-emerald-200"
}

function roundBehaviourSummary(behaviourType: RoundBehaviourType) {
  if (behaviourType === "quickfire") {
    return "Fast answers, no Joker, no reveal after each question, and the fastest correct player gets a bonus point. Quickfire audio is allowed only when the clip is 5 seconds or shorter."
  }
  if (behaviourType === "heads_up") {
    return "Timed turn-based clueing. The guesser scores one point for each correct card, and the host can review mistakes before the turn is locked."
  }

  return "Classic question flow with the normal reveal after each question. Joker can be enabled if you want it."
}

function roundBehaviourTimingText(behaviourType: RoundBehaviourType) {
  return behaviourType === "heads_up"
    ? "60s or 90s turn, plus round review"
    : `${getDefaultAnswerSecondsForBehaviour(behaviourType)}s answer window, ${getDefaultRoundReviewSecondsForBehaviour(behaviourType)}s round review`
}

function getManualRoundAnswerSeconds(round: ManualRoundDraft) {
  if (round.behaviourType === "heads_up") return round.headsUpTurnSeconds
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
  return round.behaviourType === "heads_up"
    ? `${answerSeconds}s turn, ${roundReviewSeconds}s round review`
    : `${answerSeconds}s answer window, ${roundReviewSeconds}s round review`
}

function countManualRoundFilters(round: ManualRoundDraft) {
  let count = 0
  if (round.mediaType) count += 1
  if (round.promptTarget) count += 1
  if (round.clueSource) count += 1
  if (round.primaryShowKey) count += 1
  if (round.audioClipType) count += 1
  if (round.behaviourType === "heads_up" && round.headsUpDifficulty) count += 1
  return count
}

export default function HostPage() {
  const [packs, setPacks] = useState<PackRow[]>([])
  const [headsUpPacks, setHeadsUpPacks] = useState<HeadsUpPackRow[]>([])
  const [shows, setShows] = useState<ShowRow[]>([])
  const [templates, setTemplates] = useState<RoundTemplateRow[]>([])
  const [packsLoading, setPacksLoading] = useState(true)
  const [packsError, setPacksError] = useState<string | null>(null)

  const [setupMode, setSetupMode] = useState<SetupMode>("simple")
  const [advancedUnlocked, setAdvancedUnlocked] = useState(false)
  const [simpleGameType, setSimpleGameType] = useState<SimpleGameType>("recommended")
  const [simpleHeadsUpPackId, setSimpleHeadsUpPackId] = useState("")
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

  const [gameMode, setGameMode] = useState<GameMode>("solo")
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
  const [simpleCandidateCount, setSimpleCandidateCount] = useState(0)
  const [simpleInfiniteQuestionLimitStr, setSimpleInfiniteQuestionLimitStr] = useState("")
  const [advancedInfiniteQuestionLimitStr, setAdvancedInfiniteQuestionLimitStr] = useState("")
  const [showSimpleGameSummary, setShowSimpleGameSummary] = useState(false)
  const [showSimpleRecommendedRounds, setShowSimpleRecommendedRounds] = useState(false)

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
  const [endingGame, setEndingGame] = useState(false)

  const [rehostCode, setRehostCode] = useState("")
  const [rehostBusy, setRehostBusy] = useState(false)
  const [rehostError, setRehostError] = useState<string | null>(null)
  const [manualPackPickerRoundId, setManualPackPickerRoundId] = useState<string | null>(null)
  const [manualPackPickerSearch, setManualPackPickerSearch] = useState("")
  const [roundTemplateSelections, setRoundTemplateSelections] = useState<Record<string, string>>({})

  const advancingRef = useRef(false)

  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const joinUrl = roomCode ? `${origin}/join?code=${roomCode}` : ""
  const joinPageUrl = roomCode ? `/join?code=${roomCode}` : ""
  const displayUrl = roomCode ? `/display/${roomCode}` : ""

  useEffect(() => {
    if (!headsUpPacks.length) return
    setSimpleHeadsUpPackId((current) => {
      if (current && headsUpPacks.some((pack) => pack.id === current)) return current
      return headsUpPacks[0]?.id ?? ""
    })
  }, [headsUpPacks])

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

      const [packsRes, headsUpPacksRes, showsRes, templatesRes] = await Promise.all([
        supabase
          .from("packs")
          .select("id, display_name, round_type, sort_order, is_active")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        fetch("/api/heads-up/packs", { cache: "no-store" }).then(async (res) => {
          const json = (await res.json().catch(() => ({}))) as { packs?: HeadsUpPackRow[] }
          return res.ok ? (json.packs ?? []) : []
        }).catch(() => [] as HeadsUpPackRow[]),
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
        setHeadsUpPacks(headsUpPacksRes)
        setTemplates(templatesRes)
        setPacksLoading(false)
        return
      }

      setPacks((packsRes.data ?? []) as PackRow[])
      setHeadsUpPacks(headsUpPacksRes)
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
    if (!manualRounds.length || !templates.length) return
    setRoundTemplateSelections((current) => {
      const next = { ...current }
      for (const round of manualRounds) {
        if (!next[round.id] || !templates.some((template) => template.id === next[round.id])) {
          next[round.id] = templates[0]?.id ?? ""
        }
      }
      for (const roundId of Object.keys(next)) {
        if (!manualRounds.some((round) => round.id === roundId)) delete next[roundId]
      }
      return next
    })
  }, [manualRounds, templates])

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
      prev.map((round) => {
        if (round.id !== id) return round
        const next: Partial<ManualRoundDraft> = { ...changes }
        return normaliseManualRoundDraft({ ...round, ...next })
      })
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

  function setManualRoundPacks(roundId: string, packIds: string[]) {
    setManualRounds((prev) => prev.map((round) => (round.id === roundId ? { ...round, packIds } : round)))
  }

  function openManualRoundPackPicker(roundId: string) {
    setManualPackPickerSearch("")
    setManualPackPickerRoundId(roundId)
  }

  function closeManualRoundPackPicker() {
    setManualPackPickerRoundId(null)
    setManualPackPickerSearch("")
  }

  function applyTemplateToManualRound(roundId: string, templateId: string) {
    const template = templates.find((item) => item.id === templateId)
    if (!template) return
    const selectionRules = normaliseSelectionRules(template.selection_rules)
    const defaultPackIds = normaliseDefaultPackIds(template.default_pack_ids)
    const behaviourType: RoundBehaviourType =
      String(template.behaviour_type ?? "standard") === "quickfire"
        ? "quickfire"
        : String(template.behaviour_type ?? "standard") === "heads_up"
          ? "heads_up"
          : "standard"

    setManualRounds((prev) =>
      prev.map((round) => {
        if (round.id !== roundId) return round
        const nextSourceMode: RoundSourceMode =
          behaviourType === "heads_up"
            ? "specific_packs"
            : String(template.source_mode ?? "selected_packs") === "all_questions"
              ? "all_questions"
              : "specific_packs"

        return normaliseManualRoundDraft({
          ...round,
          name: String(template.name ?? "").trim() || round.name,
          questionCountStr: behaviourType === "heads_up" ? round.questionCountStr : String(Math.max(1, Number(template.default_question_count ?? 5) || 5)),
          behaviourType,
          jokerEligible: behaviourType === "quickfire" || behaviourType === "heads_up" ? false : Boolean(template.joker_eligible ?? true),
          countsTowardsScore: behaviourType === "heads_up" ? false : Boolean(template.counts_towards_score ?? true),
          sourceMode: nextSourceMode,
          packIds: nextSourceMode === "specific_packs" ? (defaultPackIds.length ? defaultPackIds : round.packIds) : [],
          mediaType: selectionRules.mediaTypes?.[0] ?? "",
          promptTarget: selectionRules.promptTargets?.[0] ?? "",
          clueSource: selectionRules.clueSources?.[0] ?? "",
          primaryShowKey: selectionRules.primaryShowKeys?.[0] ?? "",
          audioClipType: selectionRules.audioClipTypes?.[0] ?? "",
          headsUpDifficulty: "",
          headsUpTvDisplayMode: "timer_only",
          headsUpTurnSeconds: 60,
          useTimingOverride: false,
          answerSecondsStr: "",
          roundReviewSecondsStr: "",
        })
      })
    )
  }

  function addManualRoundFromTemplate(template: RoundTemplateRow) {
    const selectionRules = normaliseSelectionRules(template.selection_rules)
    const defaultPackIds = normaliseDefaultPackIds(template.default_pack_ids)

    const sourceMode = String(template.source_mode ?? "selected_packs") as RoundSourceMode
    const behaviourType: RoundBehaviourType = String(template.behaviour_type ?? "standard") === "quickfire" ? "quickfire" : String(template.behaviour_type ?? "standard") === "heads_up" ? "heads_up" : "standard"

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
        jokerEligible: behaviourType === "quickfire" || behaviourType === "heads_up" ? false : Boolean(template.joker_eligible ?? true),
        countsTowardsScore: behaviourType === "heads_up" ? false : Boolean(template.counts_towards_score ?? true),
        sourceMode,
        packIds: sourceMode === "specific_packs" ? defaultPackIds : [],
        mediaType: selectionRules.mediaTypes?.[0] ?? "",
        promptTarget: selectionRules.promptTargets?.[0] ?? "",
        clueSource: selectionRules.clueSources?.[0] ?? "",
        primaryShowKey: selectionRules.primaryShowKeys?.[0] ?? "",
        audioClipType: selectionRules.audioClipTypes?.[0] ?? "",
        headsUpDifficulty: "",
        headsUpTvDisplayMode: "timer_only",
        headsUpTurnSeconds: 60,
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
    if (roomCode) return
    if (packsLoading) return

    let cancelled = false
    setSimpleFeasibilityBusy(true)
    setSimpleFeasibilityError(null)

    const timer = window.setTimeout(async () => {
      try {

        const response = await fetch("/api/room/feasibility", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            simpleGameType === "heads_up"
              ? {
                  selectedPackIds: [],
                  manualRounds: simpleHeadsUpPackId
                    ? [
                        {
                          id: "simple_heads_up_round",
                          name: "Heads Up",
                          questionCount: 0,
                          behaviourType: "heads_up",
                          sourceMode: "specific_packs",
                          packIds: [simpleHeadsUpPackId],
                          selectionRules: {},
                        },
                      ]
                    : [],
                  templateRounds: [],
                }
              : {
                  selectedPackIds: simpleSelectedPackIds,
                  manualRounds: [],
                  templateIds: templates.map((template) => template.id),
                  templateRounds: allTemplateRoundsPayload,
                }
          ),
        })

        const json = (await response.json().catch(() => ({}))) as FeasibilityResponse
        if (cancelled) return

        if (!response.ok) {
          setSimpleFeasibilityError(json.error ?? "Could not check the current question pool.")
          setSimpleTemplateFeasibility(null)
          setSimpleCandidateCount(0)
          setSimpleFeasibilityBusy(false)
          return
        }

        setSimpleTemplateFeasibility(simpleGameType === "heads_up" ? json.manual ?? null : json.templates ?? null)
        setSimpleCandidateCount(
          simpleGameType === "heads_up"
            ? Math.max(0, Number(json.manual?.rounds?.[0]?.eligibleCount ?? 0) || 0)
            : Math.max(0, Number(json.candidateCount ?? 0) || 0)
        )
        setSimpleFeasibilityBusy(false)
      } catch (error: any) {
        if (cancelled) return
        setSimpleFeasibilityError(error?.message ?? "Could not check the current question pool.")
        setSimpleTemplateFeasibility(null)
        setSimpleCandidateCount(0)
        setSimpleFeasibilityBusy(false)
      }
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [allTemplateRoundsPayload, headsUpPacks.length, packsLoading, roomCode, simpleGameType, simpleHeadsUpPackId, simpleSelectedPackIds, templates.length])

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
            templateIds: shouldCheckTemplates ? selectedQuickRandomTemplates.map((template) => template.id) : [],
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

  const simpleInfiniteQuestionLimit = useMemo(() => {
    const value = simpleInfiniteQuestionLimitStr.trim()
    if (value === "") return null
    const parsed = Math.floor(Number(value))
    if (!Number.isFinite(parsed)) return Number.NaN
    return clampInt(parsed, 0, 9999)
  }, [simpleInfiniteQuestionLimitStr])

  const simpleInfiniteResolvedQuestionCount = useMemo(() => {
    if (simpleInfiniteQuestionLimit == null) return simpleCandidateCount
    if (!Number.isFinite(simpleInfiniteQuestionLimit) || simpleInfiniteQuestionLimit <= 0) return 0
    return Math.min(simpleInfiniteQuestionLimit, simpleCandidateCount)
  }, [simpleCandidateCount, simpleInfiniteQuestionLimit])

  const advancedInfiniteQuestionLimit = useMemo(() => {
    const value = advancedInfiniteQuestionLimitStr.trim()
    if (value === "") return null
    const parsed = Math.floor(Number(value))
    if (!Number.isFinite(parsed)) return Number.NaN
    return clampInt(parsed, 0, 9999)
  }, [advancedInfiniteQuestionLimitStr])

  const advancedInfiniteResolvedQuestionCount = useMemo(() => {
    if (advancedInfiniteQuestionLimit == null) return simpleCandidateCount
    if (!Number.isFinite(advancedInfiniteQuestionLimit) || advancedInfiniteQuestionLimit <= 0) return 0
    return Math.min(advancedInfiniteQuestionLimit, simpleCandidateCount)
  }, [advancedInfiniteQuestionLimit, simpleCandidateCount])

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
    if (buildMode === "infinite") {
      if (simpleFeasibilityBusy) return "Still checking how many questions are available for this pack choice."
      if (selectPacks && simpleSelectedPackIds.length === 0) return "Select at least one pack, or use all active packs."
      if (advancedInfiniteQuestionLimit !== null) {
        if (!Number.isFinite(advancedInfiniteQuestionLimit) || advancedInfiniteQuestionLimit < 1) {
          return "Total questions must be blank, or at least 1."
        }
      }
      if (simpleCandidateCount <= 0) return "No questions are available in the current pack choice."
      return null
    }

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
  }, [advancedInfiniteQuestionLimit, buildMode, manualFeasibility, quickRandomUseTemplates, selectPacks, simpleCandidateCount, simpleFeasibilityBusy, simpleSelectedPackIds.length, templateFeasibility])

  const simpleCreateBlockReason = useMemo(() => {
    if (simpleFeasibilityError) return simpleFeasibilityError
    if (selectPacks && simpleSelectedPackIds.length === 0) {
      return "Select at least one pack, or use all active packs."
    }

    if (simpleGameType === "infinite") {
      if (simpleInfiniteQuestionLimit !== null) {
        if (!Number.isFinite(simpleInfiniteQuestionLimit) || simpleInfiniteQuestionLimit < 1) {
          return "Total questions must be blank, or at least 1."
        }
      }

      if (simpleCandidateCount <= 0) {
        return "No questions are available in the current pack choice."
      }

      return null
    }

    if (simpleGameType === "heads_up") {
      if (!simpleHeadsUpPackId) return "Choose a Heads Up pack first."
      if (simpleFeasibilityBusy) return "Still checking the selected Heads Up pack."
      if (simpleCandidateCount <= 0) return "No active Heads Up cards are available in the selected pack."
      return null
    }

    return simpleTemplatePlan.error
  }, [selectPacks, simpleCandidateCount, simpleFeasibilityError, simpleGameType, simpleInfiniteQuestionLimit, simpleSelectedPackIds.length, simpleTemplatePlan.error])

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
        buildMode: setupMode === "simple" || buildMode === "infinite" ? "manual_rounds" : buildMode,
        gameMode,
        teamNames: gameMode === "teams" ? cleanTeamNames : [],
        countdownSeconds,
        answerSeconds,
        audioMode,
      }

      if (setupMode === "simple") {
        if (simpleFeasibilityBusy) {
          setCreateError(
            simpleGameType === "infinite"
              ? "Still checking how many questions are available for this pack choice."
              : simpleGameType === "heads_up"
                ? "Still checking the selected Heads Up pack."
                : "Still checking which round templates are ready for this pack choice."
          )
          setCreating(false)
          return
        }

        if (simpleGameType === "infinite") {
          if (simpleCandidateCount <= 0) {
            setCreateError("No questions are available in the current pack choice.")
            setCreating(false)
            return
          }

          const requestedCount = simpleInfiniteQuestionLimit == null ? simpleCandidateCount : simpleInfiniteQuestionLimit
          if (!Number.isFinite(requestedCount) || requestedCount < 1) {
            setCreateError("Total questions must be blank, or at least 1.")
            setCreating(false)
            return
          }

          payload = {
            ...payload,
            selectedPacks: simpleSelectedPackIds,
            manualRounds: [
              {
                id: "simple_infinite_round",
                name: "Infinite",
                questionCount: Math.min(requestedCount, simpleCandidateCount),
                behaviourType: "standard",
                jokerEligible: false,
                countsTowardsScore: true,
                sourceMode: "selected_packs",
                packIds: [],
                selectionRules: {},
                answerSeconds: getDefaultAnswerSecondsForBehaviour("standard"),
                roundReviewSeconds: getDefaultRoundReviewSecondsForBehaviour("standard"),
              },
            ],
          }
        } else if (simpleGameType === "heads_up") {
          if (!simpleHeadsUpPackId) {
            setCreateError("Choose a Heads Up pack first.")
            setCreating(false)
            return
          }

          if (simpleCandidateCount <= 0) {
            setCreateError("No active Heads Up cards are available in the selected pack.")
            setCreating(false)
            return
          }

          const selectedHeadsUpPack = headsUpPacks.find((pack) => pack.id === simpleHeadsUpPackId)
          payload = {
            ...payload,
            selectedPacks: [],
            manualRounds: [
              {
                id: "simple_heads_up_round",
                name: selectedHeadsUpPack?.name?.trim() || "Heads Up",
                questionCount: 0,
                behaviourType: "heads_up",
                jokerEligible: false,
                countsTowardsScore: false,
                sourceMode: "specific_packs",
                packIds: [simpleHeadsUpPackId],
                selectionRules: {},
                answerSeconds: 60,
                roundReviewSeconds: getDefaultRoundReviewSecondsForBehaviour("heads_up"),
                headsUpTvDisplayMode: "timer_only",
              },
            ],
          }
        } else {
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
        }
      } else if (buildMode === "infinite") {
        const requestedCount = advancedInfiniteQuestionLimit == null ? simpleCandidateCount : advancedInfiniteQuestionLimit

        if (selectPacks && simpleSelectedPackIds.length === 0) {
          setCreateError("Select at least one pack, or use all active packs.")
          setCreating(false)
          return
        }

        if (simpleCandidateCount <= 0) {
          setCreateError("No questions are available in the current pack choice.")
          setCreating(false)
          return
        }

        if (!Number.isFinite(requestedCount) || requestedCount < 1) {
          setCreateError("Total questions must be blank, or at least 1.")
          setCreating(false)
          return
        }

        payload = {
          ...payload,
          selectedPacks: simpleSelectedPackIds,
          manualRounds: [
            {
              id: "simple_infinite_round",
              name: "Infinite",
              questionCount: Math.min(requestedCount, simpleCandidateCount),
              behaviourType: "standard",
              jokerEligible: false,
              countsTowardsScore: true,
              sourceMode: "selected_packs",
              packIds: [],
              selectionRules: {},
              answerSeconds: getDefaultAnswerSecondsForBehaviour("standard"),
              roundReviewSeconds: getDefaultRoundReviewSecondsForBehaviour("standard"),
            },
          ],
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

  async function sendHeadsUpAction(action: string, extra: Record<string, unknown> = {}) {
    if (!roomCode) return
    setForcingClose(true)
    setForceCloseError(null)
    try {
      const res = await fetch("/api/room/heads-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode, action, ...extra }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setForceCloseError(String(data?.error ?? "Could not update Heads Up."))
      }
    } catch {
      setForceCloseError("Could not update Heads Up.")
    } finally {
      setForcingClose(false)
    }
  }

  async function endGameNow() {
    if (!roomCode) return
    setEndingGame(true)
    setForceCloseError(null)
    try {
      const res = await fetch("/api/room/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setForceCloseError(data?.error ?? "Could not end game.")
        return
      }
      if (data?.ended === false) {
        setForceCloseError(data?.reason === "not_running" ? "The game is not currently running." : "Could not end game.")
      }
    } catch {
      setForceCloseError("Could not end game.")
    } finally {
      setEndingGame(false)
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

  const roomIsInfinite = Boolean(roomState?.mode?.isInfinite)
  const roomProgressLabel = String(roomState?.progress?.label ?? "").trim()
  const roomJokerEnabled = Boolean(roomState?.rounds?.jokerEnabled)
  const roomJokerEligibleCount = Math.max(0, Number(roomState?.rounds?.jokerEligibleCount ?? 0) || 0)
  const roomHeadsUp = roomState?.headsUp ?? null
  const roomIsHeadsUp = String(roomState?.rounds?.current?.behaviourType ?? "").trim().toLowerCase() === "heads_up"

  const stagePill = useMemo(() => {
    return getRoomStagePillLabel({
      phase: roomPhase,
      stage: roomStage,
      isInfiniteMode: roomIsInfinite,
      isLastQuestionOverall: Boolean(roomState?.flow?.isLastQuestionOverall),
    })
  }, [roomIsInfinite, roomPhase, roomStage, roomState?.flow?.isLastQuestionOverall])

  const hasRoom = Boolean(roomCode)
  const selectedPackCount = packs.filter((p) => selectedPacks[p.id]).length
  const packNameById = useMemo(() => new Map(packs.map((pack) => [pack.id, pack.display_name])), [packs])
  const activeManualPackPickerRound = useMemo(() => {
    if (!manualPackPickerRoundId) return null
    return manualRounds.find((round) => round.id === manualPackPickerRoundId) ?? null
  }, [manualPackPickerRoundId, manualRounds])
  const filteredManualPackPacks = useMemo(() => {
    const query = manualPackPickerSearch.trim().toLowerCase()
    if (!query) return packs
    return packs.filter((pack) => pack.display_name.toLowerCase().includes(query))
  }, [manualPackPickerSearch, packs])
  const manualPackPickerSelectedCount = activeManualPackPickerRound?.packIds.length ?? 0
  const canStart = hasRoom && roomPhase === "lobby" && !starting
  const canContinue =
    hasRoom &&
    roomPhase === "running" &&
    !roomIsHeadsUp &&
    ["open", "round_summary", "needs_advance"].includes(roomStage) &&
    !forcingClose
  const canEndGame = hasRoom && roomPhase === "running" && roomIsInfinite && !endingGame
  const canAdvanceHeadsUpSummary = hasRoom && roomPhase === "running" && roomIsHeadsUp && roomStage === "round_summary" && !forcingClose
  const headsUpRoundCompleteReason = String(roomHeadsUp?.roundCompleteReason ?? "").trim()

  const headsUpHostButtons = roomIsHeadsUp
    ? {
        canStartTurn: roomStage === "heads_up_ready" && !forcingClose,
        canEndTurn: roomStage === "heads_up_live" && !forcingClose,
        canUndo: roomStage === "heads_up_live" && Array.isArray(roomHeadsUp?.currentTurnActions) && roomHeadsUp.currentTurnActions.length > 0 && !forcingClose,
        canConfirmTurn: roomStage === "heads_up_review" && !forcingClose,
      }
    : null

  const headsUpReviewSignature = useMemo(
    () =>
      JSON.stringify(
        Array.isArray(roomHeadsUp?.currentTurnActions)
          ? roomHeadsUp.currentTurnActions.map((item: any) => `${String(item.questionId ?? "")}:${String(item.action ?? "")}`)
          : []
      ),
    [roomHeadsUp?.currentTurnActions]
  )

  const continueLabel =
    roomStage === "open"
      ? forcingClose
        ? "Moving on..."
        : "Reveal answer"
      : roomStage === "round_summary"
        ? forcingClose
          ? "Moving on..."
          : Boolean(roomState?.flow?.isLastQuestionOverall)
            ? roomIsInfinite ? "Finish game" : "Finish now"
            : "Skip round review"
        : forcingClose
          ? "Moving on..."
          : Boolean(roomState?.flow?.isLastQuestionOverall)
            ? roomIsInfinite ? "Finish game" : "Finish now"
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
    roomIsHeadsUp && roomPhase === "running"
      ? roomStage === "heads_up_ready"
        ? "The next guesser starts the turn from their phone when they are ready. Use Force start only as a fallback."
        : roomStage === "heads_up_live"
          ? "The turn is live. The active guesser controls Correct and Pass from their phone."
          : roomStage === "heads_up_review"
            ? "Review the turn log, correct any mistakes if needed, then confirm it. The round will continue automatically after a longer review pause unless you move on sooner."
            : headsUpRoundCompleteReason === "card_pool_exhausted"
              ? "This Heads Up round has run out of active cards before every player has taken a turn. Continue to the next round, then add more cards to this pack if you want longer Heads Up rounds."
              : "The Heads Up round is finished. Continue when you are ready."
      : roomPhase === "lobby"
      ? roomIsInfinite
        ? "Players can still join. When you are ready, start the infinite run from the host controls."
        : "Players can still join. When you are ready, start the game from the host controls."
      : roomPhase === "running"
        ? roomIsInfinite
          ? "Infinite mode runs as one continuous stream of questions. End the game whenever you want, or let it finish when the question pool runs out."
          : "Questions move on automatically between questions. End of round waits for the host or the round review timer."
        : roomIsInfinite
          ? "The infinite run is finished. Reset the room to play again with the same teams."
          : "The game is finished. Reset the room to play again with the same teams."


  const headsUpReviewAutoAdvanceAtMs = roomHeadsUp?.reviewAutoAdvanceAt ? Date.parse(String(roomHeadsUp.reviewAutoAdvanceAt)) : Number.NaN
  const headsUpReviewCountdownSeconds = Number.isFinite(headsUpReviewAutoAdvanceAtMs)
    ? Math.max(0, Math.ceil((headsUpReviewAutoAdvanceAtMs - Date.now()) / 1000))
    : 0

  useEffect(() => {
    if (!roomCode || !roomIsHeadsUp || roomStage !== "heads_up_review" || forcingClose) return

    const reviewAtMs = roomHeadsUp?.reviewAutoAdvanceAt ? Date.parse(String(roomHeadsUp.reviewAutoAdvanceAt)) : Number.NaN
    const delayMs = Number.isFinite(reviewAtMs) ? Math.max(0, reviewAtMs - Date.now()) : 10000

    const timeoutId = window.setTimeout(() => {
      fetch("/api/room/heads-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode, action: "host_confirm_turn" }),
      }).catch(() => {})
    }, delayMs)

    return () => window.clearTimeout(timeoutId)
  }, [forcingClose, headsUpReviewSignature, roomCode, roomHeadsUp?.currentTurnIndex, roomHeadsUp?.reviewAutoAdvanceAt, roomIsHeadsUp, roomStage])

  const roomModeSummary = getRunModeSummaryLabel({
    isInfiniteMode: roomIsInfinite,
    behaviourType: roomState?.rounds?.current?.behaviourType,
  })
  const roomJokerSummary = roomIsHeadsUp
    ? "Turn-based clue round."
    : roomIsInfinite
      ? "Joker hidden in Infinite mode."
      : roomJokerEnabled
        ? `${roomJokerEligibleCount} Joker-eligible round${roomJokerEligibleCount === 1 ? "" : "s"}.`
        : "Joker hidden because fewer than two rounds are Joker-eligible."

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

  const simpleReadyLabel = simpleGameType === "infinite"
    ? simpleCandidateCount > 0
      ? "Ready to create"
      : "Needs changes"
    : simpleGameType === "heads_up"
      ? simpleCandidateCount > 0 && simpleHeadsUpPackId
        ? "Ready to create"
        : "Needs changes"
      : simpleTemplatePlan.rounds.length > 0
        ? "Ready to create"
        : "Needs changes"

  const simpleJokerSummary = simpleGameType === "heads_up"
    ? "Joker hidden in Heads Up"
    : simpleTemplatePlan.jokerEligibleCount >= 2
      ? `Joker available in ${simpleTemplatePlan.jokerEligibleCount} round${simpleTemplatePlan.jokerEligibleCount === 1 ? "" : "s"}`
      : "Joker hidden for this game"

  const simpleTimingSummary = simpleGameType === "heads_up"
    ? "Heads Up quick play uses 60 second turns, timer-only TV, and the normal Heads Up end-of-turn review."
    : simpleTemplatePlan.quickfireCount > 0
      ? "Standard rounds use 20 second answers and 30 second reviews. Quickfire uses 10 second answers and 45 second round reviews."
      : "Standard rounds use 20 second answers and 30 second round reviews."

  const simpleGameSummaryText = simpleGameType === "heads_up"
    ? simpleCandidateCount > 0
      ? `This game will start a quick Heads Up round using ${headsUpPacks.find((pack) => pack.id === simpleHeadsUpPackId)?.name ?? "the selected pack"}, with ${simpleCandidateCount} active card${simpleCandidateCount === 1 ? "" : "s"}, 60 second turns, and timer-only TV.`
      : "Simple mode will start a quick Heads Up round as soon as the selected pack has active cards."
    : simpleTemplatePlan.rounds.length > 0
      ? `This game will create ${simpleRoundCount} round${simpleRoundCount === 1 ? "" : "s"}: ${simpleTemplatePlan.standardCount} Standard and ${simpleTemplatePlan.quickfireCount} Quickfire, using ${simplePackScopeText}, with ${audioModeLabel(audioMode)} audio and sensible default timings.`
      : "Simple mode will build a game from ready templates as soon as the current pack choice supports it."

  const simpleInfiniteSummaryText = simpleCandidateCount > 0
    ? simpleInfiniteQuestionLimit == null
      ? `This game will keep moving through every available question from ${simplePackScopeText}. Joker is hidden, there are no round breaks, and audio plays on ${audioModeLabel(audioMode)}.`
      : simpleInfiniteQuestionLimit > simpleCandidateCount
        ? `This game asked for ${simpleInfiniteQuestionLimit} questions, but only ${simpleCandidateCount} are available in ${simplePackScopeText}, so it will use them all in one continuous run with Joker hidden and ${audioModeLabel(audioMode)} audio.`
        : `This game will run as one continuous question stream for ${simpleInfiniteResolvedQuestionCount} question${simpleInfiniteResolvedQuestionCount === 1 ? "" : "s"} from ${simplePackScopeText}. Joker is hidden, there are no round breaks, and audio plays on ${audioModeLabel(audioMode)}.`
    : "Infinite mode will use every available question from the chosen packs once the current pack choice contains at least one question."

  return (
    <PageShell width="full" contentClassName="max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Host</h1>
          <p className="mt-1 text-sm text-muted-foreground">Start a new game, share the room code, and run the quiz.</p>
        </div>

        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          Back to home
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {!hasRoom ? (
            <Card className={setupMode === "advanced" ? "border-0 bg-transparent" : undefined}>
              <CardHeader className={setupMode === "advanced" ? "border-b-0 px-0 pb-4 pt-0" : undefined}>
                <CardTitle>Start a new game</CardTitle>
                <div className="mt-1 text-sm text-muted-foreground">{setupMode === "simple" ? "Use the guided path for a quick setup." : "Build on the left. Use the right side for your question pool and recovery tools."}</div>
              </CardHeader>

              <CardContent className={setupMode === "advanced" ? "space-y-6 px-0 py-0" : "space-y-4"}>
                <div className="rounded-2xl border border-border p-3">
                  <div className="text-sm font-semibold text-foreground">Game basics</div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">Mode</div>
                      <SelectControl value={gameMode} onChange={(e) => setGameMode(e.target.value as GameMode)} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                        <option value="teams">Teams</option>
                        <option value="solo">No teams</option>
                      </SelectControl>
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
                      <div className="text-sm font-semibold text-foreground">Choose setup path</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {setupMode === "simple"
                          ? "Quick host flow for automatic quiz setup, quick Heads Up, or one continuous Infinite run."
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

                {setupMode === "advanced" ? (
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="text-sm font-semibold text-foreground">Advanced setup</div>
                    <div className="mt-1 text-sm text-muted-foreground">Choose a build method, then work in the matching builder below. The right side is for question-pool support, not the main workflow.</div>
                  </div>
                ) : null}

                {setupMode === "simple" ? (
                  <>
                    <div className="rounded-2xl border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">3</span>
                            <div className="text-sm font-semibold text-foreground">Choose game type</div>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Pick what sort of session you want to run. Recommended builds a full quiz for you, Heads Up starts a clueing game, and Infinite runs one long stream without round setup.
                          </div>
                        </div>
                        <div className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-sky-400/50 bg-gradient-to-r from-sky-500/20 to-cyan-500/20 px-3 py-1 text-sm font-semibold leading-none text-sky-100 shadow-sm shadow-sky-950/20">
                          {simpleGameType === "infinite"
                            ? simpleFeasibilityBusy
                              ? "Checking..."
                              : simpleInfiniteQuestionLimit == null
                                ? simpleCandidateCount > 0
                                  ? `${simpleCandidateCount} available`
                                  : "Question pool"
                                : `${simpleInfiniteResolvedQuestionCount} questions`
                            : simpleGameType === "heads_up"
                              ? simpleFeasibilityBusy
                                ? "Checking..."
                                : simpleCandidateCount > 0
                                  ? `${simpleCandidateCount} cards`
                                  : "Heads Up pack"
                              : `${simpleRoundCount} rounds`}
                        </div>
                      </div>                      <div className="mt-3 grid gap-3 lg:grid-cols-3">
                        <label
                          className={`rounded-2xl border p-4 text-sm shadow-sm transition-colors ${simpleGameType === "recommended" ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted"}`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="radio"
                              name="simple-game-type"
                              checked={simpleGameType === "recommended"}
                              onChange={() => setSimpleGameType("recommended")}
                              className="mt-0.5"
                            />
                            <div>
                              <div className="font-medium text-foreground">Recommended quiz</div>
                              <div className="mt-1 text-xs text-muted-foreground">Automatic round plan using ready templates and sensible defaults.</div>
                            </div>
                          </div>
                        </label>

                        <label
                          className={`rounded-2xl border p-4 text-sm shadow-sm transition-colors ${simpleGameType === "heads_up" ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted"}`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="radio"
                              name="simple-game-type"
                              checked={simpleGameType === "heads_up"}
                              onChange={() => setSimpleGameType("heads_up")}
                              className="mt-0.5"
                            />
                            <div>
                              <div className="font-medium text-foreground">Heads Up</div>
                              <div className="mt-1 text-xs text-muted-foreground">Quick host flow for one themed clueing pack with default settings.</div>
                            </div>
                          </div>
                        </label>

                        <label
                          className={`rounded-2xl border p-4 text-sm shadow-sm transition-colors ${simpleGameType === "infinite" ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted"}`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="radio"
                              name="simple-game-type"
                              checked={simpleGameType === "infinite"}
                              onChange={() => setSimpleGameType("infinite")}
                              className="mt-0.5"
                            />
                            <div>
                              <div className="font-medium text-foreground">Infinite run</div>
                              <div className="mt-1 text-xs text-muted-foreground">One continuous stream of questions without round setup.</div>
                            </div>
                          </div>
                        </label>
                      </div>

                      {simpleGameType === "recommended" ? (
                        <div className="mt-4 rounded-2xl border border-border bg-card/70 p-4">
                          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                            <div>
                              <div className="text-sm font-medium text-foreground">Rounds</div>
                              <SelectControl
                                value={roundCountStr}
                                onChange={(e) => setRoundCountStr(e.target.value)}
                                className="mt-1"
                              >
                                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
                                  <option key={count} value={String(count)}>
                                    {count}
                                  </option>
                                ))}
                              </SelectControl>
                              <div className="mt-1 text-xs text-muted-foreground">Four or five rounds usually feels best for a normal game.</div>
                            </div>

                            <div>
                              <div className="text-sm font-medium text-foreground">Quiz feel</div>
                              <div className="mt-1 text-xs text-muted-foreground">This only affects the Recommended quiz. It changes how often Quickfire appears when the ready template pool supports it.</div>
                              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                {SIMPLE_PRESET_OPTIONS.map((preset) => {
                                  const selected = simplePreset === preset.value
                                  const label =
                                    preset.value === "classic"
                                      ? "Mostly standard"
                                      : preset.value === "balanced"
                                        ? "Balanced mix"
                                        : "More Quickfire"
                                  const description =
                                    preset.value === "classic"
                                      ? "Closer to a classic quiz."
                                      : preset.value === "balanced"
                                        ? "Standard rounds with some Quickfire."
                                        : "Use more Quickfire where possible."

                                  return (
                                    <label
                                      key={preset.value}
                                      className={`rounded-xl border p-3 text-sm transition-colors ${selected ? "border-foreground bg-muted" : "border-border bg-background hover:bg-muted"}`}
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
                                          <div className="font-medium text-foreground">{label}</div>
                                          <div className="mt-1 text-xs text-muted-foreground">{description}</div>
                                        </div>
                                      </div>
                                    </label>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : simpleGameType === "heads_up" ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <div className="text-sm font-medium text-foreground">Heads Up pack</div>
                            <SelectControl
                              value={simpleHeadsUpPackId}
                              onChange={(e) => setSimpleHeadsUpPackId(e.target.value)}
                              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                            >
                              <option value="">Choose a Heads Up pack</option>
                              {headsUpPacks.map((pack) => (
                                <option key={pack.id} value={pack.id}>{pack.name}</option>
                              ))}
                            </SelectControl>
                            <div className="mt-1 text-xs text-muted-foreground">Quick play uses one Heads Up pack, 60 second turns, and timer-only TV by default.</div>
                          </div>
                          <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
                            Heads Up quick play is ready for a fast host flow. No extra round builder steps, Joker stays hidden, and solo mode still works if you do not want teams.
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <div className="text-sm font-medium text-foreground">Total questions asked</div>
                            <Input
                              value={simpleInfiniteQuestionLimitStr}
                              onChange={(e) => setSimpleInfiniteQuestionLimitStr(e.target.value.replace(/[^0-9]/g, ""))}
                              inputMode="numeric"
                              placeholder="Blank = every available question"
                            />
                            <div className="mt-1 text-xs text-muted-foreground">Leave this blank to use the full pool from the chosen packs once each.</div>
                          </div>
                          <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
                            Infinite uses the normal question flow. It just removes round planning, so the game keeps moving until the chosen question limit is reached. Choose where audio should play below.
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-border p-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">4</span>
                        <div className="text-sm font-semibold text-foreground">Audio</div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">Choose where audio questions should play for this game.</div>
                      <div className="mt-3 max-w-sm">
                        <div className="text-sm font-medium text-foreground">Audio mode</div>
                        <SelectControl value={audioMode} onChange={(e) => setAudioMode(e.target.value as AudioMode)} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                          <option value="display">TV display only</option>
                          <option value="phones">Phones only</option>
                          <option value="both">TV and phones</option>
                        </SelectControl>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">5</span>
                            <div className="text-sm font-semibold text-foreground">Question pool</div>
                          </div>
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

                    <div className="rounded-2xl border border-border">
                      <button
                        type="button"
                        className="flex w-full items-start justify-between gap-3 p-3 text-left"
                        onClick={() => setShowSimpleGameSummary((prev) => !prev)}
                      >
                        <div>
                          <div className="text-sm font-semibold text-foreground">Preview game</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {simpleGameType === "infinite"
                              ? "Open to preview the question pool and continuous-run behaviour."
                              : simpleGameType === "heads_up"
                                ? "Open to preview the quick Heads Up setup."
                                : "Open to preview the game that Simple mode will create."}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                            {simpleReadyLabel}
                          </div>
                          <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                            {showSimpleGameSummary ? "Hide" : "Show"}
                          </div>
                        </div>
                      </button>

                      {showSimpleGameSummary ? (
                        <div className="border-t border-border p-3">
                          {simpleFeasibilityBusy ? (
                            <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
                              {simpleGameType === "infinite" ? "Checking question pool..." : "Checking ready templates..."}
                            </div>
                          ) : simpleFeasibilityError ? (
                            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{simpleFeasibilityError}</div>
                          ) : simpleGameType === "infinite" ? (
                            <div className="space-y-3">
                              <div className="rounded-xl border border-border bg-card p-3 text-sm text-foreground">{simpleInfiniteSummaryText}</div>
                              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                <div className="rounded-xl border border-border bg-card p-3">
                                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Question pool</div>
                                  <div className="mt-1 text-sm font-medium text-foreground">{simpleFeasibilityBusy ? "Checking..." : `${simpleCandidateCount} available`}</div>
                                </div>
                                <div className="rounded-xl border border-border bg-card p-3">
                                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Questions asked</div>
                                  <div className="mt-1 text-sm font-medium text-foreground">
                                    {simpleInfiniteQuestionLimit == null ? "All available" : simpleInfiniteResolvedQuestionCount}
                                  </div>
                                </div>
                                <div className="rounded-xl border border-border bg-card p-3">
                                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Packs</div>
                                  <div className="mt-1 text-sm font-medium text-foreground">{!selectPacks ? "All active packs" : selectedPackCount > 0 ? `${selectedPackCount} selected` : "Choose pack"}</div>
                                </div>
                                <div className="rounded-xl border border-border bg-card p-3">
                                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Audio</div>
                                  <div className="mt-1 text-sm font-medium text-foreground">{audioModeLabel(audioMode)}</div>
                                </div>
                              </div>
                              <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
                                Standard timing stays in place, with 20 second answers, 30 second reveals, and a single end-of-game summary when the continuous run finishes.
                              </div>
                            </div>
                          ) : simpleGameType === "heads_up" ? (
                            <div className="space-y-3">
                              <div className="rounded-xl border border-border bg-card p-3 text-sm text-foreground">{simpleGameSummaryText}</div>
                              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                <div className="rounded-xl border border-border bg-card p-3">
                                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Pack</div>
                                  <div className="mt-1 text-sm font-medium text-foreground">{headsUpPacks.find((pack) => pack.id === simpleHeadsUpPackId)?.name ?? "Choose pack"}</div>
                                </div>
                                <div className="rounded-xl border border-border bg-card p-3">
                                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Cards</div>
                                  <div className="mt-1 text-sm font-medium text-foreground">{simpleFeasibilityBusy ? "Checking..." : `${simpleCandidateCount} active`}</div>
                                </div>
                                <div className="rounded-xl border border-border bg-card p-3">
                                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Turns</div>
                                  <div className="mt-1 text-sm font-medium text-foreground">60 seconds</div>
                                </div>
                                <div className="rounded-xl border border-border bg-card p-3">
                                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">TV</div>
                                  <div className="mt-1 text-sm font-medium text-foreground">Timer only</div>
                                </div>
                              </div>
                              <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">{simpleTimingSummary}</div>
                            </div>
                          ) : simpleTemplatePlan.rounds.length > 0 ? (
                            <div className="space-y-3">
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
                                  <div className="mt-1 text-sm font-medium text-foreground">{audioModeLabel(audioMode)}</div>
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
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                              {simpleTemplatePlan.error ?? "No simple plan is ready yet."}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>

                    {simpleGameType === "recommended" ? (
                      <div className="rounded-2xl border border-border">
                        <button
                          type="button"
                          className="flex w-full items-start justify-between gap-3 p-3 text-left"
                          onClick={() => setShowSimpleRecommendedRounds((prev) => !prev)}
                        >
                          <div>
                            <div className="text-sm font-semibold text-foreground">Preview rounds</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Ready now: {simpleTemplatePlan.availableTemplateCount} template{simpleTemplatePlan.availableTemplateCount === 1 ? "" : "s"}, with {simpleTemplatePlan.availableStandardCount} standard and {simpleTemplatePlan.availableQuickfireCount} Quickfire.
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                              {simpleTemplatePlan.jokerEligibleCount >= 2 ? "Joker ready" : "Joker hidden"}
                            </div>
                            <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                              {showSimpleRecommendedRounds ? "Hide" : "Show"}
                            </div>
                          </div>
                        </button>

                        {showSimpleRecommendedRounds ? (
                          <div className="border-t border-border p-3">
                            {simpleFeasibilityBusy ? (
                              <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">Checking ready templates...</div>
                            ) : simpleFeasibilityError ? (
                              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{simpleFeasibilityError}</div>
                            ) : simpleTemplatePlan.rounds.length > 0 ? (
                              <div className="space-y-3">
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
                                        {round.behaviourType === "heads_up" ? "All active cards from the selected pack." : `${round.questionCount} question${round.questionCount === 1 ? "" : "s"}.`} {round.answerSeconds}s {round.behaviourType === "heads_up" ? "turn" : "answer window"}, {round.roundReviewSeconds}s round review.
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
                                  Simple mode uses the audio setting you choose here, standard timing defaults, and only templates that are currently feasible for the chosen pack scope.
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                                {simpleTemplatePlan.error ?? "No simple plan is ready yet."}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-sm font-semibold text-foreground">1. Choose a build method</div>
                  <div className="mt-1 text-sm text-muted-foreground">Pick one route. Only the matching builder stays on screen below.</div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className={`rounded-2xl border p-3 text-sm transition-colors ${buildMode === "manual_rounds" ? "border-foreground bg-muted" : "border-border bg-background hover:bg-muted"}`}>
                      <div className="flex items-start gap-2">
                        <input type="radio" name="build-mode" checked={buildMode === "manual_rounds"} onChange={() => setBuildMode("manual_rounds")} className="mt-0.5" />
                        <div>
                          <div className="font-medium text-foreground">Manual rounds</div>
                          <div className="mt-1 text-xs text-muted-foreground">Build each round directly. Packs stay as sources and metadata decides eligibility.</div>
                        </div>
                      </div>
                    </label>
                    <label className={`rounded-2xl border p-3 text-sm transition-colors ${buildMode === "quick_random" ? "border-foreground bg-muted" : "border-border bg-background hover:bg-muted"}`}>
                      <div className="flex items-start gap-2">
                        <input type="radio" name="build-mode" checked={buildMode === "quick_random"} onChange={() => setBuildMode("quick_random")} className="mt-0.5" />
                        <div>
                          <div className="font-medium text-foreground">Quick random</div>
                          <div className="mt-1 text-xs text-muted-foreground">Choose packs and let templates or a generic plan build the game for you.</div>
                        </div>
                      </div>
                    </label>
                    <label className={`rounded-2xl border p-3 text-sm transition-colors ${buildMode === "infinite" ? "border-foreground bg-muted" : "border-border bg-background hover:bg-muted"}`}>
                      <div className="flex items-start gap-2">
                        <input type="radio" name="build-mode" checked={buildMode === "infinite"} onChange={() => setBuildMode("infinite")} className="mt-0.5" />
                        <div>
                          <div className="font-medium text-foreground">Infinite</div>
                          <div className="mt-1 text-xs text-muted-foreground">Run one continuous stream of questions from the chosen packs, with no round setup.</div>
                        </div>
                      </div>
                    </label>
                    <label className={`rounded-2xl border p-3 text-sm transition-colors ${buildMode === "legacy_pack_mode" ? "border-foreground bg-muted" : "border-border bg-background hover:bg-muted"}`}>
                      <div className="flex items-start gap-2">
                        <input type="radio" name="build-mode" checked={buildMode === "legacy_pack_mode"} onChange={() => setBuildMode("legacy_pack_mode")} className="mt-0.5" />
                        <div>
                          <div className="font-medium text-foreground">Legacy pack mode</div>
                          <div className="mt-1 text-xs text-muted-foreground">Use the older pack-based builder with optional per-pack counts while you transition.</div>
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {buildMode === "infinite" ? (
                  <div className="rounded-2xl border border-border p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-sm font-medium text-foreground">Total questions asked</div>
                        <Input
                          value={advancedInfiniteQuestionLimitStr}
                          onChange={(e) => setAdvancedInfiniteQuestionLimitStr(e.target.value.replace(/[^0-9]/g, ""))}
                          inputMode="numeric"
                          placeholder="Blank = every available question"
                        />
                        <div className="mt-1 text-xs text-muted-foreground">Leave this blank to use the full pool from the chosen packs once each.</div>
                      </div>
                      <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
                        Infinite advanced mode still uses the same round-plan engine underneath. It creates one continuous standard run with Joker hidden and no manual round setup.
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl border border-border bg-card p-3 text-sm">
                      {simpleFeasibilityBusy ? (
                        <div className="text-muted-foreground">Checking how many questions are available...</div>
                      ) : simpleCandidateCount > 0 ? (
                        <div className="space-y-1">
                          <div className="text-foreground">{advancedInfiniteQuestionLimit == null ? `${simpleCandidateCount} question${simpleCandidateCount === 1 ? "" : "s"} available for this run.` : `${advancedInfiniteResolvedQuestionCount} question${advancedInfiniteResolvedQuestionCount === 1 ? "" : "s"} will be used.`}</div>
                          <div className="text-xs text-muted-foreground">Audio plays on {audioModeLabel(audioMode)}. Joker stays hidden in Infinite mode.</div>
                        </div>
                      ) : (
                        <div className="text-amber-700 dark:text-amber-200">No questions are available in the current pack choice.</div>
                      )}
                    </div>
                  </div>
                ) : null}

                {buildMode === "manual_rounds" ? (
                  <div className="rounded-2xl border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">2. Build the rounds</div>
                        <div className="mt-1 text-xs text-muted-foreground">Add rounds one at a time. Templates and pack choices live inside each round card.</div>
                      </div>
                      <Button variant="secondary" onClick={addManualRound}>Add round</Button>
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <div>Total questions from rounds: {manualRoundsTotal}. {manualJokerNote}</div>
                      {quickfireCount > 0 ? <div>Quickfire skips Joker, skips per-question reveals, and only pulls MCQ questions. Audio is allowed only when media_duration_ms is set and the clip is 5 seconds or shorter.</div> : null}
                    </div>

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

                    <div className="mt-3 space-y-3">
                      {manualRounds.map((round, index) => {
                        const feasibility = manualFeasibilityById.get(round.id)
                        const filterCount = countManualRoundFilters(round)
                        const packPreview = round.packIds.slice(0, 2).map((packId) => packNameById.get(packId)).filter(Boolean).join(", ")
                        const templateChoice = roundTemplateSelections[round.id] ?? templates[0]?.id ?? ""
                        return (
                          <div key={round.id} className="rounded-2xl border border-border bg-card p-4">
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

                            <div className="mt-3 rounded-xl border border-border bg-background p-3">
                              <div className="flex flex-wrap items-end gap-2">
                                <div className="min-w-[220px] flex-1">
                                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Template for this round</div>
                                  <SelectControl
                                    value={templateChoice}
                                    onChange={(e) => setRoundTemplateSelections((prev) => ({ ...prev, [round.id]: e.target.value }))}
                                    className="mt-1"
                                    compact
                                    disabled={!templates.length}
                                  >
                                    {templates.length === 0 ? <option value="">No active templates</option> : null}
                                    {templates.map((template) => (
                                      <option key={template.id} value={template.id}>{template.name}</option>
                                    ))}
                                  </SelectControl>
                                </div>
                                <Button variant="secondary" size="sm" onClick={() => applyTemplateToManualRound(round.id, templateChoice)} disabled={!templateChoice}>Apply template</Button>
                              </div>
                            </div>

                            <div className="mt-3 grid gap-3 lg:grid-cols-3">
                              <div>
                                <div className="text-sm font-medium text-foreground">Name</div>
                                <Input value={round.name} onChange={(e) => updateManualRound(round.id, { name: e.target.value })} placeholder={defaultRoundName(index)} />
                              </div>
                              <div>
                                <div className="text-sm font-medium text-foreground">{round.behaviourType === "heads_up" ? "Cards" : "Questions"}</div>
                                {round.behaviourType === "heads_up" ? (
                                  <div className="mt-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                                    Uses all active cards from the selected pack.
                                  </div>
                                ) : (
                                  <Input value={round.questionCountStr} onChange={(e) => updateManualRound(round.id, { questionCountStr: e.target.value })} inputMode="numeric" />
                                )}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-foreground">Behaviour</div>
                                <SelectControl value={round.behaviourType} onChange={(e) => updateManualRound(round.id, { behaviourType: e.target.value as RoundBehaviourType })} className="mt-1">
                                  {ROUND_BEHAVIOUR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </SelectControl>
                                <div className="mt-1 text-xs text-muted-foreground">{getManualRoundTimingSummary(round)}</div>
                              </div>
                            </div>

                            {round.behaviourType === "heads_up" ? (
                              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <div>
                                  <div className="text-sm font-medium text-foreground">Heads Up pack</div>
                                  <SelectControl
                                    value={round.packIds[0] ?? ""}
                                    onChange={(e) => updateManualRound(round.id, { packIds: e.target.value ? [e.target.value] : [] })}
                                    className="mt-1"
                                  >
                                    <option value="">Choose one pack</option>
                                    {headsUpPacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
                                  </SelectControl>
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-foreground">Difficulty</div>
                                  <SelectControl value={round.headsUpDifficulty} onChange={(e) => updateManualRound(round.id, { headsUpDifficulty: e.target.value as ManualRoundDraft["headsUpDifficulty"] })} className="mt-1">
                                    {HEADS_UP_DIFFICULTY_OPTIONS.map((option) => <option key={option.value || "blank"} value={option.value}>{option.label}</option>)}
                                  </SelectControl>
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-foreground">Turn length</div>
                                  <SelectControl value={String(round.headsUpTurnSeconds)} onChange={(e) => updateManualRound(round.id, { headsUpTurnSeconds: e.target.value === "90" ? 90 : 60 })} className="mt-1">
                                    {HEADS_UP_TURN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                  </SelectControl>
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-foreground">TV display</div>
                                  <SelectControl value={round.headsUpTvDisplayMode} onChange={(e) => updateManualRound(round.id, { headsUpTvDisplayMode: e.target.value as ManualRoundDraft["headsUpTvDisplayMode"] })} className="mt-1">
                                    {HEADS_UP_TV_DISPLAY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                  </SelectControl>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                                <div className="rounded-xl border border-border bg-background p-3">
                                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Question pool</div>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => updateManualRound(round.id, { sourceMode: "specific_packs" })}
                                      className={`rounded-full border px-3 py-1 text-xs ${round.sourceMode === "specific_packs" ? "border-foreground bg-muted text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
                                    >
                                      Chosen packs
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => updateManualRound(round.id, { sourceMode: "all_questions", packIds: [] })}
                                      className={`rounded-full border px-3 py-1 text-xs ${round.sourceMode === "all_questions" ? "border-foreground bg-muted text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
                                    >
                                      All active packs
                                    </button>
                                  </div>
                                  {round.sourceMode === "specific_packs" ? (
                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3">
                                      <div>
                                        <div className="text-sm font-medium text-foreground">
                                          {round.packIds.length > 0 ? `${round.packIds.length} selected pack${round.packIds.length === 1 ? "" : "s"}` : "No packs selected yet"}
                                        </div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                          {packPreview || "Choose the packs that should feed this round."}
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        {index > 0 ? (
                                          <Button variant="secondary" size="sm" onClick={() => setManualRoundPacks(round.id, manualRounds[index - 1]?.packIds ?? [])}>
                                            Copy previous
                                          </Button>
                                        ) : null}
                                        <Button variant="secondary" size="sm" onClick={() => openManualRoundPackPicker(round.id)}>
                                          Choose packs
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="mt-3 text-xs text-muted-foreground">This round can draw from any active pack.</div>
                                  )}
                                </div>

                                <div className="rounded-xl border border-border bg-background p-3">
                                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Round rules</div>
                                  <div className="mt-2 space-y-2">
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
                              </div>
                            )}

                            {round.behaviourType !== "heads_up" ? (
                              <details className="mt-3 rounded-xl border border-border bg-background">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-left">
                                  <div>
                                    <div className="text-sm font-medium text-foreground">Round filters</div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      {filterCount > 0 ? `${filterCount} active filter${filterCount === 1 ? "" : "s"}` : "No extra filters"}
                                    </div>
                                  </div>
                                  <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">Show</div>
                                </summary>
                                <div className="border-t border-border p-3">
                                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                    <div>
                                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Media</div>
                                      <SelectControl value={round.mediaType} onChange={(e) => updateManualRound(round.id, { mediaType: e.target.value as ManualRoundDraft["mediaType"] })} className="mt-1" compact>
                                        <option value="">Any media</option>
                                        <option value="text">text</option>
                                        <option value="audio">audio</option>
                                        <option value="image">image</option>
                                      </SelectControl>
                                    </div>
                                    <div>
                                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prompt target</div>
                                      <SelectControl value={round.promptTarget} onChange={(e) => updateManualRound(round.id, { promptTarget: e.target.value })} className="mt-1" compact>
                                        {PROMPT_TARGET_OPTIONS.map((option) => <option key={option.value || "blank"} value={option.value}>{option.label}</option>)}
                                      </SelectControl>
                                    </div>
                                    <div>
                                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Clue source</div>
                                      <SelectControl value={round.clueSource} onChange={(e) => updateManualRound(round.id, { clueSource: e.target.value })} className="mt-1" compact>
                                        {CLUE_SOURCE_OPTIONS.map((option) => <option key={option.value || "blank"} value={option.value}>{option.label}</option>)}
                                      </SelectControl>
                                    </div>
                                    <div>
                                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Show</div>
                                      <SelectControl value={round.primaryShowKey} onChange={(e) => updateManualRound(round.id, { primaryShowKey: e.target.value })} className="mt-1" compact>
                                        <option value="">Any show</option>
                                        {shows.map((show) => <option key={show.show_key} value={show.show_key}>{show.display_name}</option>)}
                                      </SelectControl>
                                    </div>
                                    <div>
                                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Audio clip</div>
                                      <SelectControl value={round.audioClipType} onChange={(e) => updateManualRound(round.id, { audioClipType: e.target.value })} className="mt-1" compact disabled={round.mediaType !== "audio"}>
                                        {AUDIO_CLIP_TYPE_OPTIONS.map((option) => <option key={option.value || "blank"} value={option.value}>{option.label}</option>)}
                                      </SelectControl>
                                    </div>
                                  </div>
                                </div>
                              </details>
                            ) : null}

                            {round.behaviourType !== "heads_up" ? (
                              <details className="mt-3 rounded-xl border border-border bg-background">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-left">
                                  <div>
                                    <div className="text-sm font-medium text-foreground">Timing</div>
                                    <div className="mt-1 text-xs text-muted-foreground">{getManualRoundTimingSummary(round)}</div>
                                  </div>
                                  <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">Edit</div>
                                </summary>
                                <div className="border-t border-border p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="text-xs text-muted-foreground">Default timings are set automatically for each behaviour. Turn this on only when you need a slower or faster pace.</div>
                                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                      <input
                                        type="checkbox"
                                        checked={round.useTimingOverride}
                                        onChange={(e) =>
                                          updateManualRound(round.id, {
                                            useTimingOverride: e.target.checked,
                                            answerSecondsStr: e.target.checked ? round.answerSecondsStr || String(getDefaultAnswerSecondsForBehaviour(round.behaviourType)) : "",
                                            roundReviewSecondsStr: e.target.checked ? round.roundReviewSecondsStr || String(getDefaultRoundReviewSecondsForBehaviour(round.behaviourType)) : "",
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
                                        <Input value={round.answerSecondsStr} onChange={(e) => updateManualRound(round.id, { answerSecondsStr: e.target.value })} inputMode="numeric" />
                                      </div>
                                      <div>
                                        <div className="text-sm font-medium text-foreground">Round review seconds</div>
                                        <Input value={round.roundReviewSecondsStr} onChange={(e) => updateManualRound(round.id, { roundReviewSecondsStr: e.target.value })} inputMode="numeric" />
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </details>
                            ) : null}

                            {feasibility ? (
                              <div className={`mt-3 rounded-2xl border p-3 text-sm ${feasibilityTone(feasibility) === "error" ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950" : feasibilityTone(feasibility) === "warning" ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950" : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950"}`}>
                                <div className={feasibilityTone(feasibility) === "error" ? "text-red-700 dark:text-red-200" : feasibilityTone(feasibility) === "warning" ? "text-amber-800 dark:text-amber-200" : "text-emerald-800 dark:text-emerald-200"}>{feasibility.explanation.summary}</div>
                                {feasibility.explanation.detail ? <div className="mt-1 text-xs text-muted-foreground">{feasibility.explanation.detail}</div> : null}
                                {feasibility.explanation.fallback ? <div className="mt-1 text-xs text-muted-foreground">{feasibility.explanation.fallback}</div> : null}
                                <div className="mt-1 text-xs text-muted-foreground">Eligible now: {feasibility.eligibleCount}. Guaranteed under the current overlap: {feasibility.assignedCount}.</div>
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
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
                          <SelectControl value={roundFilter} onChange={(e) => setRoundFilter(e.target.value as RoundFilter)} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                            <option value="mixed">Mixed</option>
                            <option value="no_audio">No audio</option>
                            <option value="no_image">No pictures</option>
                            <option value="audio_only">Audio only</option>
                            <option value="picture_only">Pictures only</option>
                            <option value="audio_and_image">Audio and pictures</option>
                          </SelectControl>
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium text-foreground">Audio mode</div>
                        <SelectControl value={audioMode} onChange={(e) => setAudioMode(e.target.value as AudioMode)} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                          <option value="display">TV display only</option>
                          <option value="phones">Phones only</option>
                          <option value="both">TV and phones</option>
                        </SelectControl>
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

              <CardFooter className={setupMode === "advanced" ? "flex flex-col items-stretch gap-3 border-t-0 px-0 pt-2 sm:flex-row sm:items-center sm:justify-between" : "flex items-center justify-between gap-3"}>
                <div className="text-sm text-muted-foreground">
                  {setupMode === "simple"
                    ? simpleFeasibilityBusy
                      ? simpleGameType === "infinite"
                        ? "Checking how many questions are available..."
                        : "Checking ready templates..."
                      : simpleGameType === "infinite"
                        ? simpleInfiniteQuestionLimit == null
                          ? `Continuous run using every available question from ${!selectPacks ? "all active packs" : `${selectedPackCount} selected pack${selectedPackCount === 1 ? "" : "s"}`}.`
                          : `Continuous run for ${simpleInfiniteResolvedQuestionCount} question${simpleInfiniteResolvedQuestionCount === 1 ? "" : "s"} from ${!selectPacks ? "all active packs" : `${selectedPackCount} selected pack${selectedPackCount === 1 ? "" : "s"}`}.`
                        : !selectPacks
                          ? `${simpleRoundCount} round${simpleRoundCount === 1 ? "" : "s"} planned from ready templates using all active packs.`
                          : `${simpleRoundCount} round${simpleRoundCount === 1 ? "" : "s"} planned from ready templates across ${selectedPackCount} selected pack${selectedPackCount === 1 ? "" : "s"}.`
                    : buildMode === "infinite"
                      ? simpleFeasibilityBusy
                        ? "Checking how many questions are available..."
                        : advancedInfiniteQuestionLimit == null
                          ? `Infinite run using every available question from ${!selectPacks ? "all active packs" : `${selectedPackCount} selected pack${selectedPackCount === 1 ? "" : "s"}`}.`
                          : `Infinite run for ${advancedInfiniteResolvedQuestionCount} question${advancedInfiniteResolvedQuestionCount === 1 ? "" : "s"} from ${!selectPacks ? "all active packs" : `${selectedPackCount} selected pack${selectedPackCount === 1 ? "" : "s"}`}.`
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
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">Room code</div><div className="mt-1 text-2xl font-semibold tracking-widest text-foreground">{roomCode}</div></div>
                  <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">Current stage</div><div className="mt-1 text-lg font-semibold text-foreground">{stagePill}</div></div>
                  <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">Mode</div><div className={`mt-1 inline-flex rounded-full border px-3 py-1 text-sm ${roomIsInfinite ? "border-sky-500/40 bg-sky-600/10 text-sky-200" : "border-border bg-card text-foreground"}`}>{roomModeSummary}</div></div>
                  <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">Progress</div><div className="mt-1 text-lg font-semibold text-foreground">{roomProgressLabel || "Waiting to start"}</div><div className="mt-1 text-xs text-muted-foreground">{roomJokerSummary}</div></div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button onClick={startGame} disabled={!canStart}>{startLabel}</Button>
                  <Button variant="secondary" onClick={resetRoom} disabled={resetting}>{resetting ? "Resetting..." : "Reset room"}</Button>
                </div>
                {roomIsHeadsUp ? (
                  <div className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <Button variant="secondary" onClick={() => sendHeadsUpAction("host_start_turn")} disabled={!headsUpHostButtons?.canStartTurn}>
                        {forcingClose && roomStage === "heads_up_ready" ? "Starting..." : "Force start turn"}
                      </Button>
                      <Button variant="secondary" onClick={() => sendHeadsUpAction("host_undo")} disabled={!headsUpHostButtons?.canUndo}>
                        {forcingClose && roomStage === "heads_up_live" ? "Working..." : "Undo last action"}
                      </Button>
                      <Button variant="secondary" onClick={() => sendHeadsUpAction("host_end_turn")} disabled={!headsUpHostButtons?.canEndTurn}>
                        {forcingClose && roomStage === "heads_up_live" ? "Ending..." : "End turn"}
                      </Button>
                      <Button onClick={() => sendHeadsUpAction("host_confirm_turn")} disabled={!headsUpHostButtons?.canConfirmTurn}>
                        {forcingClose && roomStage === "heads_up_review" ? "Moving..." : roomStage === "heads_up_review" ? "Move on now" : roomState?.flow?.isLastQuestionOverall ? "Finish round now" : "Move to next player now"}
                      </Button>
                    </div>
                    {roomStage === "heads_up_review" ? (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-600/10 px-3 py-2 text-sm text-amber-100">
                        {roomHeadsUp?.willAdvanceToNextTurn
                          ? `Moving to ${String(roomHeadsUp?.nextGuesserName ?? "the next player")}${roomHeadsUp?.nextTeamName ? ` from Team ${String(roomHeadsUp.nextTeamName)}` : ""} in ${headsUpReviewCountdownSeconds}s unless you move on now or correct the turn log first.`
                          : `Finishing the Heads Up round in ${headsUpReviewCountdownSeconds}s unless you move on now or correct the turn log first.`}
                      </div>
                    ) : null}
                    {roomStage === "round_summary" ? (
                      <div className={`rounded-xl border px-3 py-2 text-sm ${headsUpRoundCompleteReason === "card_pool_exhausted" ? "border-amber-500/30 bg-amber-600/10 text-amber-100" : "border-border bg-card text-muted-foreground"}`}>
                        {headsUpRoundCompleteReason === "card_pool_exhausted"
                          ? `This Heads Up round used all ${Math.max(0, Number(roomHeadsUp?.cardPoolSize ?? 0))} active cards in its selected pack before another player turn could begin. Continue to the next round, or add more active cards to that pack for a longer Heads Up round.`
                          : "This Heads Up round is complete. Continue when you are ready."}
                      </div>
                    ) : null}
                    {roomStage === "round_summary" ? (
                      <Button onClick={continueGame} disabled={!canAdvanceHeadsUpSummary}>
                        {forcingClose ? "Moving on..." : Boolean(roomState?.flow?.isLastQuestionOverall) ? (roomIsInfinite ? "Finish game" : "Finish now") : "Continue to next round"}
                      </Button>
                    ) : null}
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                      <div className="rounded-xl border border-border bg-card p-3">
                        <div className="text-xs text-muted-foreground">Active turn</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">{roomHeadsUp?.activeGuesserName || "No guesser selected"}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {roomHeadsUp?.activeTeamName ? `Team ${roomHeadsUp.activeTeamName}` : roomState?.gameMode === "solo" ? "Solo mode" : "No active team"}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Turn {Math.max(1, Number(roomHeadsUp?.currentTurnIndex ?? 0) + 1)} of {Math.max(0, Number(roomHeadsUp?.totalTurns ?? 0))}. TV: {roomHeadsUp?.tvDisplayMode === "show_clue" ? "show clue" : "timer only"}.
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-card p-3">
                        <div className="text-xs text-muted-foreground">Current turn log</div>
                        {Array.isArray(roomHeadsUp?.currentTurnActions) && roomHeadsUp.currentTurnActions.length ? (
                          <div className="mt-2 space-y-2">
                            {roomHeadsUp.currentTurnActions.map((item: any) => (
                              <div key={item.questionId} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-foreground">{item.questionText}</div>
                                  <div className="text-xs text-muted-foreground">{[item.itemType, item.difficulty].filter(Boolean).join(" · ") || "Heads Up card"}</div>
                                </div>
                                {roomStage === "heads_up_review" ? (
                                  <SelectControl
                                    value={item.action}
                                    onChange={(e) => sendHeadsUpAction("host_review_set_action", { questionId: item.questionId, reviewAction: e.target.value })}
                                    className="rounded-lg border border-border bg-card px-2 py-1 text-xs"
                                  >
                                    <option value="correct">Correct</option>
                                    <option value="pass">Pass</option>
                                  </SelectControl>
                                ) : (
                                  <span className={`rounded-full border px-2 py-0.5 text-xs ${item.action === "correct" ? "border-emerald-500/40 bg-emerald-600/10 text-emerald-200" : "border-slate-500/40 bg-slate-600/10 text-slate-200"}`}>
                                    {item.action === "correct" ? "Correct" : "Pass"}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 text-sm text-muted-foreground">No cards logged yet for this turn.</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <Button variant="secondary" onClick={continueGame} disabled={!canContinue}>{continueLabel}</Button>
                    {roomIsInfinite ? (
                      <Button variant="danger" onClick={endGameNow} disabled={!canEndGame}>
                        {endingGame ? "Ending..." : "End game now"}
                      </Button>
                    ) : null}
                    <div className="flex items-center rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                      {roomIsInfinite
                        ? "Infinite mode has no Joker round. Use End game now to stop the run early, or let it finish when the question pool runs out."
                        : "Round review advances automatically after the set time. Use the button to move on sooner."}
                    </div>
                  </div>
                )}
                <div className="flex justify-end"><Button variant="ghost" onClick={clearRoom}>Create another room</Button></div>
              </CardContent>
            </Card>
          )}

          {packsError ? <Card><CardHeader><CardTitle>Packs</CardTitle></CardHeader><CardContent><div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{packsError}</div></CardContent></Card> : null}
        </div>

        <div className="space-y-6">
          {!hasRoom ? (
            <>
              {setupMode === "advanced" && buildMode !== "manual_rounds" ? (
                selectPacks ? (
                  <Card className="lg:sticky lg:top-4 self-start">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle>Packs</CardTitle>
                          <div className="mt-1 text-sm text-muted-foreground">Choose which packs this build should use.</div>
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
                            <SelectControl value={selectionStrategy} onChange={(e) => setSelectionStrategy(e.target.value as SelectionStrategy)} className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
                              <option value="all_packs">Mix all selected packs</option>
                              <option value="per_pack">Set counts per pack</option>
                            </SelectControl>
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
                )
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle>Resume hosting</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-muted-foreground">Use this only when you want to reopen an existing room.</div>
                  <div>
                    <div className="text-sm font-medium text-foreground">Room code</div>
                    <Input value={rehostCode} onChange={(e) => setRehostCode(cleanRoomCode(e.target.value))} placeholder="For example 3PDSXFT5" autoCapitalize="characters" spellCheck={false} />
                  </div>
                  {rehostError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{rehostError}</div> : null}
                  <Button onClick={rehostRoom} disabled={rehostBusy}>{rehostBusy ? "Loading..." : "Re-host"}</Button>
                </CardContent>
              </Card>
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

      {manualPackPickerRoundId && activeManualPackPickerRound ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-border bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border p-4">
              <div>
                <div className="text-lg font-semibold text-foreground">Choose packs for this round</div>
                <div className="mt-1 text-sm text-muted-foreground">This round will only draw from the packs selected here.</div>
              </div>
              <Button variant="ghost" onClick={closeManualRoundPackPicker}>Close</Button>
            </div>

            <div className="space-y-4 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Input value={manualPackPickerSearch} onChange={(e) => setManualPackPickerSearch(e.target.value)} placeholder="Search packs" />
                <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{manualPackPickerSelectedCount} selected</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (!activeManualPackPickerRound) return
                    const merged = Array.from(new Set([...activeManualPackPickerRound.packIds, ...filteredManualPackPacks.map((pack) => pack.id)]))
                    setManualRoundPacks(activeManualPackPickerRound.id, merged)
                  }}
                >
                  Select shown
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (!activeManualPackPickerRound) return
                    const remaining = activeManualPackPickerRound.packIds.filter((packId) => !filteredManualPackPacks.some((pack) => pack.id === packId))
                    setManualRoundPacks(activeManualPackPickerRound.id, remaining)
                  }}
                >
                  Clear shown
                </Button>
              </div>

              <div className="grid max-h-[55vh] gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
                {filteredManualPackPacks.map((pack) => {
                  const checked = Boolean(activeManualPackPickerRound?.packIds.includes(pack.id))
                  return (
                    <label key={pack.id} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          if (!activeManualPackPickerRound) return
                          toggleManualRoundPack(activeManualPackPickerRound.id, pack.id)
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate">{pack.display_name}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="flex justify-end border-t border-border p-4">
              <Button onClick={closeManualRoundPackPicker}>Done</Button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  )
}
