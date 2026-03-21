import { parse } from "csv-parse/sync"

export async function readCsvText(req: Request): Promise<string> {
  const contentType = String(req.headers.get("content-type") ?? "").toLowerCase()

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData()
    const file = form.get("file")
    if (!file || typeof (file as { text?: unknown }).text !== "function") {
      throw new Error("Missing file field in form data")
    }
    return await (file as File).text()
  }

  const text = await req.text()
  if (!text || !text.trim()) throw new Error("Empty request body")
  return text
}

export function parseCsvRows<T extends Record<string, unknown>>(csvText: string): T[] {
  return parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
  }) as T[]
}

export function parsePipeList(raw: unknown): string[] {
  return String(raw ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseBooleanLike(raw: unknown, defaultValue: boolean): boolean {
  const value = String(raw ?? "").trim().toLowerCase()
  if (!value) return defaultValue
  if (["true", "1", "yes", "y"].includes(value)) return true
  if (["false", "0", "no", "n"].includes(value)) return false
  throw new Error(`Invalid boolean value: ${String(raw ?? "")}`)
}

export function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((item) => String(item ?? "").trim()).filter(Boolean))]
}
