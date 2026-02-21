// lib/questionSelection.ts

export type QuestionRoundType = "general" | "audio" | "picture";

// Added:
// - no_image: exclude picture questions
// - audio_and_image: include audio + picture only (exclude general)
export type RoundFilter =
  | "mixed"
  | "no_audio"
  | "no_image"
  | "audio_only"
  | "picture_only"
  | "audio_and_image";

export type SelectionStrategy = "per_pack" | "all_packs";

export type QuestionMeta = {
  id: string;
  round_type: QuestionRoundType;
};

export type PackSelectionInput = {
  pack_id: string;
  // Required when strategy = "per_pack"
  count?: number;
};

export class SelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelectionError";
  }
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function dedupeById(items: QuestionMeta[]): QuestionMeta[] {
  const seen = new Set<string>();
  const out: QuestionMeta[] = [];
  for (const q of items) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
  }
  return out;
}

function applyRoundFilter(items: QuestionMeta[], filter: RoundFilter): QuestionMeta[] {
  if (filter === "mixed") return items;

  if (filter === "no_audio") return items.filter((q) => q.round_type !== "audio");

  if (filter === "no_image") return items.filter((q) => q.round_type !== "picture");

  if (filter === "audio_only") return items.filter((q) => q.round_type === "audio");

  if (filter === "picture_only") return items.filter((q) => q.round_type === "picture");

  if (filter === "audio_and_image") return items.filter((q) => q.round_type !== "general");

  return items;
}

function takeRandomIds(items: QuestionMeta[], n: number): string[] {
  const picked = shuffle(items).slice(0, n);
  return picked.map((q) => q.id);
}

export function buildQuestionIdList(params: {
  packs: PackSelectionInput[];
  packQuestionsById: Record<string, QuestionMeta[]>;
  strategy: SelectionStrategy;
  totalQuestions?: number;
  roundFilter: RoundFilter;
}): { questionIds: string[]; warnings: string[] } {
  const { packs, packQuestionsById } = params;
  let { strategy, totalQuestions, roundFilter } = params;

  if (!packs || packs.length === 0) {
    throw new SelectionError("Pick at least one pack.");
  }

  const warnings: string[] = [];

  // Single-type filters behave best as one total across all selected packs.
  if (roundFilter === "audio_only" || roundFilter === "picture_only") {
    if (strategy !== "all_packs") {
      warnings.push("Audio only and picture only use a single total across all selected packs.");
      strategy = "all_packs";
    }
  }

  if (strategy === "per_pack") {
    const allChosenIds: string[] = [];

    for (const p of packs) {
      const raw = packQuestionsById[p.pack_id] ?? [];
      const filtered = applyRoundFilter(dedupeById(raw), roundFilter);

      const count = p.count;
      if (typeof count !== "number" || Number.isNaN(count) || count <= 0) {
        throw new SelectionError("Set a question count for each selected pack.");
      }

      if (filtered.length < count) {
        throw new SelectionError(
          `Pack ${p.pack_id} does not have enough questions for your filter. Requested ${count}, found ${filtered.length}.`
        );
      }

      allChosenIds.push(...takeRandomIds(filtered, count));
    }

    return { questionIds: shuffle(allChosenIds), warnings };
  }

  // strategy === "all_packs"
  const total = totalQuestions;
  if (typeof total !== "number" || Number.isNaN(total) || total <= 0) {
    throw new SelectionError("Set a total question count.");
  }

  let pool: QuestionMeta[] = [];
  for (const p of packs) {
    const raw = packQuestionsById[p.pack_id] ?? [];
    pool.push(...raw);
  }

  pool = applyRoundFilter(dedupeById(pool), roundFilter);

  if (pool.length < total) {
    throw new SelectionError(
      `Not enough questions for your filter across the selected packs. Requested ${total}, found ${pool.length}.`
    );
  }

  return { questionIds: takeRandomIds(pool, total), warnings };
}