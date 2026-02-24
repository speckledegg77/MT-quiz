import fs from "node:fs";

const headers = [
  "pack_id","pack_name","pack_round_type","pack_sort_order",
  "question_id","question_round_type","answer_type","question_text",
  "option_a","option_b","option_c","option_d",
  "answer_index","answer_text","accepted_answers","explanation",
  "audio_path","image_path"
];

function esc(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  const escaped = s.replace(/"/g, '""');
  return `"${escaped}"`;
}

const inputPath = process.argv[2];
const outputPath = process.argv[3] ?? "questions.csv";

if (!inputPath) {
  console.error("Usage: node scripts/write-questions-csv.mjs questions.json questions.csv");
  process.exit(1);
}

const rows = JSON.parse(fs.readFileSync(inputPath, "utf8"));
if (!Array.isArray(rows)) {
  console.error("Input JSON must be an array of row objects.");
  process.exit(1);
}

const lines = [];
lines.push(headers.join(","));

for (const row of rows) {
  const line = headers.map((h) => esc(row[h] ?? "")).join(",");
  lines.push(line);
}

fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
console.log(`Wrote ${rows.length} rows to ${outputPath}`);