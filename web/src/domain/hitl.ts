/**
 * Web HITL Domain Helpers
 *
 * Purpose:
 * - Provide pure helper functions for parsing and managing HITL option prompts
 *   from system-event payloads in web chat workflows.
 *
 * Key Features:
 * - Parse `hitl-option-request` payloads into normalized prompt objects.
 * - Deduplicate prompt queue entries by requestId.
 * - Remove resolved prompts from queue.
 *
 * Implementation Notes:
 * - Parsing is strict about required fields (`requestId`, option ids/labels).
 * - Default option falls back to `no` when present, otherwise first option.
 *
 * Recent Changes:
 * - 2026-02-14: Added initial HITL prompt parsing/queue helpers for web client flows.
 */

import type { HitlPromptOption, HitlPromptRequest } from '../types';

export function parseHitlPromptRequest(eventData: unknown): HitlPromptRequest | null {
  const envelope = (eventData && typeof eventData === 'object')
    ? (eventData as Record<string, unknown>)
    : null;
  const content = envelope && typeof envelope.content === 'object'
    ? (envelope.content as Record<string, unknown>)
    : null;
  if (!content || String(content.eventType || '').trim() !== 'hitl-option-request') {
    return null;
  }

  const requestId = String(content.requestId || '').trim();
  if (!requestId) {
    return null;
  }

  const options = Array.isArray(content.options)
    ? content.options
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

  const preferredDefault = String(content.defaultOptionId || '').trim();
  const defaultOptionId = options.some((option) => option.id === preferredDefault)
    ? preferredDefault
    : (options.find((option) => option.id === 'no')?.id || options[0].id);

  return {
    requestId,
    chatId: envelope?.chatId ? String(envelope.chatId) : null,
    title: String(content.title || 'Approval required').trim() || 'Approval required',
    message: String(content.message || '').trim(),
    options,
    defaultOptionId
  };
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

