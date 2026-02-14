const KEY = "mtq_party_v1"

export type PartyState = {
  players: string[]
  pack: "all" | "general"
  roundsPerTeam: number
}

export function savePartyState(state: PartyState) {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function loadPartyState(): PartyState | null {
  const raw = localStorage.getItem(KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PartyState
  } catch {
    return null
  }
}

export function clearPartyState() {
  localStorage.removeItem(KEY)
}
