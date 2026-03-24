/**
 * Purpose:
 * - Own the World activity-event state transitions used by the streaming update surface.
 *
 * Key Features:
 * - Normalizes activity payload agent IDs.
 * - Resolves the active waiting agent from world activity events.
 * - Computes waiting-state transitions without changing the event contract.
 *
 * Notes on Implementation:
 * - Extracted from `runtime.ts` so the runtime composition file stays focused on flow wiring.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Moved World activity handler logic into a dedicated runtime module.
 */

import type { WorldComponentState } from '../../../types';

function normalizeActivityAgentKey(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  return raw.startsWith('agent:') ? raw.slice('agent:'.length) : raw;
}

function areSameActiveAgent(
  left: WorldComponentState['activeAgent'],
  right: WorldComponentState['activeAgent'],
): boolean {
  return (left?.name || '') === (right?.name || '')
    && (left?.spriteIndex ?? -1) === (right?.spriteIndex ?? -1);
}

function resolveActiveAgentFromActivity(
  state: WorldComponentState,
  activity: any,
  shouldWait: boolean,
): WorldComponentState['activeAgent'] {
  if (!shouldWait) {
    return null;
  }

  const activeAgentKeys = Array.isArray(activity?.activeAgentNames)
    ? activity.activeAgentNames
      .map(normalizeActivityAgentKey)
      .filter(Boolean)
    : [];

  if (activeAgentKeys.length === 0 && activity?.type === 'response-start') {
    const sourceAgentKey = normalizeActivityAgentKey(activity?.source);
    if (sourceAgentKey) {
      activeAgentKeys.push(sourceAgentKey);
    }
  }

  if (activeAgentKeys.length !== 1) {
    return null;
  }

  const agentKey = activeAgentKeys[0].toLowerCase();
  const matchingAgent = (state.world?.agents || []).find((agent) => {
    const agentId = String(agent?.id || '').trim().toLowerCase();
    const agentName = String(agent?.name || '').trim().toLowerCase();
    return agentKey === agentId || agentKey === agentName;
  });

  if (!matchingAgent) {
    return null;
  }

  return {
    name: matchingAgent.name,
    spriteIndex: matchingAgent.spriteIndex,
  };
}

export function handleWorldActivity(state: WorldComponentState, activity: any): WorldComponentState | void {
  if (!activity || (activity.type !== 'response-start' && activity.type !== 'response-end' && activity.type !== 'idle')) {
    console.log('[World] Invalid event type, no state change');
    return;
  }

  const activityId = typeof activity.activityId === 'number' ? activity.activityId : null;
  const pending = typeof activity.pendingOperations === 'number' ? activity.pendingOperations : 0;
  const source = typeof activity.source === 'string' ? activity.source : '';
  const shouldWait = pending > 0;
  const nextActiveAgent = resolveActiveAgentFromActivity(state, activity, shouldWait);

  if (activity.type === 'response-start') {
    console.log(`[World] Processing started | pending: ${pending} | activityId: ${activityId} | source: ${source} | isWaiting: ${state.isWaiting} → ${shouldWait}`);
  } else if (activity.type === 'idle' && pending === 0) {
    console.log(`[World] All processing complete | pending: ${pending} | activityId: ${activityId} | source: ${source} | isWaiting: ${state.isWaiting} → ${shouldWait}`);
  } else if (activity.type === 'response-end') {
    console.log(`[World] Processing ended | pending: ${pending} | activityId: ${activityId} | source: ${source} | isWaiting: ${state.isWaiting} → ${shouldWait}`);
  }

  if (state.isWaiting !== shouldWait || !areSameActiveAgent(state.activeAgent, nextActiveAgent)) {
    return {
      ...state,
      isWaiting: shouldWait,
      activeAgent: nextActiveAgent,
      needScroll: true,
    };
  }
}
