/**
 * Web HITL Domain Helpers
 *
 * Purpose:
 * - Provide pure helper functions for parsing and managing HITL option prompts
 *   from tool-event payloads and pending HITL read-model payloads.
 *
 * Key Features:
 * - Parse HITL prompt payloads from tool events and pending prompt envelopes.
 * - Deduplicate prompt queue entries by requestId.
 * - Remove resolved prompts from queue.
 *
 * Implementation Notes:
 * - Parsing is strict about required fields (`requestId`, option ids/labels).
 * - Default option falls back to `no` when present, otherwise first option.
 *
 * Recent Changes:
 * - 2026-03-11: Added chat-scoped prompt selection helpers so pending HITL state can survive chat switches without
 *   leaking prompts into the wrong chat UI.
 * - 2026-02-26: Clarified helper support for tool-progress `hitlPrompt` payloads and pending prompt envelopes.
 * - 2026-02-14: Added initial HITL prompt parsing/queue helpers for web client flows.
 */

import type { HitlPromptOption, HitlPromptRequest } from '../types';

function normalizeHitlPrompt(promptLike: Record<string, unknown>, fallbackChatId: string | null): HitlPromptRequest | null {
  const requestId = String(promptLike.requestId || '').trim();
  if (!requestId) {
    return null;
  }

  const options = Array.isArray(promptLike.options)
    ? promptLike.options
      .map((option): HitlPromptOption => {
        const optionRecord = option && typeof option === 'object'
          ? (option as Record<string, unknown>)
          : null;
        return {
          id: String(optionRecord?.id || '').trim(),
          label: String(optionRecord?.label || '').trim(),
          description: optionRecord?.description ? String(optionRecord.description) : undefined
        };
      })
      .filter((option) => option.id.length > 0 && option.label.length > 0)
    : [];

  if (options.length === 0) {
    return null;
  }

  const preferredDefault = String(promptLike.defaultOptionId || '').trim();
  const defaultOptionId = options.some((option) => option.id === preferredDefault)
    ? preferredDefault
    : (options.find((option) => option.id === 'no')?.id || options[0].id);

  const metadata = promptLike.metadata && typeof promptLike.metadata === 'object'
    ? {
      refreshAfterDismiss: (promptLike.metadata as Record<string, unknown>).refreshAfterDismiss === true,
      kind: typeof (promptLike.metadata as Record<string, unknown>).kind === 'string'
        ? String((promptLike.metadata as Record<string, unknown>).kind)
        : undefined,
    }
    : undefined;

  return {
    requestId,
    chatId: fallbackChatId,
    title: String(promptLike.title || 'Approval required').trim() || 'Approval required',
    message: String(promptLike.message || '').trim(),
    mode: 'option',
    options,
    ...(defaultOptionId ? { defaultOptionId } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export function parseHitlPromptRequest(eventData: unknown): HitlPromptRequest | null {
  const envelope = (eventData && typeof eventData === 'object')
    ? (eventData as Record<string, unknown>)
    : null;
  const prompt = envelope && typeof envelope.prompt === 'object'
    ? (envelope.prompt as Record<string, unknown>)
    : null;

  if (!prompt) {
    return null;
  }

  const chatId = envelope?.chatId ? String(envelope.chatId) : null;
  return normalizeHitlPrompt(prompt, chatId);
}

export function parseHitlPromptFromToolEvent(eventData: unknown): HitlPromptRequest | null {
  const payload = (eventData && typeof eventData === 'object')
    ? (eventData as Record<string, unknown>)
    : null;
  const toolExecution = payload?.toolExecution && typeof payload.toolExecution === 'object'
    ? (payload.toolExecution as Record<string, unknown>)
    : null;
  const metadata = toolExecution?.metadata && typeof toolExecution.metadata === 'object'
    ? (toolExecution.metadata as Record<string, unknown>)
    : null;
  const prompt = metadata?.hitlPrompt && typeof metadata.hitlPrompt === 'object'
    ? (metadata.hitlPrompt as Record<string, unknown>)
    : null;

  if (!toolExecution || !prompt) {
    return null;
  }

  const chatId = prompt?.chatId
    ? String(prompt.chatId)
    : payload?.chatId
      ? String(payload.chatId)
      : null;
  return normalizeHitlPrompt(prompt, chatId);
}

export function enqueueHitlPrompt(
  queue: HitlPromptRequest[],
  prompt: HitlPromptRequest
): HitlPromptRequest[] {
  const existing = Array.isArray(queue) ? queue : [];
  if (existing.some((entry) => entry.requestId === prompt.requestId)) {
    return existing;
  }
  return [...existing, prompt];
}

export function removeHitlPromptByRequestId(
  queue: HitlPromptRequest[],
  requestId: string
): HitlPromptRequest[] {
  const existing = Array.isArray(queue) ? queue : [];
  return existing.filter((entry) => entry.requestId !== requestId);
}

export function selectHitlPromptForChat(
  queue: HitlPromptRequest[],
  chatId?: string | null,
): HitlPromptRequest | null {
  const existing = Array.isArray(queue) ? queue : [];
  const normalizedChatId = String(chatId || '').trim();

  for (const entry of existing) {
    const entryChatId = String(entry?.chatId || '').trim();
    if (!entryChatId || entryChatId === normalizedChatId) {
      return entry;
    }
  }

  return null;
}

export function hasHitlPromptForChat(
  queue: HitlPromptRequest[],
  chatId?: string | null,
): boolean {
  return selectHitlPromptForChat(queue, chatId) !== null;
}

function parseToolCallArgs(raw: unknown): Record<string, unknown> | null {
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

function normalizeOptionsFromArgs(args: Record<string, unknown>): HitlPromptOption[] {
  const source = Array.isArray(args.options) ? args.options : [];
  const seen = new Set<string>();
  const normalized: HitlPromptOption[] = [];

  for (const entry of source) {
    const label = String(entry || '').trim();
    if (!label) {
      continue;
    }
    const key = label.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({
      id: `opt_${normalized.length + 1}`,
      label,
    });
  }

  return normalized;
}

function resolveDefaultOptionIdFromArgs(options: HitlPromptOption[], args: Record<string, unknown>): string {
  const preferredLabel = String(args.defaultOption || '').trim().toLowerCase();
  if (preferredLabel) {
    const matched = options.find((option) => option.label.toLowerCase() === preferredLabel);
    if (matched) {
      return matched.id;
    }
  }
  return options.find((option) => option.id === 'no')?.id || options[0]?.id || 'opt_1';
}

export function reconstructPendingHitlPromptsFromMessages(
  messages: Array<Record<string, unknown>>,
  fallbackChatId: string | null
): HitlPromptRequest[] {
  const entries = Array.isArray(messages) ? messages : [];
  const resolved = new Set<string>();

  for (const message of entries) {
    const role = String(message?.role || '').trim();
    if (role !== 'tool') {
      continue;
    }
    const toolCallId = String(message?.tool_call_id || message?.toolCallId || '').trim();
    if (!toolCallId) {
      continue;
    }
    resolved.add(toolCallId);
  }

  const queue: HitlPromptRequest[] = [];
  const seenRequestIds = new Set<string>();
  for (const message of entries) {
    const role = String(message?.role || '').trim();
    if (role !== 'assistant') {
      continue;
    }

    const toolCalls = Array.isArray(message?.tool_calls)
      ? (message.tool_calls as Array<Record<string, unknown>>)
      : [];

    for (const toolCall of toolCalls) {
      const toolName = String((toolCall?.function as Record<string, unknown> | undefined)?.name || '').trim();
      const toolCallId = String(toolCall?.id || '').trim();
      if (!toolCallId || toolName !== 'human_intervention_request') {
        continue;
      }
      if (resolved.has(toolCallId) || seenRequestIds.has(toolCallId)) {
        continue;
      }

      const functionPayload = toolCall?.function as Record<string, unknown> | undefined;
      const args = parseToolCallArgs(functionPayload?.arguments);
      if (!args) {
        continue;
      }

      const options = normalizeOptionsFromArgs(args);
      if (options.length === 0) {
        continue;
      }

      const chatId = String(message?.chatId || fallbackChatId || '').trim() || null;
      const prompt: HitlPromptRequest = {
        requestId: toolCallId,
        chatId,
        title: 'Human input required',
        message: String(args.question || args.prompt || '').trim(),
        mode: 'option',
        options,
        defaultOptionId: resolveDefaultOptionIdFromArgs(options, args),
      };

      const metadata = args.metadata && typeof args.metadata === 'object' && !Array.isArray(args.metadata)
        ? (args.metadata as Record<string, unknown>)
        : null;
      if (metadata) {
        prompt.metadata = {
          refreshAfterDismiss: metadata.refreshAfterDismiss === true,
          kind: typeof metadata.kind === 'string' ? metadata.kind : undefined,
        };
      }

      queue.push(prompt);
      seenRequestIds.add(toolCallId);
    }
  }

  return queue;
}
