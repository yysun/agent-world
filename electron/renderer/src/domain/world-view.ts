/**
 * World View Domain Helpers
 * Purpose:
 * - Define typed world-view modes and pure helpers for alternate message-rendering layouts.
 *
 * Key Features:
 * - Canonical world view mode typing (`chat`, `board`, `grid`, `canvas`).
 * - Canonical grid layout choices (`1+2`, `2+1`, `2+2`).
 * - Pure partitioning helpers for user-thread and agent-lane rendering.
 *
 * Implementation Notes:
 * - Keeps view-state and grouping logic outside React components.
 * - Preserves deterministic ordering by carrying original message indexes.
 *
 * Recent Changes:
 * - 2026-03-04: Added initial world-view types and message partitioning helpers for Chat/Board/Grid/Canvas rendering.
 */

export type WorldViewMode = 'chat' | 'board' | 'grid' | 'canvas';

export type WorldGridLayoutChoiceId = '1+2' | '2+1' | '2+2';

export type WorldGridLayoutChoice = {
  id: WorldGridLayoutChoiceId;
  label: '1+2' | '2+1' | '2+2';
};

export const WORLD_VIEW_MODE_OPTIONS: Array<{ value: WorldViewMode; label: string }> = [
  { value: 'chat', label: 'Chat View' },
  { value: 'board', label: 'Board View' },
  { value: 'grid', label: 'Grid View' },
  { value: 'canvas', label: 'Canvas View' },
];

export const WORLD_GRID_LAYOUT_CHOICES: WorldGridLayoutChoice[] = [
  { id: '1+2', label: '1+2' },
  { id: '2+1', label: '2+1' },
  { id: '2+2', label: '2+2' },
];

export type IndexedMessage = {
  message: any;
  index: number;
};

export type AgentLane = {
  id: string;
  label: string;
  messages: IndexedMessage[];
};

export type PartitionedWorldViewMessages = {
  userMessages: IndexedMessage[];
  systemMessages: IndexedMessage[];
  agentLanes: AgentLane[];
};

export function normalizeWorldViewMode(value: unknown): WorldViewMode {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'board' || normalized === 'grid' || normalized === 'canvas') {
    return normalized;
  }
  return 'chat';
}

export function normalizeWorldGridLayoutChoiceId(value: unknown): WorldGridLayoutChoiceId {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === '2+1' || normalized === '2+2') {
    return normalized;
  }
  return '1+2';
}

function isHumanSenderValue(value: unknown): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'human' || normalized === 'user';
}

function isLikelyHumanMessage(message: any): boolean {
  const role = String(message?.role || '').trim().toLowerCase();
  const sender = String(message?.sender || '').trim().toLowerCase();
  if (isHumanSenderValue(sender)) {
    return true;
  }
  return role === 'user' && !sender;
}

function isSystemMessage(message: any): boolean {
  const role = String(message?.role || '').trim().toLowerCase();
  const type = String(message?.type || '').trim().toLowerCase();
  return role === 'system' || type === 'system' || type === 'log' || Boolean(message?.logEvent);
}

function normalizeLaneId(message: any): string {
  const fromAgentId = String(message?.fromAgentId || '').trim();
  if (fromAgentId) {
    return `agent:${fromAgentId}`;
  }
  const sender = String(message?.sender || '').trim();
  if (sender) {
    return `sender:${sender.toLowerCase()}`;
  }
  return 'agent:unknown';
}

function resolveLaneLabel(message: any): string {
  const sender = String(message?.sender || '').trim();
  if (sender) {
    return sender;
  }
  const fromAgentId = String(message?.fromAgentId || '').trim();
  if (fromAgentId) {
    return fromAgentId;
  }
  return 'Agent';
}

function getLatestMessageTimestampValue(messages: IndexedMessage[]): number {
  const latest = messages[messages.length - 1]?.message;
  const date = String(latest?.createdAt || '').trim();
  const parsed = Number(new Date(date).getTime());
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return messages[messages.length - 1]?.index ?? 0;
}

export function sortAgentLanesForGrid(lanes: AgentLane[], choiceId: WorldGridLayoutChoiceId): AgentLane[] {
  if (choiceId === '2+2') {
    return [...lanes].sort((left, right) => left.label.localeCompare(right.label));
  }

  if (choiceId === '2+1') {
    return [...lanes].sort((left, right) => getLatestMessageTimestampValue(right.messages) - getLatestMessageTimestampValue(left.messages));
  }

  return lanes;
}

export function partitionWorldViewMessages(messages: any[]): PartitionedWorldViewMessages {
  const userMessages: IndexedMessage[] = [];
  const systemMessages: IndexedMessage[] = [];
  const laneMap = new Map<string, AgentLane>();

  messages.forEach((message, index) => {
    const indexedMessage: IndexedMessage = { message, index };
    if (isLikelyHumanMessage(message)) {
      userMessages.push(indexedMessage);
      return;
    }

    if (isSystemMessage(message)) {
      systemMessages.push(indexedMessage);
      return;
    }

    const laneId = normalizeLaneId(message);
    const existingLane = laneMap.get(laneId);
    if (existingLane) {
      existingLane.messages.push(indexedMessage);
      return;
    }

    laneMap.set(laneId, {
      id: laneId,
      label: resolveLaneLabel(message),
      messages: [indexedMessage],
    });
  });

  return {
    userMessages,
    systemMessages,
    agentLanes: [...laneMap.values()],
  };
}

export function getGridContainerClassName(choiceId: WorldGridLayoutChoiceId): string {
  return 'grid grid-cols-1 gap-3 md:grid-cols-2';
}

export function getGridLaneClassName(choiceId: WorldGridLayoutChoiceId, laneIndex: number): string {
  if (choiceId === '1+2' && laneIndex === 0) {
    return 'md:col-span-2';
  }

  if (choiceId === '2+1' && laneIndex === 2) {
    return 'md:col-span-2';
  }

  return '';
}
