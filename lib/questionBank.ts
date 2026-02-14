import { questions, Question } from "../data/questions"

function shuffle<T>(arr: T[]) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy
}

export function pickQuestionIds(count: number, pack: "all" | "general") {
  const filtered = pack === "all" ? questions : questions.filter(q => q.packs.includes("general"))
  return shuffle(filtered).slice(0, Math.min(count, filtered.length)).map(q => q.id)
}

export function getQuestionById(id: string): Question | undefined {
  return questions.find(q => q.id === id)
}
