/**
 * Human-in-the-Loop (HITL) Runtime
 *
 * Purpose:
 * - Provide a world-scoped request/response flow for option-based HITL prompts.
 *
 * Key Features:
 * - Emits structured system events for option prompts (`hitl-option-request`).
 * - Resolves pending requests when renderer/API submits an option response.
 * - Replays unresolved option prompts on chat load to recover prompt visibility.
 * - Maintains pending request map for validation and lifecycle cleanup.
 *
 * Implementation Notes:
 * - Requests are keyed by `(worldId, requestId)` to avoid cross-world collisions.
 * - Replay is deterministic and scoped by `(worldId, chatId)`.
 * - Runtime is in-memory and process-local by design.
 *
 * Recent Changes:
 * - 2026-02-24: Added `listPendingHitlPromptEvents` to expose scoped pending HITL prompt payloads for web chat-switch replay.
 * - 2026-02-24: Removed timeout auto-resolution and added deterministic replay helpers for unresolved HITL requests.
 * - 2026-02-20: Enforced global options-only HITL runtime by removing input-mode request/response paths.
 * - 2026-02-14: Added initial generic HITL option request/response runtime.
 */

import { type World, type WorldSystemEvent } from './types.js';
import { generateId } from './utils.js';

export interface HitlOption {
  id: string;
  label: string;
  description?: string;
}

export interface HitlOptionRequest {
  requestId?: string;
  title: string;
  message: string;
  options: HitlOption[];
  chatId?: string | null;
  timeoutMs?: number;
  defaultOptionId?: string;
  metadata?: Record<string, unknown>;
  agentName?: string | null;
}

export interface HitlOptionResolution {
  requestId: string;
  worldId: string;
  chatId: string | null;
  optionId: string;
  source: 'user' | 'timeout';
}

export type HitlResponseResolution = {
  requestId: string;
  worldId: string;
  chatId: string | null;
  optionId: string;
  source: 'user' | 'timeout';
};

interface PendingHitlOptionRequest {
  worldId: string;
  requestId: string;
  chatId: string | null;
  optionIds: Set<string>;
  sequence: number;
  eventContent: {
    eventType: 'hitl-option-request';
    requestId: string;
    title: string;
    message: string;
    options: HitlOption[];
    defaultOptionId: string;
    metadata: Record<string, unknown> | null;
    agentName: string | null;
    replay?: true;
  };
  metadata: Record<string, unknown> | null;
  resolve: (resolution: HitlResponseResolution) => void;
}

const pendingHitlRequests = new Map<string, PendingHitlOptionRequest>();
let pendingRequestSequence = 0;

function getPendingKey(worldId: string, requestId: string): string {
  return `${worldId}::${requestId}`;
}

function normalizeOptions(options: HitlOption[]): HitlOption[] {
  const seen = new Set<string>();
  const normalized: HitlOption[] = [];
  for (const option of options) {
    const id = String(option?.id || '').trim();
    const label = String(option?.label || '').trim();
    if (!id || !label || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push({
      id,
      label,
      description: option?.description ? String(option.description) : undefined,
    });
  }
  return normalized;
}

function resolveDefaultOptionId(
  options: HitlOption[],
  preferredDefaultOptionId?: string,
): string {
  const preferred = String(preferredDefaultOptionId || '').trim();
  if (preferred && options.some((option) => option.id === preferred)) {
    return preferred;
  }
  const explicitNo = options.find((option) => option.id === 'no');
  if (explicitNo) {
    return explicitNo.id;
  }
  return options[0]?.id || 'no';
}

function normalizeWorldChatId(world: World, chatId: string | null | undefined): string | null {
  if (chatId !== undefined) {
    const normalized = chatId ? String(chatId).trim() : '';
    return normalized || null;
  }
  return world.currentChatId ?? null;
}

function resolvePendingRequest(params: {
  pendingKey: string;
  pending: PendingHitlOptionRequest;
  resolution: HitlResponseResolution;
}): void {
  const { pendingKey, pending, resolution } = params;
  pendingHitlRequests.delete(pendingKey);
  pending.resolve(resolution);
}

function normalizeChatId(chatId: string | null | undefined): string | null {
  if (chatId === undefined || chatId === null) {
    return null;
  }
  const normalized = String(chatId).trim();
  return normalized || null;
}

function resolveHitlAgentName(world: World, requestedAgentName: string | null | undefined): string | null {
  const explicit = String(requestedAgentName || '').trim();
  if (explicit) {
    return explicit;
  }

  const worldMainAgent = String(world?.mainAgent || '').trim();
  if (worldMainAgent) {
    return worldMainAgent;
  }

  return null;
}

function emitPendingRequest(world: World, pending: PendingHitlOptionRequest, replay: boolean): void {
  const eventContent = replay
    ? { ...pending.eventContent, replay: true as const }
    : pending.eventContent;
  const event: WorldSystemEvent = {
    messageId: generateId(),
    timestamp: new Date(),
    chatId: pending.chatId,
    content: eventContent,
  };
  world.eventEmitter.emit('system', event);
}

function getSortedPendingRequestsForScope(worldId: string, chatId?: string | null): PendingHitlOptionRequest[] {
  const normalizedChatId = normalizeChatId(chatId);
  const scoped = [...pendingHitlRequests.values()].filter((pending) => {
    if (pending.worldId !== worldId) {
      return false;
    }
    if (normalizedChatId === null) {
      return true;
    }
    return pending.chatId === normalizedChatId;
  });

  scoped.sort((left, right) => left.sequence - right.sequence);
  return scoped;
}

function validateResponseScope(
  pending: PendingHitlOptionRequest,
  chatId?: string | null,
): { valid: true } | { valid: false; reason: string } {
  if (chatId === undefined) {
    return { valid: true };
  }

  const normalizedIncoming = chatId === null ? null : String(chatId).trim() || null;
  if (pending.chatId && pending.chatId !== normalizedIncoming) {
    return {
      valid: false,
      reason: `Request '${pending.requestId}' belongs to chat '${pending.chatId}', not '${normalizedIncoming}'.`,
    };
  }

  return { valid: true };
}

export async function requestWorldOption(
  world: World,
  request: HitlOptionRequest,
): Promise<HitlOptionResolution> {
  const normalizedOptions = normalizeOptions(Array.isArray(request.options) ? request.options : []);
  if (normalizedOptions.length === 0) {
    throw new Error('HITL option request requires at least one valid option.');
  }

  const worldId = String(world.id || '').trim();
  if (!worldId) {
    throw new Error('Cannot request HITL option without a valid world ID.');
  }

  const requestId = String(request.requestId || '').trim() || generateId();
  const chatId = normalizeWorldChatId(world, request.chatId);
  const defaultOptionId = resolveDefaultOptionId(normalizedOptions, request.defaultOptionId);
  const pendingKey = getPendingKey(worldId, requestId);
  const sequence = ++pendingRequestSequence;

  const eventContent: PendingHitlOptionRequest['eventContent'] = {
    eventType: 'hitl-option-request',
    requestId,
    title: String(request.title || '').trim(),
    message: String(request.message || '').trim(),
    options: normalizedOptions,
    defaultOptionId,
    metadata: request.metadata || null,
    agentName: resolveHitlAgentName(world, request.agentName),
  };

  return await new Promise<HitlOptionResolution>((resolve) => {
    const pending: PendingHitlOptionRequest = {
      worldId,
      requestId,
      chatId,
      optionIds: new Set(normalizedOptions.map((option) => option.id)),
      sequence,
      eventContent,
      metadata: request.metadata || null,
      resolve: (resolution) => {
        resolve({
          requestId: resolution.requestId,
          worldId: resolution.worldId,
          chatId: resolution.chatId,
          optionId: resolution.optionId,
          source: resolution.source,
        });
      },
    };

    pendingHitlRequests.set(pendingKey, pending);
    emitPendingRequest(world, pending, false);
  });
}

export function replayPendingHitlRequests(world: World, chatId?: string | null): number {
  const worldId = String(world?.id || '').trim();
  if (!worldId) {
    return 0;
  }

  const pendingForScope = getSortedPendingRequestsForScope(worldId, chatId);
  for (const pending of pendingForScope) {
    emitPendingRequest(world, pending, true);
  }
  return pendingForScope.length;
}

export function listPendingHitlPromptEvents(
  world: World,
  chatId?: string | null,
): Array<{ chatId: string | null; content: PendingHitlOptionRequest['eventContent'] }> {
  const worldId = String(world?.id || '').trim();
  if (!worldId) {
    return [];
  }

  const pendingForScope = getSortedPendingRequestsForScope(worldId, chatId);
  return pendingForScope.map((pending) => ({
    chatId: pending.chatId,
    content: pending.eventContent,
  }));
}

export function submitWorldOptionResponse(params: {
  worldId: string;
  requestId: string;
  optionId: string;
  chatId?: string | null;
}): { accepted: boolean; reason?: string; metadata?: Record<string, unknown> | null } {
  return submitWorldHitlResponse(params);
}

export function submitWorldHitlResponse(params: {
  worldId: string;
  requestId: string;
  optionId: string;
  chatId?: string | null;
}): { accepted: boolean; reason?: string; metadata?: Record<string, unknown> | null } {
  const worldId = String(params.worldId || '').trim();
  const requestId = String(params.requestId || '').trim();
  const optionId = String(params.optionId || '').trim();

  if (!worldId || !requestId || !optionId) {
    return { accepted: false, reason: 'worldId, requestId, and optionId are required.' };
  }

  const pendingKey = getPendingKey(worldId, requestId);
  const pending = pendingHitlRequests.get(pendingKey);
  if (!pending) {
    return { accepted: false, reason: `No pending HITL request found for requestId '${requestId}'.` };
  }

  const scopeValidation = validateResponseScope(pending, params.chatId);
  if (!scopeValidation.valid) {
    return { accepted: false, reason: scopeValidation.reason };
  }

  if (!pending.optionIds.has(optionId)) {
    return { accepted: false, reason: `Invalid option '${optionId}' for requestId '${requestId}'.` };
  }

  resolvePendingRequest({
    pendingKey,
    pending,
    resolution: {
      requestId,
      worldId,
      chatId: pending.chatId,
      optionId,
      source: 'user',
    },
  });

  return { accepted: true, metadata: pending.metadata };
}

export function clearHitlStateForTests(): void {
  pendingHitlRequests.clear();
  pendingRequestSequence = 0;
}
