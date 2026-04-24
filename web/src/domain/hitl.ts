/**
 * Web HITL Domain Helpers
 *
 * Purpose:
 * - Provide pure helper functions for parsing and managing structured HITL prompts
 *   from tool-event payloads and pending HITL read-model payloads.
 *
 * Key Features:
 * - Parse HITL prompt payloads from tool events and pending prompt envelopes.
 * - Deduplicate prompt queue entries by requestId.
 * - Remove resolved prompts from queue.
 *
 * Implementation Notes:
 * - Parsing is strict about required fields (`requestId`, `questions[]`, option ids/labels).
 * - Legacy flat `question/options` payloads are normalized for replay compatibility.
 *
 * Recent Changes:
 * - 2026-03-11: Added chat-scoped prompt selection helpers so pending HITL state can survive chat switches without
 *   leaking prompts into the wrong chat UI.
 * - 2026-02-26: Clarified helper support for tool-progress `hitlPrompt` payloads and pending prompt envelopes.
 * - 2026-02-14: Added initial HITL prompt parsing/queue helpers for web client flows.
 */

import type { HitlPromptOption, HitlPromptQuestion, HitlPromptRequest } from '../types';

function normalizeHitlPrompt(promptLike: Record<string, unknown>, fallbackChatId: string | null): HitlPromptRequest | null {
  const requestId = String(promptLike.requestId || '').trim();
  if (!requestId) {
    return null;
  }

  const questions = normalizeQuestions(promptLike);
  if (questions.length === 0) {
    return null;
  }

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
    type: promptLike.type === 'multiple-select' ? 'multiple-select' : 'single-select',
    allowSkip: promptLike.allowSkip === true,
    questions,
    ...(typeof promptLike.toolCallId === 'string' && promptLike.toolCallId.trim()
      ? { toolCallId: promptLike.toolCallId.trim() }
      : {}),
    ...(metadata ? { metadata } : {}),
  };
}

function normalizeOptions(optionsLike: unknown): HitlPromptOption[] {
  return Array.isArray(optionsLike)
    ? optionsLike
      .map((option, index): HitlPromptOption | null => {
        const optionRecord = option && typeof option === 'object'
          ? (option as Record<string, unknown>)
          : null;
        const id = String(optionRecord?.id || '').trim();
        const label = optionRecord
          ? String(optionRecord?.label || '').trim()
          : String(option || '').trim();
        if (!id || !label) {
          if (!optionRecord && label) {
            return {
              id: `opt_${index + 1}`,
              label,
            };
          }
          return null;
        }
        return {
          id,
          label,
          description: optionRecord?.description ? String(optionRecord.description) : undefined,
        };
      })
      .filter((option): option is HitlPromptOption => option !== null)
    : [];
}

function normalizeQuestions(promptLike: Record<string, unknown>): HitlPromptQuestion[] {
  const structuredQuestions = Array.isArray(promptLike.questions)
    ? promptLike.questions
      .map((entry, index): HitlPromptQuestion | null => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return null;
        }
        const questionRecord = entry as Record<string, unknown>;
        const id = String(questionRecord.id || '').trim() || `question-${index + 1}`;
        const header = String(questionRecord.header || 'Human input required').trim() || 'Human input required';
        const question = String(questionRecord.question || '').trim();
        const options = normalizeOptions(questionRecord.options);
        if (!question || options.length === 0) {
          return null;
        }
        return { id, header, question, options };
      })
      .filter((question): question is HitlPromptQuestion => question !== null)
    : [];

  if (structuredQuestions.length > 0) {
    return structuredQuestions;
  }

  const legacyQuestion = String(promptLike.question || promptLike.message || promptLike.prompt || '').trim();
  const legacyOptions = normalizeOptions(promptLike.options);
  if (!legacyQuestion || legacyOptions.length === 0) {
    return [];
  }

  return [{
    id: 'question-1',
    header: String(promptLike.title || 'Human input required').trim() || 'Human input required',
    question: legacyQuestion,
    options: legacyOptions,
  }];
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
      if (!toolCallId || (toolName !== 'human_intervention_request' && toolName !== 'ask_user_input')) {
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

      const questions = normalizeQuestions(args);
      if (questions.length === 0) {
        continue;
      }

      const chatId = String(message?.chatId || fallbackChatId || '').trim() || null;
      const prompt: HitlPromptRequest = {
        requestId: toolCallId,
        chatId,
        type: args.type === 'multiple-select' ? 'multiple-select' : 'single-select',
        allowSkip: args.allowSkip === true,
        questions,
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
