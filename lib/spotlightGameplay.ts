import type { EffectiveRoundPlanItem } from "@/lib/roomRoundPlan"

export type SpotlightTvDisplayMode = "show_clue" | "timer_only"
export type SpotlightTurnStatus = "ready" | "live" | "review" | "round_summary"
export type SpotlightActionKind = "correct" | "pass"

export const SPOTLIGHT_REVIEW_AUTO_ADVANCE_MS = 10000

export type SpotlightTurnAction = {
  questionId: string
  action: SpotlightActionKind
  at: string
}

export type SpotlightCompletedTurn = {
  turnIndex: number
  activeGuesserId: string
  activeTeamName: string | null
  startedAt: string | null
  endedAt: string | null
  actions: SpotlightTurnAction[]
}

export type SpotlightRoomState = {
  roundIndex: number
  status: SpotlightTurnStatus
  turnOrderPlayerIds: string[]
  currentTurnIndex: number
  activeGuesserId: string | null
  activeTeamName: string | null
  turnStartedAt: string | null
  turnEndsAt: string | null
  currentTurnActions: SpotlightTurnAction[]
  completedTurns: SpotlightCompletedTurn[]
}

export type SpotlightPlayerLike = {
  id?: string | null
  name?: string | null
  team_name?: string | null
  joined_at?: string | null
}

function cleanStringArray(raw: unknown) {
  if (!Array.isArray(raw)) return [] as string[]
  return raw.map((value) => String(value ?? "").trim()).filter(Boolean)
}

function cleanActionKind(raw: unknown): SpotlightActionKind {
  return String(raw ?? "").trim().toLowerCase() === "pass" ? "pass" : "correct"
}

export function cleanSpotlightTvDisplayMode(raw: unknown): SpotlightTvDisplayMode {
  return String(raw ?? "").trim().toLowerCase() === "show_clue" ? "show_clue" : "timer_only"
}

export function getSpotlightTurnSeconds(round: { behaviourType?: unknown; answerSeconds?: unknown } | null | undefined) {
  const behaviourType = String(round?.behaviourType ?? "").trim().toLowerCase()
  if (behaviourType !== "spotlight") return 60
  const value = Math.floor(Number(round?.answerSeconds ?? 60))
  return value === 90 ? 90 : 60
}

export function getSpotlightTvDisplayMode(round: { behaviourType?: unknown; spotlightTvDisplayMode?: unknown } | null | undefined) {
  const behaviourType = String(round?.behaviourType ?? "").trim().toLowerCase()
  if (behaviourType !== "spotlight") return "show_clue" as SpotlightTvDisplayMode
  return cleanSpotlightTvDisplayMode(round?.spotlightTvDisplayMode)
}

export function buildSpotlightTurnOrder(playersRaw: SpotlightPlayerLike[], options: { gameMode?: unknown; teamNames?: unknown } = {}) {
  const players = [...(Array.isArray(playersRaw) ? playersRaw : [])]
    .map((player) => ({
      id: String(player?.id ?? "").trim(),
      teamName: String(player?.team_name ?? "").trim() || "No team",
      joinedAt: String(player?.joined_at ?? ""),
    }))
    .filter((player) => player.id)
    .sort((a, b) => {
      const at = Date.parse(a.joinedAt)
      const bt = Date.parse(b.joinedAt)
      if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt
      return a.id.localeCompare(b.id)
    })

  const gameMode = String(options.gameMode ?? "teams").trim().toLowerCase() === "solo" ? "solo" : "teams"
  if (gameMode === "solo") return players.map((player) => player.id)

  const explicitTeamNames = cleanStringArray(options.teamNames)
  const byTeam = new Map<string, string[]>()
  for (const player of players) {
    const list = byTeam.get(player.teamName) ?? []
    list.push(player.id)
    byTeam.set(player.teamName, list)
  }

  const teamOrder = explicitTeamNames.filter((team) => byTeam.has(team))
  for (const team of byTeam.keys()) {
    if (!teamOrder.includes(team)) teamOrder.push(team)
  }

  const cursors = new Map<string, number>()
  for (const team of teamOrder) cursors.set(team, 0)

  const out: string[] = []
  let added = true
  while (added) {
    added = false
    for (const team of teamOrder) {
      const list = byTeam.get(team) ?? []
      const cursor = cursors.get(team) ?? 0
      if (cursor < list.length) {
        out.push(list[cursor])
        cursors.set(team, cursor + 1)
        added = true
      }
    }
  }

  return out
}



export function getSpotlightReadyTurnMeta(params: {
  turnOrderPlayerIds: string[]
  currentTurnIndex: number
  players: SpotlightPlayerLike[]
}) {
  const turnOrder = cleanStringArray(params.turnOrderPlayerIds)
  const currentTurnIndex = Math.max(0, Math.floor(Number(params.currentTurnIndex ?? 0)) || 0)
  const activeGuesserId = String(turnOrder[currentTurnIndex] ?? "").trim() || null
  if (!activeGuesserId) {
    return { activeGuesserId: null, activeTeamName: null }
  }

  const activePlayer = [...(Array.isArray(params.players) ? params.players : [])].find(
    (player) => String(player?.id ?? "").trim() === activeGuesserId
  )

  return {
    activeGuesserId,
    activeTeamName: String(activePlayer?.team_name ?? "").trim() || null,
  }
}

export function createSpotlightReadyState(params: {
  roundIndex: number
  players: SpotlightPlayerLike[]
  gameMode?: unknown
  teamNames?: unknown
}): SpotlightRoomState {
  const turnOrderPlayerIds = buildSpotlightTurnOrder(params.players, { gameMode: params.gameMode, teamNames: params.teamNames })
  const readyTurn = getSpotlightReadyTurnMeta({
    turnOrderPlayerIds,
    currentTurnIndex: 0,
    players: params.players,
  })

  return {
    roundIndex: Math.max(0, Math.floor(Number(params.roundIndex ?? 0)) || 0),
    status: "ready",
    turnOrderPlayerIds,
    currentTurnIndex: 0,
    activeGuesserId: readyTurn.activeGuesserId,
    activeTeamName: readyTurn.activeTeamName,
    turnStartedAt: null,
    turnEndsAt: null,
    currentTurnActions: [],
    completedTurns: [],
  }
}

export function normaliseSpotlightRoomState(raw: unknown, fallbackRoundIndex: number): SpotlightRoomState {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const completedTurnsRaw = Array.isArray(value.completedTurns) ? value.completedTurns : []
  const currentTurnActionsRaw = Array.isArray(value.currentTurnActions) ? value.currentTurnActions : []
  const statusRaw = String(value.status ?? "ready").trim().toLowerCase()
  const status: SpotlightTurnStatus =
    statusRaw === "live" ? "live" : statusRaw === "review" ? "review" : statusRaw === "round_summary" ? "round_summary" : "ready"

  return {
    roundIndex: Math.max(0, Math.floor(Number(value.roundIndex ?? fallbackRoundIndex)) || fallbackRoundIndex),
    status,
    turnOrderPlayerIds: [...new Set(cleanStringArray(value.turnOrderPlayerIds))],
    currentTurnIndex: Math.max(0, Math.floor(Number(value.currentTurnIndex ?? 0)) || 0),
    activeGuesserId: String(value.activeGuesserId ?? "").trim() || null,
    activeTeamName: String(value.activeTeamName ?? "").trim() || null,
    turnStartedAt: String(value.turnStartedAt ?? "").trim() || null,
    turnEndsAt: String(value.turnEndsAt ?? "").trim() || null,
    currentTurnActions: currentTurnActionsRaw
      .map((row) => {
        const value = row && typeof row === "object" ? (row as Record<string, unknown>) : {}
        const questionId = String(value.questionId ?? "").trim()
        if (!questionId) return null
        return {
          questionId,
          action: cleanActionKind(value.action),
          at: String(value.at ?? "").trim() || new Date().toISOString(),
        } as SpotlightTurnAction
      })
      .filter(Boolean) as SpotlightTurnAction[],
    completedTurns: completedTurnsRaw
      .map((row) => {
        const value = row && typeof row === "object" ? (row as Record<string, unknown>) : {}
        const activeGuesserId = String(value.activeGuesserId ?? "").trim()
        if (!activeGuesserId) return null
        const actionsRaw = Array.isArray(value.actions) ? value.actions : []
        return {
          turnIndex: Math.max(0, Math.floor(Number(value.turnIndex ?? 0)) || 0),
          activeGuesserId,
          activeTeamName: String(value.activeTeamName ?? "").trim() || null,
          startedAt: String(value.startedAt ?? "").trim() || null,
          endedAt: String(value.endedAt ?? "").trim() || null,
          actions: actionsRaw
            .map((actionRaw) => {
              const actionValue = actionRaw && typeof actionRaw === "object" ? (actionRaw as Record<string, unknown>) : {}
              const questionId = String(actionValue.questionId ?? "").trim()
              if (!questionId) return null
              return {
                questionId,
                action: cleanActionKind(actionValue.action),
                at: String(actionValue.at ?? "").trim() || new Date().toISOString(),
              } as SpotlightTurnAction
            })
            .filter(Boolean) as SpotlightTurnAction[],
        } as SpotlightCompletedTurn
      })
      .filter(Boolean) as SpotlightCompletedTurn[],
  }
}

export function deriveSpotlightStage(params: {
  roomPhase?: unknown
  round?: EffectiveRoundPlanItem | null
  rawState?: unknown
  nowMs?: number
  closeAt?: unknown
}) {
  if (String(params.roomPhase ?? "").trim().toLowerCase() !== "running") return null
  const behaviourType = String(params.round?.behaviourType ?? "").trim().toLowerCase()
  if (behaviourType !== "spotlight") return null

  const state = normaliseSpotlightRoomState(params.rawState, params.round?.index ?? 0)
  const closeAtMs = params.closeAt ? Date.parse(String(params.closeAt)) : Number.NaN
  const nowMs = Number.isFinite(Number(params.nowMs)) ? Number(params.nowMs) : Date.now()

  if (state.status === "round_summary") return "round_summary"
  if (state.status === "review") return "spotlight_review"
  if (state.status === "live") {
    if (Number.isFinite(closeAtMs) && nowMs >= closeAtMs) return "spotlight_review"
    return "spotlight_live"
  }
  return "spotlight_ready"
}

export function getSpotlightRole(params: {
  playerId?: string | null
  playerTeamName?: string | null
  activeGuesserId?: string | null
  activeTeamName?: string | null
  gameMode?: unknown
}) {
  const playerId = String(params.playerId ?? "").trim()
  if (!playerId) return "spectator" as const

  const activeGuesserId = String(params.activeGuesserId ?? "").trim()
  if (!activeGuesserId) return "waiting" as const
  if (playerId === activeGuesserId) return "guesser" as const

  const gameMode = String(params.gameMode ?? "teams").trim().toLowerCase() === "solo" ? "solo" : "teams"
  if (gameMode === "solo") return "clue_giver" as const

  const activeTeamName = String(params.activeTeamName ?? "").trim()
  const playerTeamName = String(params.playerTeamName ?? "").trim()
  if (activeTeamName && playerTeamName === activeTeamName) return "clue_giver" as const
  return "waiting" as const
}

export function serialiseSpotlightState(state: SpotlightRoomState) {
  return {
    roundIndex: state.roundIndex,
    status: state.status,
    turnOrderPlayerIds: state.turnOrderPlayerIds,
    currentTurnIndex: state.currentTurnIndex,
    activeGuesserId: state.activeGuesserId,
    activeTeamName: state.activeTeamName,
    turnStartedAt: state.turnStartedAt,
    turnEndsAt: state.turnEndsAt,
    currentTurnActions: state.currentTurnActions,
    completedTurns: state.completedTurns,
  }
}
