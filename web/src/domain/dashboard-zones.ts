/**
 * Dashboard zone resolution logic.
 *
 * Purpose: Maps agent messages to dashboard zones using the world's dashboardZones config.
 * Key features:
 * - resolveZoneContent: scans messages to find the latest per-agent message for each zone
 * - routeStreamEventToZone: maps an SSE agentName to a zone id for real-time routing
 *
 * Notes:
 * - Zones are keyed by zone.id from the dashboardZones config
 * - Agent matching uses the zone.agent field against message.sender
 * - Only non-system, non-tool messages are considered for zone content
 */

import { DashboardZone, DashboardZoneState, Message } from '../types';

/**
 * Check if a message is eligible for dashboard zone display.
 * Excludes system messages, tool events, log events, and user-entered messages.
 */
export function isZoneEligibleMessage(message: Message): boolean {
  if (message.isToolEvent) return false;
  if (message.logEvent) return false;
  if (message.worldEvent) return false;
  if (message.userEntered) return false;
  if (message.type === 'system') return false;
  if (message.type === 'log') return false;
  if (!message.text || message.text.trim() === '') return false;
  return true;
}

/**
 * Resolve the latest zone content from a list of messages.
 * For each dashboard zone, finds the most recent eligible message from the assigned agent.
 *
 * @param zones - Dashboard zone configuration from world config
 * @param messages - Full message list (chronological order)
 * @returns Map of zone id -> DashboardZoneState
 */
export function resolveZoneContent(
  zones: DashboardZone[],
  messages: Message[]
): Map<string, DashboardZoneState> {
  const result = new Map<string, DashboardZoneState>();

  // Initialize all zones with empty state
  for (const zone of zones) {
    result.set(zone.id, { message: null, isStreaming: false });
  }

  // Build agent -> zone id lookup
  const agentToZone = new Map<string, string>();
  for (const zone of zones) {
    agentToZone.set(zone.agent, zone.id);
  }

  // Scan messages in reverse to find the latest per agent
  const found = new Set<string>();
  for (let i = messages.length - 1; i >= 0; i--) {
    if (found.size === zones.length) break;

    const msg = messages[i];
    const zoneId = agentToZone.get(msg.sender);
    if (!zoneId || found.has(zoneId)) continue;
    if (!isZoneEligibleMessage(msg)) continue;

    result.set(zoneId, {
      message: msg,
      isStreaming: msg.isStreaming || false,
    });
    found.add(zoneId);
  }

  return result;
}

/**
 * Route an SSE event's agentName to the corresponding dashboard zone id.
 *
 * @param zones - Dashboard zone configuration
 * @param agentName - The agent name from the SSE event
 * @returns The zone id, or null if the agent isn't assigned to any zone
 */
export function routeStreamEventToZone(
  zones: DashboardZone[],
  agentName: string
): string | null {
  const zone = zones.find(z => z.agent === agentName);
  return zone ? zone.id : null;
}
