import { parseHeadsUpSyntheticQuestionId } from "./headsUp"
import { supabaseAdmin } from "./supabaseAdmin"

export type RoundType = "mcq" | "audio" | "picture" | "heads_up"
export type AnswerType = "mcq" | "text" | "none"

export type Question = {
  id: string
  roundType: RoundType
  answerType: AnswerType
  text: string
  options: string[]
  answerIndex: number | null
  answerText?: string
  acceptedAnswers?: string[]
  explanation: string
  audioPath?: string
  imagePath?: string
  meta?: {
    itemType?: string
    difficulty?: string
    primaryShowKey?: string | null
    primaryShowName?: string | null
  }
}

type DbQuestionRow = {
  id: string
  round_type: "general" | "audio" | "picture" | "mixed"
  answer_type: "mcq" | "text" | null
  text: string
  options: any
  answer_index: number | null
  answer_text: string | null
  accepted_answers: string[] | null
  explanation: string | null
  audio_path: string | null
  image_path: string | null
}

type DbHeadsUpRow = {
  id: string
  answer_text: string
  item_type: string | null
  difficulty: string | null
  primary_show_key: string | null
  notes: string | null
}

const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { at: number; q: Question }>()
const showNameCache = new Map<string, { at: number; name: string | null }>()

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
}

async function getShowDisplayName(showKeyRaw: string | null | undefined) {
  const showKey = String(showKeyRaw ?? "").trim()
  if (!showKey) return null

  const now = Date.now()
  const cached = showNameCache.get(showKey)
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.name

  const res = await supabaseAdmin
    .from("shows")
    .select("display_name")
    .eq("show_key", showKey)
    .maybeSingle()

  const displayName = String(res.data?.display_name ?? "").trim() || formatShowKeyLabel(showKey)
  showNameCache.set(showKey, { at: now, name: displayName })
  return displayName
}

function formatShowKeyLabel(showKey: string) {
  return showKey
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function mapDbRow(row: DbQuestionRow): Question {
  const roundType: RoundType =
    row.round_type === "audio" ? "audio" : row.round_type === "picture" ? "picture" : "mcq"

  const answerType: AnswerType = row.answer_type === "text" ? "text" : "mcq"

  const options: string[] =
    answerType === "mcq" && Array.isArray(row.options) ? row.options.map(String) : []

  const answerIndex =
    answerType === "mcq" ? (Number.isFinite(Number(row.answer_index)) ? Number(row.answer_index) : null) : null

  const answerText = answerType === "text" ? row.answer_text ?? "" : undefined

  const acceptedAnswers =
    answerType === "text" && Array.isArray(row.accepted_answers) ? row.accepted_answers.map(String) : undefined

  return {
    id: row.id,
    roundType,
    answerType,
    text: row.text,
    options,
    answerIndex,
    answerText,
    acceptedAnswers,
    explanation: row.explanation ?? "",
    audioPath: row.audio_path ?? undefined,
    imagePath: row.image_path ?? undefined,
  }
}

async function mapHeadsUpRow(questionId: string, row: DbHeadsUpRow): Promise<Question> {
  const primaryShowKey = row.primary_show_key ?? null
  const primaryShowName = await getShowDisplayName(primaryShowKey)

  return {
    id: questionId,
    roundType: "heads_up",
    answerType: "none",
    text: String(row.answer_text ?? "").trim() || "Heads Up card",
    options: [],
    answerIndex: null,
    answerText: String(row.answer_text ?? "").trim() || undefined,
    acceptedAnswers: undefined,
    explanation: String(row.notes ?? "").trim(),
    meta: {
      itemType: row.item_type ?? undefined,
      difficulty: row.difficulty ?? undefined,
      primaryShowKey,
      primaryShowName,
    },
  }
}

export async function getQuestionById(id: string): Promise<Question | null> {
  const key = String(id ?? "").trim()
  if (!key) return null

  const cached = cache.get(key)
  const now = Date.now()
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.q

  const headsUpItemId = parseHeadsUpSyntheticQuestionId(key)
  if (headsUpItemId) {
    const res = await supabaseAdmin
      .from("heads_up_items")
      .select("id, answer_text, item_type, difficulty, primary_show_key, notes")
      .eq("id", headsUpItemId)
      .eq("is_active", true)
      .single()

    if (res.error || !res.data) return null

    const q = await mapHeadsUpRow(key, res.data as DbHeadsUpRow)
    cache.set(key, { at: now, q })
    return q
  }

  const res = await supabaseAdmin
    .from("questions")
    .select("id, round_type, answer_type, text, options, answer_index, answer_text, accepted_answers, explanation, audio_path, image_path")
    .eq("id", key)
    .single()

  if (res.error || !res.data) return null

  const q = mapDbRow(res.data as DbQuestionRow)
  cache.set(key, { at: now, q })
  return q
}

export async function pickQuestionIdsForPacks(count: number, packIds: string[]): Promise<string[]> {
  const n = Math.max(0, Math.floor(Number(count)))
  if (n <= 0) return []

  const packs = (Array.isArray(packIds) ? packIds : []).map((x) => String(x ?? "").trim()).filter(Boolean)

  let ids: string[] = []

  if (packs.length > 0) {
    const linksRes = await supabaseAdmin.from("pack_questions").select("question_id").in("pack_id", packs)
    if (linksRes.error) return []

    const raw = (linksRes.data ?? []).map((r) => String((r as any).question_id ?? "")).filter(Boolean)
    ids = [...new Set(raw)]
  } else {
    const allRes = await supabaseAdmin.from("questions").select("id")
    if (allRes.error) return []

    ids = (allRes.data ?? []).map((r) => String((r as any).id ?? "")).filter(Boolean)
  }

  if (ids.length === 0) return []
  shuffleInPlace(ids)
  return ids.slice(0, Math.min(n, ids.length))
}
