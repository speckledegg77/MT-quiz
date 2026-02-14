import { supabaseAdmin } from "./supabaseAdmin"

export type Question = {
  id: string
  roundType: "mcq" | "audio"
  text: string
  options: string[]
  answerIndex: number
  explanation: string
  audioPath?: string
}

type DbQuestionRow = {
  id: string
  round_type: "general" | "audio"
  text: string
  options: any
  answer_index: number
  explanation: string | null
  audio_path: string | null
}

const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { at: number; q: Question }>()

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
}

function mapDbRow(row: DbQuestionRow): Question {
  const roundType: "mcq" | "audio" = row.round_type === "audio" ? "audio" : "mcq"
  const options: string[] = Array.isArray(row.options) ? row.options.map(String) : []
  return {
    id: row.id,
    roundType,
    text: row.text,
    options,
    answerIndex: row.answer_index,
    explanation: row.explanation ?? "",
    audioPath: row.audio_path ?? undefined,
  }
}

export async function getQuestionById(id: string): Promise<Question | null> {
  const key = String(id ?? "").trim()
  if (!key) return null

  const cached = cache.get(key)
  const now = Date.now()
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.q

  const res = await supabaseAdmin
    .from("questions")
    .select("id, round_type, text, options, answer_index, explanation, audio_path")
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

  const packs = (Array.isArray(packIds) ? packIds : [])
    .map(x => String(x ?? "").trim())
    .filter(Boolean)

  let ids: string[] = []

  if (packs.length > 0) {
    const linksRes = await supabaseAdmin
      .from("pack_questions")
      .select("question_id")
      .in("pack_id", packs)

    if (linksRes.error) return []

    const raw = (linksRes.data ?? []).map(r => String((r as any).question_id ?? "")).filter(Boolean)
    ids = [...new Set(raw)]
  } else {
    const allRes = await supabaseAdmin.from("questions").select("id")
    if (allRes.error) return []
    ids = (allRes.data ?? []).map(r => String((r as any).id ?? "")).filter(Boolean)
  }

  if (ids.length === 0) return []

  shuffleInPlace(ids)
  return ids.slice(0, Math.min(n, ids.length))
}
