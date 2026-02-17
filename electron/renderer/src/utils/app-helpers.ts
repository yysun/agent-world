/**
 * Renderer App Helpers
 * Purpose:
 * - Provide pure helper functions used by App orchestration and derived state.
 *
 * Key Features:
 * - Agent display/initials helpers.
 * - Numeric/activity/env parsing helpers.
 * - World form default and world->form normalization helpers.
 *
 * Implementation Notes:
 * - Pure functions only; no side effects.
 * - Keep defaults aligned with existing renderer constants.
 *
 * Recent Changes:
 * - 2026-02-17: Extracted from App.tsx during CC pass to reduce top-level file size.
 */

import {
  DEFAULT_TURN_LIMIT,
  DEFAULT_WORLD_CHAT_LLM_MODEL,
  DEFAULT_WORLD_CHAT_LLM_PROVIDER,
  MIN_TURN_LIMIT,
} from '../constants/app-constants';

export function getAgentDisplayName(agent: unknown, fallbackIndex: number): string {
  const name = typeof (agent as { name?: unknown })?.name === 'string'
    ? ((agent as { name: string }).name).trim()
    : '';
  if (name) return name;

  const id = typeof (agent as { id?: unknown })?.id === 'string'
    ? ((agent as { id: string }).id).trim()
    : '';
  if (id) return id;

  return `Agent ${fallbackIndex + 1}`;
}

export function getAgentInitials(displayName: string): string {
  const segments = String(displayName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (segments.length === 0) return '?';
  if (segments.length === 1) {
    return segments[0].slice(0, 2).toUpperCase();
  }
  return `${segments[0][0] || ''}${segments[1][0] || ''}`.toUpperCase();
}

export function parseOptionalInteger(value: unknown, min = 0): number | null {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.floor(parsed));
}

export function normalizeActivitySourceLabel(source: unknown): string {
  const raw = String(source || '').trim();
  if (!raw) return '';
  return raw.startsWith('agent:') ? raw.slice('agent:'.length) : raw;
}

export function getEnvValueFromText(variablesText: unknown, key: string): string | undefined {
  if (!key) return undefined;
  const lines = String(variablesText).split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const envKey = line.slice(0, eqIndex).trim();
    if (envKey !== key) continue;
    return line.slice(eqIndex + 1).trim();
  }
  return undefined;
}

export function getDefaultWorldForm() {
  return {
    name: '',
    description: '',
    turnLimit: DEFAULT_TURN_LIMIT,
    mainAgent: '',
    chatLLMProvider: DEFAULT_WORLD_CHAT_LLM_PROVIDER,
    chatLLMModel: DEFAULT_WORLD_CHAT_LLM_MODEL,
    mcpConfig: '',
    variables: ''
  };
}

export function getWorldFormFromWorld(world: unknown) {
  if (!world) return getDefaultWorldForm();

  const worldValue = world as {
    name?: unknown;
    description?: unknown;
    turnLimit?: unknown;
    mainAgent?: unknown;
    chatLLMProvider?: unknown;
    chatLLMModel?: unknown;
    mcpConfig?: unknown;
    variables?: unknown;
  };

  const turnLimitRaw = Number(worldValue.turnLimit);
  const turnLimit = Number.isFinite(turnLimitRaw) && turnLimitRaw >= MIN_TURN_LIMIT
    ? Math.floor(turnLimitRaw)
    : DEFAULT_TURN_LIMIT;
  const chatLLMProvider = String(worldValue.chatLLMProvider || '').trim() || DEFAULT_WORLD_CHAT_LLM_PROVIDER;
  const chatLLMModel = String(worldValue.chatLLMModel || '').trim() || DEFAULT_WORLD_CHAT_LLM_MODEL;
  const mainAgent = String(worldValue.mainAgent || '').trim();

  return {
    name: String(worldValue.name || ''),
    description: String(worldValue.description || ''),
    turnLimit,
    mainAgent,
    chatLLMProvider,
    chatLLMModel,
    mcpConfig: worldValue.mcpConfig == null ? '' : String(worldValue.mcpConfig),
    variables: worldValue.variables == null ? '' : String(worldValue.variables)
  };
}
