/**
 * World Info Stats Domain Helpers
 * Purpose:
 * - Derive stable sidebar summary stats for the selected world.
 *
 * Key Features:
 * - Normalizes total agents from world metadata with agent-list fallback.
 * - Computes chat count from the loaded session list.
 * - Preserves turn-limit fallback behavior for the world info card.
 *
 * Implementation Notes:
 * - Pure helper only; no React or IPC dependencies.
 * - Chat count reflects the sessions currently loaded into the left sidebar.
 *
 * Recent Changes:
 * - 2026-03-14: Added chat-count derivation for the Electron world info sidebar.
 */

export type WorldInfoStats = {
  totalAgents: number;
  totalChats: number;
  turnLimit: number;
};

function parseOptionalInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.floor(parsed));
}

export function deriveWorldInfoStats(
  world: { totalAgents?: unknown; turnLimit?: unknown; agents?: unknown } | null | undefined,
  sessions: unknown,
  minimumTurnLimit: number,
  defaultTurnLimit: number,
): WorldInfoStats {
  const sessionList = Array.isArray(sessions) ? sessions : [];
  const fallbackTotalAgents = Array.isArray(world?.agents) ? world.agents.length : 0;
  const totalAgents = parseOptionalInteger(world?.totalAgents, fallbackTotalAgents);
  const turnLimitCandidate = parseOptionalInteger(world?.turnLimit, minimumTurnLimit);

  return {
    totalAgents,
    totalChats: sessionList.length,
    turnLimit: turnLimitCandidate || defaultTurnLimit,
  };
}