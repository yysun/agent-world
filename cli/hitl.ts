/**
 * CLI HITL Helpers
 *
 * Purpose:
 * - Provide pure parsing/selection helpers for HITL option requests used by the CLI.
 *
 * Key Features:
 * - Parse `hitl-option-request` system payloads into normalized structures.
 * - Resolve user input into option IDs (by number or option id).
 * - Provide deterministic fallback option resolution.
 *
 * Implementation Notes:
 * - Parser accepts generic event payloads and rejects incomplete requests.
 * - Option fallback defaults to explicit `no` when available, otherwise first option.
 *
 * Recent Changes:
 * - 2026-02-20: Enforced options-only HITL parsing in CLI helpers.
 * - 2026-02-14: Added initial helper module for CLI HITL response flow support.
 */

export interface HitlOptionPayload {
  id: string;
  label: string;
  description?: string;
}

export interface HitlOptionRequestPayload {
  requestId: string;
  title: string;
  message: string;
  chatId: string | null;
  mode: 'option';
  options: HitlOptionPayload[];
  defaultOptionId: string;
}

export type HitlPromptRequestPayload = HitlOptionRequestPayload;

export function parseHitlPromptRequest(eventData: unknown): HitlPromptRequestPayload | null {
  if (!eventData || typeof eventData !== 'object') {
    return null;
  }
  const payload = eventData as Record<string, unknown>;
  const content = payload.content && typeof payload.content === 'object'
    ? (payload.content as Record<string, unknown>)
    : null;
  const eventType = String(content?.eventType || '').trim();
  if (!content || eventType !== 'hitl-option-request') {
    return null;
  }

  const requestId = String(content.requestId || '').trim();
  if (!requestId) {
    return null;
  }

  const options: HitlOptionPayload[] = Array.isArray(content.options)
    ? content.options
        .map((option): HitlOptionPayload => {
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
    title: String(content.title || 'Approval required').trim() || 'Approval required',
    message: String(content.message || '').trim(),
    chatId: payload.chatId ? String(payload.chatId) : null,
    mode: 'option',
    options,
    defaultOptionId
  };
}

export function parseHitlOptionRequest(eventData: unknown): HitlOptionRequestPayload | null {
  return parseHitlPromptRequest(eventData);
}

export function resolveHitlOptionSelectionInput(
  options: HitlOptionPayload[],
  rawInput: string,
  fallbackOptionId: string
): string | null {
  const normalizedInput = String(rawInput || '').trim();
  if (!normalizedInput) {
    return fallbackOptionId;
  }

  const asNumber = Number(normalizedInput);
  if (Number.isFinite(asNumber)) {
    const index = Math.floor(asNumber) - 1;
    if (index >= 0 && index < options.length) {
      return options[index].id;
    }
  }

  const byId = options.find((option) => option.id.toLowerCase() === normalizedInput.toLowerCase());
  if (byId) {
    return byId.id;
  }
  return null;
}
