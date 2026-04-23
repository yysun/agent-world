/**
 * HITL Tool Name Helpers
 *
 * Purpose:
 * - Centralize canonical human-in-the-loop tool name aliases used across core runtime flows.
 *
 * Key Features:
 * - Shared alias predicate for `human_intervention_request` and `ask_user_input`.
 * - Preferred-name resolver that favors `ask_user_input` when both aliases are available.
 *
 * Implementation Notes:
 * - Keep alias rules in one place so classification, validation, replay, and prompt guidance stay aligned.
 * - Export small pure helpers to avoid coupling callers to a specific module with runtime side effects.
 *
 * Recent Changes:
 * - 2026-04-23: Added shared HITL tool-name helpers to remove duplicated alias checks across core modules.
 */

export const HITL_TOOL_NAMES = [
  'human_intervention_request',
  'ask_user_input',
] as const;

const HITL_TOOL_NAME_SET = new Set<string>(HITL_TOOL_NAMES);

function normalizeToolName(toolName: unknown): string {
  return String(toolName || '').trim();
}

export function isHitlToolName(toolName: unknown): boolean {
  return HITL_TOOL_NAME_SET.has(normalizeToolName(toolName));
}

export function resolvePreferredHitlToolName(toolNames: Iterable<unknown>): string | null {
  let hasLegacyAlias = false;

  for (const toolName of toolNames) {
    const normalizedToolName = normalizeToolName(toolName);
    if (normalizedToolName === 'ask_user_input') {
      return normalizedToolName;
    }
    if (normalizedToolName === 'human_intervention_request') {
      hasLegacyAlias = true;
    }
  }

  return hasLegacyAlias ? 'human_intervention_request' : null;
}
