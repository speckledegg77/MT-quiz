import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const SOURCE_FILE = "app/host/page.tsx"
const OUT_DIR = "components/host/layouts"
const COUNT = 10

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" })
}

fs.mkdirSync(OUT_DIR, { recursive: true })

const commitsRaw = run(
  `git log --follow -n ${COUNT} --format=%h -- ${SOURCE_FILE}`
).trim()

if (!commitsRaw) {
  console.log("No commits found for", SOURCE_FILE)
  process.exit(1)
}

const commits = commitsRaw.split(/\r?\n/).filter(Boolean)

console.log(`Found ${commits.length} commits for ${SOURCE_FILE}:`)
for (const h of commits) console.log(`- ${h}`)

for (const h of commits) {
  const content = run(`git show ${h}:${SOURCE_FILE}`)

  const componentName = `HostLayout_${h}`

  const updated = content.replace(
    /export\s+default\s+function\s+[A-Za-z0-9_]+\s*\(/,
    `export default function ${componentName}(`
  )

  const outPath = path.join(OUT_DIR, `${componentName}.tsx`)
  fs.writeFileSync(outPath, updated, "utf8")
}

console.log("")
console.log("Created layout files:")
for (const h of commits) {
  console.log(`- ${OUT_DIR}/HostLayout_${h}.tsx`)
}