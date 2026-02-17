/**
 * Renderer Formatting Utilities
 * Purpose:
 * - Provide pure formatting helpers for renderer UI text and labels.
 *
 * Key Features:
 * - Formats timestamps for message metadata.
 * - Normalizes refresh warning payloads from API responses.
 * - Produces compact skill descriptions for list cards.
 * - Builds structured log line strings from log events.
 *
 * Implementation Notes:
 * - Keep logic deterministic and side-effect free.
 * - Preserve existing string output behavior to avoid UI regressions.
 *
 * Recent Changes:
 * - 2026-02-16: Extracted from App.jsx into dedicated utility module.
 */

export function formatLogMessage(logEvent) {
  const baseMessage = String(logEvent?.message || '');
  const data = logEvent?.data && typeof logEvent.data === 'object' ? logEvent.data : null;
  if (!data) return baseMessage;

  const detailParts = [];
  const detailText = data.error || data.errorMessage || data.message;
  if (detailText) {
    detailParts.push(String(detailText));
  }
  if (data.toolCallId) {
    detailParts.push(`toolCallId=${String(data.toolCallId)}`);
  }
  if (data.agentId) {
    detailParts.push(`agent=${String(data.agentId)}`);
  }

  if (detailParts.length === 0) return baseMessage;
  return `${baseMessage}: ${detailParts.join(' | ')}`;
}

export function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function getRefreshWarning(result) {
  const warning = result?.refreshWarning;
  if (typeof warning !== 'string') return '';
  const trimmed = warning.trim();
  return trimmed.length > 0 ? trimmed : '';
}

export function compactSkillDescription(description) {
  const normalized = String(description || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'No description provided.';
  if (normalized.length <= 96) return normalized;
  return `${normalized.slice(0, 93)}...`;
}
