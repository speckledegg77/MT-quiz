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

export type PerPackCounts = Record<string, number>;

export interface SelectionRow {
  question_id: string;
  pack_id: string;
  round_type: QuestionRoundType;
}

export interface BuildQuestionIdListInput {
  rows: SelectionRow[];
  selectionStrategy: SelectionStrategy;
  roundFilter: RoundFilter;

  // per_pack strategy
  perPackCounts?: PerPackCounts;

  // all_packs strategy
  totalQuestions?: number;
}

export function buildQuestionIdList(input: BuildQuestionIdListInput): string[] {
  const { rows, selectionStrategy, roundFilter } = input;

  const filtered = applyRoundFilter(rows, roundFilter);

  if (selectionStrategy === "per_pack") {
    const perPackCounts = input.perPackCounts ?? {};
    return buildPerPack(filtered, perPackCounts);
  }

  const totalQuestions = input.totalQuestions ?? 0;
  return buildAllPacks(filtered, totalQuestions);
}

function applyRoundFilter(rows: SelectionRow[], filter: RoundFilter): SelectionRow[] {
  if (filter === "mixed") return rows;

  return rows.filter((r) => {
    const t = r.round_type;

    if (filter === "no_audio") return t !== "audio";
    if (filter === "no_image") return t !== "picture";
    if (filter === "audio_only") return t === "audio";
    if (filter === "picture_only") return t === "picture";
    if (filter === "audio_and_image") return t === "audio" || t === "picture";

    return true;
  });
}

function buildPerPack(rows: SelectionRow[], perPackCounts: PerPackCounts): string[] {
  const grouped = groupByPack(rows);

  const out: string[] = [];

  for (const [packId, requestedRaw] of Object.entries(perPackCounts)) {
    const requested = clampNonNegativeInt(requestedRaw);

    if (requested === 0) continue;

    const candidates = grouped.get(packId) ?? [];
    if (candidates.length < requested) {
      throw new Error(
        `Not enough questions for pack ${packId}. Requested ${requested}, available ${candidates.length}`
      );
    }

    const picked = pickRandom(candidates, requested);
    out.push(...picked.map((r) => r.question_id));
  }

  return out;
}

function buildAllPacks(rows: SelectionRow[], totalQuestions: number): string[] {
  const total = clampPositiveInt(totalQuestions, "totalQuestions");

  if (rows.length < total) {
    throw new Error(
      `Not enough questions to satisfy totalQuestions. Requested ${total}, available ${rows.length}`
    );
  }

  const picked = pickRandom(rows, total);
  return picked.map((r) => r.question_id);
}

function groupByPack(rows: SelectionRow[]): Map<string, SelectionRow[]> {
  const map = new Map<string, SelectionRow[]>();

  for (const r of rows) {
    const existing = map.get(r.pack_id);
    if (existing) {
      existing.push(r);
    } else {
      map.set(r.pack_id, [r]);
    }
  }

  return map;
}

function pickRandom<T>(items: T[], count: number): T[] {
  const copy = items.slice();
  shuffleInPlace(copy);
  return copy.slice(0, count);
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function clampPositiveInt(value: unknown, fieldName: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }
  return Math.floor(n);
}

function clampNonNegativeInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}