import fs from "fs"
import path from "path"
import Papa from "papaparse"

const root = process.cwd()
const csvPath = path.join(root, "data", "questions.csv")
const outPath = path.join(root, "data", "questions.ts")

function must(value, field, row) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`Missing "${field}" on row ${row}`)
  }
  return String(value).trim()
}

function parseTags(value) {
  const raw = String(value ?? "").trim()
  if (!raw) return []
  return raw.split(",").map(s => s.trim()).filter(Boolean)
}

const csvRaw = fs.readFileSync(csvPath, "utf8")
const parsed = Papa.parse(csvRaw, { header: true, skipEmptyLines: true })

if (parsed.errors?.length) {
  throw new Error(parsed.errors.map(e => e.message).join("\n"))
}

const rows = parsed.data

const questions = rows.map((r, idx) => {
  const rowNumber = idx + 2 // header is row 1
  const id = must(r.id, "id", rowNumber)
  const text = must(r.text, "text", rowNumber)

  const options = [
    must(r.optionA, "optionA", rowNumber),
    must(r.optionB, "optionB", rowNumber),
    must(r.optionC, "optionC", rowNumber),
    must(r.optionD, "optionD", rowNumber),
  ]

  const answerIndex = Number(must(r.answerIndex, "answerIndex", rowNumber))
  if (![0, 1, 2, 3].includes(answerIndex)) {
    throw new Error(`answerIndex must be 0-3 on row ${rowNumber}`)
  }

  const difficulty = must(r.difficulty, "difficulty", rowNumber)
  if (!["easy", "medium", "hard"].includes(difficulty)) {
    throw new Error(`difficulty must be easy/medium/hard on row ${rowNumber}`)
  }

  const explanation = must(r.explanation, "explanation", rowNumber)
  const tags = parseTags(r.tags)

  return {
    id,
    text,
    options,
    answerIndex,
    explanation,
    difficulty,
    tags,
    packs: ["general"],
  }
})

const ts = `export type Question = {
  id: string
  text: string
  options: string[]
  answerIndex: number
  explanation: string
  difficulty: "easy" | "medium" | "hard"
  tags: string[]
  packs: string[]
}

export const questions: Question[] = ${JSON.stringify(questions, null, 2)}
`

fs.writeFileSync(outPath, ts, "utf8")
console.log(`Wrote ${questions.length} questions to data/questions.ts`)
