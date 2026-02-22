// lib/questionSelection.ts

export type QuestionRoundType = "general" | "audio" | "picture";

export type RoundFilter =
  | "mixed"
  | "no_audio"
  | "no_image"
  | "audio_only"
  | "picture_only"
  | "audio_and_image";

export type SelectionStrategy = "per_pack" | "all_packs";

export type PerPackCounts = Record<string, number>;

/**
 * The canonical row shape the room create route expects.
 * Keep these names as-is because other files import QuestionMeta.
 */
export type QuestionMeta = {
  question_id: string;
  pack_id: string;
  round_type: QuestionRoundType;
};

/**
 * The canonical selection input type the room create route expects.
 * Other files import PackSelectionInput.
 */
export type PackSelectionInput = {
  selectionStrategy: SelectionStrategy;
  roundFilter: RoundFilter;
  perPackCounts?: PerPackCounts;
  totalQuestions?: number;
};

/**
 * Other parts of the app expect this named export.
 * Use it for user-friendly errors from selection logic.
 */
export class SelectionError extends Error {
  code:
    | "INVALID_INPUT"
    | "INSUFFICIENT_QUESTIONS"
    | "INSUFFICIENT_QUESTIONS_PER_PACK";

  details?: Record<string, unknown>;

  constructor(
    code:
      | "INVALID_INPUT"
      | "INSUFFICIENT_QUESTIONS"
      | "INSUFFICIENT_QUESTIONS_PER_PACK",
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "SelectionError";
    this.code = code;
    this.details = details;
  }
}

export interface BuildQuestionIdListInput extends PackSelectionInput {
  rows: QuestionMeta[];
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

function applyRoundFilter(rows: QuestionMeta[], filter: RoundFilter): QuestionMeta[] {
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

function buildPerPack(rows: QuestionMeta[], perPackCounts: PerPackCounts): string[] {
  const grouped = groupByPack(rows);

  const out: string[] = [];

  for (const [packId, requestedRaw] of Object.entries(perPackCounts)) {
    const requested = clampNonNegativeInt(requestedRaw);

    if (requested === 0) continue;

    const candidates = grouped.get(packId) ?? [];
    if (candidates.length < requested) {
      throw new SelectionError(
        "INSUFFICIENT_QUESTIONS_PER_PACK",
        `Not enough questions for pack ${packId}. Requested ${requested}, available ${candidates.length}`,
        { packId, requested, available: candidates.length }
      );
    }

    const picked = pickRandom(candidates, requested);
    out.push(...picked.map((r) => r.question_id));
  }

  return out;
}

function buildAllPacks(rows: QuestionMeta[], totalQuestions: number): string[] {
  const total = clampPositiveInt(totalQuestions, "totalQuestions");

  if (rows.length < total) {
    throw new SelectionError(
      "INSUFFICIENT_QUESTIONS",
      `Not enough questions to satisfy totalQuestions. Requested ${total}, available ${rows.length}`,
      { requested: total, available: rows.length }
    );
  }

  const picked = pickRandom(rows, total);
  return picked.map((r) => r.question_id);
}

function groupByPack(rows: QuestionMeta[]): Map<string, QuestionMeta[]> {
  const map = new Map<string, QuestionMeta[]>();

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
    throw new SelectionError(
      "INVALID_INPUT",
      `${fieldName} must be a positive number`,
      { fieldName, value }
    );
  }
  return Math.floor(n);
}

function clampNonNegativeInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}