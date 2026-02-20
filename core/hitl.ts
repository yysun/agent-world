/**
 * Human-in-the-Loop (HITL) Runtime
 *
 * Purpose:
 * - Provide a world-scoped request/response flow for option-based HITL prompts.
 *
 * Key Features:
 * - Emits structured system events for option prompts (`hitl-option-request`).
 * - Resolves pending requests when renderer/API submits an option response.
 * - Supports deterministic timeout fallback for option requests.
 * - Maintains pending request map for validation and lifecycle cleanup.
 *
 * Implementation Notes:
 * - Requests are keyed by `(worldId, requestId)` to avoid cross-world collisions.
 * - Timeout fallback defaults to `no` when available, otherwise first option.
 * - Runtime is in-memory and process-local by design.
 *
 * Recent Changes:
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
  defaultOptionId: string;
  metadata: Record<string, unknown> | null;
  resolve: (resolution: HitlResponseResolution) => void;
  timeoutHandle: NodeJS.Timeout | null;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const pendingHitlRequests = new Map<string, PendingHitlOptionRequest>();

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

function normalizeTimeoutMs(timeoutMs: unknown): number {
  const timeoutMsRaw = Number(timeoutMs ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
    ? Math.floor(timeoutMsRaw)
    : DEFAULT_TIMEOUT_MS;
}

function resolvePendingRequest(params: {
  pendingKey: string;
  pending: PendingHitlOptionRequest;
  resolution: HitlResponseResolution;
}): void {
  const { pendingKey, pending, resolution } = params;
  pendingHitlRequests.delete(pendingKey);
  if (pending.timeoutHandle) {
    clearTimeout(pending.timeoutHandle);
  }
  pending.resolve(resolution);
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
  const timeoutMs = normalizeTimeoutMs(request.timeoutMs);
  const defaultOptionId = resolveDefaultOptionId(normalizedOptions, request.defaultOptionId);
  const pendingKey = getPendingKey(worldId, requestId);

  return await new Promise<HitlOptionResolution>((resolve) => {
    const pending: PendingHitlOptionRequest = {
      worldId,
      requestId,
      chatId,
      optionIds: new Set(normalizedOptions.map((option) => option.id)),
      defaultOptionId,
      metadata: request.metadata || null,
      timeoutHandle: null,
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

    pending.timeoutHandle = setTimeout(() => {
      const timeoutPending = pendingHitlRequests.get(pendingKey);
      if (!timeoutPending) {
        return;
      }
      resolvePendingRequest({
        pendingKey,
        pending: timeoutPending,
        resolution: {
          requestId,
          worldId,
          chatId,
          optionId: timeoutPending.defaultOptionId,
          source: 'timeout',
        },
      });
    }, timeoutMs);

    pendingHitlRequests.set(pendingKey, pending);

    const event: WorldSystemEvent = {
      messageId: generateId(),
      timestamp: new Date(),
      chatId,
      content: {
        eventType: 'hitl-option-request',
        requestId,
        title: String(request.title || '').trim(),
        message: String(request.message || '').trim(),
        options: normalizedOptions,
        defaultOptionId,
        timeoutMs,
        metadata: request.metadata || null,
      },
    };
    world.eventEmitter.emit('system', event);
  });
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
  for (const pending of pendingHitlRequests.values()) {
    if (pending.timeoutHandle) {
      clearTimeout(pending.timeoutHandle);
    }
  }
  pendingHitlRequests.clear();
}
