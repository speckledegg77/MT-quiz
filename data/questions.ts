export type Question = {
  id: string
  roundType: "mcq" | "audio"
  text: string
  options: string[]
  answerIndex: number
  explanation: string
  difficulty: "easy" | "medium" | "hard"
  tags: string[]
  packs: string[]
  audioPath?: string
}

export const questions: Question[] = [
  {
    id: "q1",
    roundType: "mcq",
    text: "Which role is in the musical Wicked?",
    options: ["Elphaba", "Cosette", "Sandy", "Anita"],
    answerIndex: 0,
    explanation: "Elphaba is one of the two central characters in Wicked.",
    difficulty: "easy",
    tags: ["wicked", "characters"],
    packs: ["general"]
  },
  {
    id: "q2",
    roundType: "mcq",
    text: "Which musical includes the song title 'Seasons of Love'?",
    options: ["Rent", "Cabaret", "Chicago", "Evita"],
    answerIndex: 0,
    explanation: "‘Seasons of Love’ features in Rent.",
    difficulty: "easy",
    tags: ["songs"],
    packs: ["general"]
  },
  {
    id: "q3",
    roundType: "mcq",
    text: "Which musical takes place in and around a Paris opera house?",
    options: ["The Phantom of the Opera", "Matilda", "Hairspray", "Oliver!"],
    answerIndex: 0,
    explanation: "The Phantom of the Opera centres on the Paris Opera House.",
    difficulty: "easy",
    tags: ["settings"],
    packs: ["general"]
  },
  {
    id: "audio1",
    roundType: "audio",
    text: "Audio round: which show is this intro from?",
    options: ["Next to Normal", "Wicked", "Rent", "Cabaret"],
    answerIndex: 0,
    explanation: "Placeholder. Update this when you swap in a real clip and correct answer.",
    difficulty: "medium",
    tags: ["audio"],
    packs: ["general"],
    audioPath: "test.mp3"
  }
]
