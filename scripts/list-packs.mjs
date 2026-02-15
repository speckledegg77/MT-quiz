import fs from "fs"
import path from "path"

const candidates = [
  "data/questions.ts",
  "src/data/questions.ts",
  "app/data/questions.ts",
  "questions.ts"
]

function findQuestionsFile() {
  for (const p of candidates) {
    const full = path.join(process.cwd(), p)
    if (fs.existsSync(full)) return full
  }
  const fromArg = process.argv[2]
  if (fromArg) {
    const full = path.isAbsolute(fromArg) ? fromArg : path.join(process.cwd(), fromArg)
    if (fs.existsSync(full)) return full
  }
  return null
}

function extractBracketBlock(text, startIndex) {
  // startIndex points at the '['
  let depth = 0
  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i]
    if (ch === "[") depth++
    if (ch === "]") depth--
    if (depth === 0) return text.slice(startIndex, i + 1)
  }
  return null
}

const file = findQuestionsFile()
if (!file) {
  console.log("Could not find questions.ts. Pass a path like: node scripts/list-packs.mjs data/questions.ts")
  process.exit(1)
}

const raw = fs.readFileSync(file, "utf8")

// Count packs
const packCounts = new Map()
let totalPackTags = 0

for (let i = 0; i < raw.length; i++) {
  const idx = raw.indexOf("packs", i)
  if (idx === -1) break
  const colon = raw.indexOf(":", idx)
  if (colon === -1) break
  const open = raw.indexOf("[", colon)
  if (open === -1) {
    i = colon + 1
    continue
  }

  const block = extractBracketBlock(raw, open)
  if (!block) {
    i = open + 1
    continue
  }

  const matches = [...block.matchAll(/["'`]{1}([^"'`]+)["'`]{1}/g)].map(m => m[1].trim())
  for (const p of matches) {
    totalPackTags++
    packCounts.set(p, (packCounts.get(p) ?? 0) + 1)
  }

  i = open + block.length
}

// Count roundType values
const roundTypeCounts = new Map()
for (const m of raw.matchAll(/roundType\s*:\s*["'`]{1}([^"'`]+)["'`]{1}/g)) {
  const rt = m[1].trim()
  roundTypeCounts.set(rt, (roundTypeCounts.get(rt) ?? 0) + 1)
}

const audioPathCount = [...raw.matchAll(/audioPath\s*:\s*["'`]{1}([^"'`]+)["'`]{1}/g)].length

console.log("\nQuestions file:", file)

console.log("\nPack counts:")
const packSorted = [...packCounts.entries()].sort((a, b) => b[1] - a[1])
for (const [p, c] of packSorted) console.log(`- ${p}: ${c}`)
console.log(`Total pack tags found: ${totalPackTags}`)

console.log("\nRound type counts:")
const rtSorted = [...roundTypeCounts.entries()].sort((a, b) => b[1] - a[1])
for (const [rt, c] of rtSorted) console.log(`- ${rt}: ${c}`)

console.log(`\nQuestions with audioPath: ${audioPathCount}\n`)
