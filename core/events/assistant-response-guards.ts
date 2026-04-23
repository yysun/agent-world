/**
 * Assistant Response Guards
 *
 * Purpose:
 * - Centralize shared runtime guards for intent-only assistant narration and validation-failure recovery.
 *
 * Key Features:
 * - Detects future-tense action narration that should not count as completed work.
 * - Detects persisted validation-failure tool results so continuation can request one bounded correction.
 * - Provides shared retry instructions and warning messages for direct and continuation paths.
 *
 * Implementation Notes:
 * - The heuristics here stay intentionally narrow and deterministic.
 * - This module does not guess tool arguments or fabricate side effects from prose.
 *
 * Recent Changes:
 * - 2026-04-23: Exempted explicit clarifying-question replies from intent-only rejection so the guard catches fallback narration failures without retrying legitimate question-first responses.
 * - 2026-04-12: Scoped intent-only narration rejection to execution-oriented turns so planning/explanation replies are not downgraded.
 * - 2026-04-12: Initial extraction for turn-loop hardening against intent-only narration and repeated tool validation failures.
 */

import {
  parseToolExecutionEnvelopeContent,
  stringifyToolExecutionResult,
} from '../tool-execution-envelope.js';

const ACTION_VERB_PATTERN = /\b(run|check|inspect|search|open|update|write|read|fetch|call|use|load|create|edit|modify|delete|browse|list|grep|look up)\b/i;
const FUTURE_ACTION_PATTERN = /\b(i['’]?ll|i will|i am going to|i'm going to|let me)\b/i;
const EXECUTION_REQUEST_PATTERN = /\b(run|check|inspect|search|open|update|write|read|fetch|call|use|load|create|edit|modify|delete|browse|list|grep|look up|fix|review|investigate|debug|implement)\b/i;
const PLANNING_REQUEST_PATTERN = /\b(plan|planning|approach|strategy|outline|next steps?)\b|(?:what|how)\s+(?:would|will)\s+you\b|walk me through|explain (?:how|what)|tell me how/i;
const CLARIFYING_QUESTION_PATTERN = /\b(who|what|when|where|why|how|which|can you|could you|would you|do you|are there|is there)\b/i;

export const INTENT_ONLY_RETRY_NOTICE =
  'System notice: Do not describe future actions. If action is required, emit the tool call now with complete parameters. If work is already done, return verified results only.';
export const INTENT_ONLY_WARNING_MESSAGE =
  '[Warning] Agent described a future tool action without executing it. Please retry or refine the prompt.';
export const VALIDATION_FAILURE_RETRY_NOTICE =
  'System notice: The previous tool call failed parameter validation. Emit a corrected tool call with all required parameters and valid argument names/types. Do not describe what you will do next.';
export const VALIDATION_FAILURE_WARNING_MESSAGE =
  '[Warning] Agent repeatedly returned invalid tool parameters. Please retry or refine the prompt.';

function normalizeText(value: string): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getLatestUserMessageContent(
  messages: Array<{ role?: string; content?: string | null | undefined }>
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user') {
      return normalizeText(String(message.content || ''));
    }
  }

  return '';
}

export function isIntentOnlyActionNarration(content: string): boolean {
  const normalized = normalizeText(content);
  if (!normalized) {
    return false;
  }

  if (/^calling\s+tool\s*:/i.test(normalized)) {
    return false;
  }

  return FUTURE_ACTION_PATTERN.test(normalized) && ACTION_VERB_PATTERN.test(normalized);
}

function isClarifyingQuestionResponse(content: string): boolean {
  const normalized = normalizeText(content);
  if (!normalized) {
    return false;
  }

  if (!normalized.includes('?')) {
    return false;
  }

  if (/^calling\s+tool\s*:/i.test(normalized)) {
    return false;
  }

  return CLARIFYING_QUESTION_PATTERN.test(normalized);
}

export function shouldRejectIntentOnlyActionNarration(params: {
  assistantContent: string;
  latestUserContent?: string | null | undefined;
  hasPriorToolCall?: boolean;
}): boolean {
  if (!isIntentOnlyActionNarration(params.assistantContent)) {
    return false;
  }

  if (isClarifyingQuestionResponse(params.assistantContent)) {
    return false;
  }

  const latestUserContent = normalizeText(String(params.latestUserContent || ''));
  if (latestUserContent && PLANNING_REQUEST_PATTERN.test(latestUserContent)) {
    return false;
  }

  if (params.hasPriorToolCall) {
    return true;
  }

  return latestUserContent.length > 0 && EXECUTION_REQUEST_PATTERN.test(latestUserContent);
}

function isValidationFailureRecord(record: Record<string, unknown>): boolean {
  const code = String(record.code || record.failureReason || record.reason || '').trim().toLowerCase();
  if (code === 'validation_error') {
    return true;
  }

  const message = String(record.message || record.error || '').trim();
  if (!message) {
    return false;
  }

  return /tool parameter validation failed|missing required parameter|invalid json in tool arguments/i.test(message);
}

export function isValidationFailureToolResult(content: string): boolean {
  const normalized = normalizeText(content);
  if (!normalized) {
    return false;
  }

  const envelope = parseToolExecutionEnvelopeContent(normalized);
  if (envelope) {
    return isValidationFailureToolResult(stringifyToolExecutionResult(envelope.result));
  }

  try {
    const parsed = JSON.parse(normalized);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return isValidationFailureRecord(parsed as Record<string, unknown>);
    }
  } catch {
    // Fall through to text-pattern checks.
  }

  return /reason\s*[:=]\s*validation_error/i.test(normalized)
    || /tool parameter validation failed/i.test(normalized)
    || /missing required parameter/i.test(normalized)
    || /invalid json in tool arguments/i.test(normalized);
}
