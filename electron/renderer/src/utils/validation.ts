/**
 * Renderer Validation Utilities
 * Purpose:
 * - Validate world and agent form models before API mutations.
 *
 * Key Features:
 * - World form validation with defaults and MCP JSON validation.
 * - Agent form validation with required fields and optional numeric parsing.
 *
 * Implementation Notes:
 * - Returns stable result shape: `{ valid, error? , data? }`.
 * - Uses shared constants for default/fallback behavior.
 *
 * Recent Changes:
 * - 2026-02-18: Aligned agent provider fallback with shared world/provider default constant.
 * - 2026-02-16: Extracted from App.jsx into dedicated utility module.
 */

import {
  DEFAULT_TURN_LIMIT,
  MIN_TURN_LIMIT,
  DEFAULT_WORLD_CHAT_LLM_PROVIDER,
  DEFAULT_WORLD_CHAT_LLM_MODEL,
} from '../constants/app-constants';

function parseOptionalNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

export function validateWorldForm(worldForm) {
  const name = String(worldForm.name || '').trim();
  if (!name) return { valid: false, error: 'World name is required.' };

  const turnLimitRaw = Number(worldForm.turnLimit);
  const turnLimit = Number.isFinite(turnLimitRaw) && turnLimitRaw >= MIN_TURN_LIMIT
    ? Math.floor(turnLimitRaw)
    : DEFAULT_TURN_LIMIT;
  const chatLLMProvider = String(worldForm.chatLLMProvider || '').trim() || DEFAULT_WORLD_CHAT_LLM_PROVIDER;
  const chatLLMModel = String(worldForm.chatLLMModel || '').trim() || DEFAULT_WORLD_CHAT_LLM_MODEL;
  const mainAgent = String(worldForm.mainAgent || '').trim();
  const mcpConfig = worldForm.mcpConfig == null ? '' : String(worldForm.mcpConfig);
  const variables = worldForm.variables == null ? '' : String(worldForm.variables);

  if (mcpConfig.trim()) {
    try {
      JSON.parse(mcpConfig);
    } catch {
      return { valid: false, error: 'MCP Config must be valid JSON.' };
    }
  }

  return {
    valid: true,
    data: {
      name,
      description: String(worldForm.description || '').trim(),
      turnLimit,
      mainAgent,
      chatLLMProvider,
      chatLLMModel,
      mcpConfig,
      variables
    }
  };
}

export function validateAgentForm(agentForm) {
  const name = String(agentForm.name || '').trim();
  if (!name) return { valid: false, error: 'Agent name is required.' };

  const model = String(agentForm.model || '').trim();
  if (!model) return { valid: false, error: 'Agent model is required.' };

  return {
    valid: true,
    data: {
      name,
      autoReply: agentForm.autoReply !== false,
      provider: String(agentForm.provider || DEFAULT_WORLD_CHAT_LLM_PROVIDER).trim() || DEFAULT_WORLD_CHAT_LLM_PROVIDER,
      model,
      systemPrompt: String(agentForm.systemPrompt || ''),
      temperature: parseOptionalNumber(agentForm.temperature),
      maxTokens: parseOptionalNumber(agentForm.maxTokens)
    }
  };
}
