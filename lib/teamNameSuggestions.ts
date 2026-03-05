export const TEAM_NAME_PUNS: string[] = [
  "Sondheim Stans",
  "Wicked Wits",
  "Les Misérables Misfits",
  "Hamilton Hype Squad",
  "Phantom Phans",
  "Cats With Hats",
  "Chorus Line Champions",
  "Olivier Overachievers",
  "Jazz Hands United",
  "Showstopper Society",
  "Curtain Call Crew",
  "Rocky Horror Roll Call",
  "Rent Is Due",
  "Grease Lightning",
  "Mamma Mia Mafia",
  "Book of Mor(m)ons",
  "Theatre Kids Anonymous",
  "Defying Gravity",
  "Les Miz Biz",
  "Some Enchanted Players",
]

function normaliseKey(s: string) {
  return String(s ?? "").trim().toLowerCase()
}

export function randomTeamName(excludeNames?: Iterable<string>) {
  const exclude = new Set<string>()
  for (const n of excludeNames ?? []) exclude.add(normaliseKey(n))

  const tries = Math.min(TEAM_NAME_PUNS.length, 40)
  for (let i = 0; i < tries; i++) {
    const pick = TEAM_NAME_PUNS[Math.floor(Math.random() * TEAM_NAME_PUNS.length)]
    if (!exclude.has(normaliseKey(pick))) return pick
  }

  const base = TEAM_NAME_PUNS[Math.floor(Math.random() * TEAM_NAME_PUNS.length)]
  let suffix = 2
  while (exclude.has(normaliseKey(`${base} ${suffix}`))) suffix++
  return `${base} ${suffix}`
}
