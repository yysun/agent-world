/**
 * Human-in-the-Loop (HITL) Runtime
 *
 * Purpose:
 * - Provide a world-scoped request/response flow for option-based HITL prompts.
 *
 * Key Features:
 * - Emits structured tool-progress events carrying HITL prompt payloads.
 * - Resolves pending requests when renderer/API submits an option response.
 * - Exposes unresolved option prompts through a deterministic read model.
 * - Maintains pending request map for validation and lifecycle cleanup.
 *
 * Implementation Notes:
 * - Requests are keyed by `(worldId, requestId)` to avoid cross-world collisions.
 * - Prompt read model is deterministic and scoped by `(worldId, chatId)`.
 * - Runtime is in-memory and process-local by design.
 *
 * Recent Changes:
 * - 2026-02-25: Added HITL runtime trace logs for request emission, replay, and resolution lifecycle diagnostics.
 * - 2026-02-24: Removed HITL `system` event emission/replay and switched to tool-progress prompt payloads.
 * - 2026-02-24: Added `listPendingHitlPromptEvents` to expose scoped pending HITL prompt payloads for web chat-switch replay.
 * - 2026-02-24: Removed timeout auto-resolution and added deterministic replay helpers for unresolved HITL requests.
 * - 2026-02-20: Enforced global options-only HITL runtime by removing input-mode request/response paths.
 * - 2026-02-14: Added initial generic HITL option request/response runtime.
 */

import { type AgentMessage, type World } from './types.js';
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
  prompt: {
    requestId: string;
    title: string;
    message: string;
    options: HitlOption[];
    defaultOptionId: string;
    metadata: Record<string, unknown> | null;
    agentName: string | null;
    toolName: string;
    toolCallId: string;
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

function emitPendingRequest(world: World, pending: PendingHitlOptionRequest): void {
  const metadata = pending.prompt.metadata || null;
  const toolExecutionMetadata = {
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
    hitlPrompt: {
      requestId: pending.prompt.requestId,
      title: pending.prompt.title,
      message: pending.prompt.message,
      options: pending.prompt.options,
      defaultOptionId: pending.prompt.defaultOptionId,
      metadata,
      agentName: pending.prompt.agentName,
      chatId: pending.chatId,
    },
  };

  world.eventEmitter.emit('world', {
    agentName: pending.prompt.agentName || 'system',
    type: 'tool-progress',
    messageId: pending.prompt.toolCallId,
    chatId: pending.chatId,
    toolExecution: {
      toolName: pending.prompt.toolName,
      toolCallId: pending.prompt.toolCallId,
      metadata: toolExecutionMetadata,
    },
  });

  console.log(
    `[hitl] emit-pending world=${world.id} chat=${pending.chatId || 'n/a'} requestId=${pending.prompt.requestId} toolName=${pending.prompt.toolName} toolCallId=${pending.prompt.toolCallId}`
  );
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

  const requestMetadata = request.metadata && typeof request.metadata === 'object'
    ? request.metadata
    : null;
  const explicitRequestId = String(request.requestId || '').trim();
  const requestedToolCallId = requestMetadata && typeof requestMetadata.toolCallId === 'string'
    ? String(requestMetadata.toolCallId).trim()
    : '';
  if (explicitRequestId && requestedToolCallId && explicitRequestId !== requestedToolCallId) {
    throw new Error(`HITL requestId '${explicitRequestId}' must match toolCallId '${requestedToolCallId}'.`);
  }
  const requestId = explicitRequestId || requestedToolCallId || generateId();
  const chatId = normalizeWorldChatId(world, request.chatId);
  const defaultOptionId = resolveDefaultOptionId(normalizedOptions, request.defaultOptionId);
  const pendingKey = getPendingKey(worldId, requestId);
  const sequence = ++pendingRequestSequence;
  const requestedToolName = requestMetadata && typeof requestMetadata.tool === 'string'
    ? String(requestMetadata.tool).trim()
    : '';

  const prompt: PendingHitlOptionRequest['prompt'] = {
    requestId,
    title: String(request.title || '').trim(),
    message: String(request.message || '').trim(),
    options: normalizedOptions,
    defaultOptionId,
    metadata: requestMetadata,
    agentName: resolveHitlAgentName(world, request.agentName),
    toolName: requestedToolName || 'human_intervention_request',
    toolCallId: requestedToolCallId || requestId,
  };

  return await new Promise<HitlOptionResolution>((resolve) => {
    const pending: PendingHitlOptionRequest = {
      worldId,
      requestId,
      chatId,
      optionIds: new Set(normalizedOptions.map((option) => option.id)),
      sequence,
      prompt,
      metadata: requestMetadata,
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
    console.log(
      `[hitl] request-queued world=${worldId} chat=${chatId || 'n/a'} requestId=${requestId} options=${normalizedOptions.length}`
    );
    emitPendingRequest(world, pending);
  });
}

function parseToolCallArguments(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeOptionsFromToolArgs(args: Record<string, unknown>): Array<{ id: string; label: string }> {
  const options = Array.isArray(args.options) ? args.options : [];
  const normalized: Array<{ id: string; label: string }> = [];
  const seen = new Set<string>();

  for (let index = 0; index < options.length; index += 1) {
    const label = String(options[index] || '').trim();
    if (!label) {
      continue;
    }
    const dedupeKey = label.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    normalized.push({
      id: `opt_${normalized.length + 1}`,
      label,
    });
  }

  return normalized;
}

function resolveDefaultOptionFromToolArgs(
  normalizedOptions: Array<{ id: string; label: string }>,
  args: Record<string, unknown>,
): string {
  const defaultOptionLabel = String(args.defaultOption || '').trim().toLowerCase();
  if (defaultOptionLabel) {
    const explicit = normalizedOptions.find((option) => option.label.toLowerCase() === defaultOptionLabel);
    if (explicit) {
      return explicit.id;
    }
  }
  return normalizedOptions.find((option) => option.id === 'no')?.id || normalizedOptions[0]?.id || 'opt_1';
}

export function listPendingHitlPromptEventsFromMessages(
  messages: AgentMessage[],
  chatId?: string | null,
): Array<{ chatId: string | null; prompt: { requestId: string; title: string; message: string; options: Array<{ id: string; label: string }>; defaultOptionId: string; metadata: Record<string, unknown> | null; agentName: string | null; toolName: string; toolCallId: string } }> {
  const allMessages = Array.isArray(messages) ? messages : [];
  const resolvedToolCallIds = new Set<string>();

  for (const message of allMessages) {
    if (message?.role !== 'tool') {
      continue;
    }
    const toolCallId = String(message?.tool_call_id || '').trim();
    if (!toolCallId) {
      continue;
    }
    resolvedToolCallIds.add(toolCallId);
  }

  const unresolvedById = new Map<string, { chatId: string | null; prompt: { requestId: string; title: string; message: string; options: Array<{ id: string; label: string }>; defaultOptionId: string; metadata: Record<string, unknown> | null; agentName: string | null; toolName: string; toolCallId: string } }>();

  for (const message of allMessages) {
    if (message?.role !== 'assistant' || !Array.isArray(message?.tool_calls)) {
      continue;
    }

    for (const toolCall of message.tool_calls) {
      const toolName = String(toolCall?.function?.name || '').trim();
      const toolCallId = String(toolCall?.id || '').trim();
      if (!toolCallId || toolName !== 'human_intervention_request') {
        continue;
      }
      if (resolvedToolCallIds.has(toolCallId) || unresolvedById.has(toolCallId)) {
        continue;
      }

      const args = parseToolCallArguments(toolCall?.function?.arguments);
      if (!args) {
        continue;
      }

      const options = normalizeOptionsFromToolArgs(args);
      if (options.length === 0) {
        continue;
      }

      const messageChatId = message?.chatId ? String(message.chatId) : null;
      const normalizedChatId = messageChatId || (chatId ? String(chatId) : null);
      const metadata = args.metadata && typeof args.metadata === 'object' && !Array.isArray(args.metadata)
        ? (args.metadata as Record<string, unknown>)
        : null;

      unresolvedById.set(toolCallId, {
        chatId: normalizedChatId,
        prompt: {
          requestId: toolCallId,
          title: 'Human input required',
          message: String(args.question || args.prompt || '').trim(),
          options,
          defaultOptionId: resolveDefaultOptionFromToolArgs(options, args),
          metadata,
          agentName: String(message?.sender || '').trim() || null,
          toolName,
          toolCallId,
        },
      });
    }
  }

  return [...unresolvedById.values()];
}

export function replayPendingHitlRequests(world: World, chatId?: string | null): number {
  const worldId = String(world?.id || '').trim();
  if (!worldId) {
    return 0;
  }

  const pendingForScope = getSortedPendingRequestsForScope(worldId, chatId);
  console.log(
    `[hitl] replay-pending world=${worldId} chat=${chatId || 'n/a'} count=${pendingForScope.length}`
  );
  for (const pending of pendingForScope) {
    emitPendingRequest(world, pending);
  }
  return pendingForScope.length;
}

export function listPendingHitlPromptEvents(
  world: World,
  chatId?: string | null,
): Array<{ chatId: string | null; prompt: PendingHitlOptionRequest['prompt'] }> {
  const worldId = String(world?.id || '').trim();
  if (!worldId) {
    return [];
  }

  const pendingForScope = getSortedPendingRequestsForScope(worldId, chatId);
  return pendingForScope.map((pending) => ({
    chatId: pending.chatId,
    prompt: pending.prompt,
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
    console.log(
      `[hitl] submit-rejected-invalid world=${worldId || 'n/a'} requestId=${requestId || 'n/a'} optionId=${optionId || 'n/a'}`
    );
    return { accepted: false, reason: 'worldId, requestId, and optionId are required.' };
  }

  const pendingKey = getPendingKey(worldId, requestId);
  const pending = pendingHitlRequests.get(pendingKey);
  if (!pending) {
    console.log(
      `[hitl] submit-rejected-missing world=${worldId} requestId=${requestId} optionId=${optionId}`
    );
    return { accepted: false, reason: `No pending HITL request found for requestId '${requestId}'.` };
  }

  const scopeValidation = validateResponseScope(pending, params.chatId);
  if (!scopeValidation.valid) {
    console.log(
      `[hitl] submit-rejected-scope world=${worldId} requestId=${requestId} optionId=${optionId} reason=${scopeValidation.reason}`
    );
    return { accepted: false, reason: scopeValidation.reason };
  }

  if (!pending.optionIds.has(optionId)) {
    console.log(
      `[hitl] submit-rejected-option world=${worldId} requestId=${requestId} optionId=${optionId}`
    );
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

  console.log(
    `[hitl] submit-accepted world=${worldId} chat=${pending.chatId || 'n/a'} requestId=${requestId} optionId=${optionId}`
  );

  return { accepted: true, metadata: pending.metadata };
}

export function clearHitlStateForTests(): void {
  pendingHitlRequests.clear();
  pendingRequestSequence = 0;
}
