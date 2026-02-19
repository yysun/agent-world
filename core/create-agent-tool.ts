/**
 * Create Agent Tool Module - Built-in tool for approval-gated agent creation.
 *
 * Purpose:
 * - Provide a deterministic `create_agent` built-in tool that creates agents after explicit user approval.
 *
 * Key Features:
 * - Requires `name` and supports optional `autoReply`, `role`, and `nextAgent` arguments.
 * - Enforces a mandatory HITL approval check before creating any agent.
 * - Inherits provider/model from world-level `chatLLMProvider` / `chatLLMModel` when configured.
 * - Generates a stable system prompt template for new agents.
 * - Returns structured JSON payloads for success, denial, and error outcomes.
 *
 * Notes on Implementation:
 * - Uses `requestWorldOption` for approval (no custom approval protocol).
 * - Uses core `createAgent` manager API to preserve existing persistence and CRUD event behavior.
 * - Applies deterministic defaults when world-level provider/model are not configured.
 *
 * Recent Changes:
 * - 2026-02-19: Initial implementation of approval-gated `create_agent` built-in tool.
 */

import { requestWorldOption } from './hitl.js';
import { createAgent } from './managers.js';
import { LLMProvider } from './types.js';
import { toKebabCase } from './utils.js';

const APPROVAL_OPTION_YES = 'yes';
const APPROVAL_OPTION_NO = 'no';
const DEFAULT_PROVIDER = LLMProvider.OPENAI;
const DEFAULT_MODEL = 'gpt-4';
const DEFAULT_NEXT_AGENT = 'human';
const MAX_ROLE_LENGTH = 240;

type CreateAgentToolContext = {
  world?: {
    id?: string;
    currentChatId?: string | null;
    chatLLMProvider?: string | null;
    chatLLMModel?: string | null;
    eventEmitter?: unknown;
  } | null;
  chatId?: string | null;
};

type CreateAgentToolArgs = {
  name: string;
  autoReply?: boolean;
  role?: string;
  nextAgent?: string;
};

function normalizeSingleLineText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function resolveRole(role: unknown): string {
  const normalized = normalizeSingleLineText(role);
  if (!normalized) return '';
  return normalized.slice(0, MAX_ROLE_LENGTH);
}

function resolveNextAgent(nextAgent: unknown): string {
  const normalized = normalizeSingleLineText(nextAgent);
  if (!normalized) return DEFAULT_NEXT_AGENT;

  const stripped = normalized.startsWith('@') ? normalized.slice(1) : normalized;
  const token = toKebabCase(stripped);
  return token || DEFAULT_NEXT_AGENT;
}

function resolveProvider(world: CreateAgentToolContext['world']): LLMProvider {
  const configured = normalizeSingleLineText(world?.chatLLMProvider).toLowerCase();
  const allProviders = new Set<string>(Object.values(LLMProvider));
  if (configured && allProviders.has(configured)) {
    return configured as LLMProvider;
  }
  return DEFAULT_PROVIDER;
}

function resolveModel(world: CreateAgentToolContext['world']): string {
  const configured = normalizeSingleLineText(world?.chatLLMModel);
  return configured || DEFAULT_MODEL;
}

function buildSystemPrompt(name: string, role: string, nextAgent: string): string {
  const roleSentence = role ? `Your role is ${role}.` : 'Your role is not specified.';
  return [
    `You are agent ${name}. ${roleSentence}`,
    '',
    'Always respond in exactly this structure:',
    `@${nextAgent}`,
    '{Your response}',
  ].join('\n');
}

function formatResult(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, null, 2);
}

function formatErrorResult(message: string): string {
  return formatResult({
    success: false,
    created: false,
    error: message,
  });
}

function formatDeniedResult(optionId: string, source: string, message: string): string {
  return formatResult({
    success: false,
    created: false,
    approval: {
      optionId,
      source,
      approved: false,
    },
    message,
  });
}

export function createCreateAgentToolDefinition() {
  return {
    description:
      'Create a new agent after explicit user approval. Requires `name`; supports optional `autoReply`, `role`, and `nextAgent`.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name for the new agent.',
        },
        autoReply: {
          type: 'boolean',
          description: 'Optional auto-reply flag. Defaults to true.',
        },
        role: {
          type: 'string',
          description: 'Optional role sentence used in the generated system prompt.',
        },
        nextAgent: {
          type: 'string',
          description: 'Optional mention target used in the generated response template.',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
    execute: async (args: CreateAgentToolArgs, _sequenceId?: string, _parentToolCall?: string, context?: CreateAgentToolContext) => {
      try {
        const name = normalizeSingleLineText(args?.name);
        if (!name) {
          return formatErrorResult('Missing required parameter: name');
        }

        const world = context?.world;
        const worldId = normalizeSingleLineText(world?.id);
        if (!world || !worldId || !world.eventEmitter) {
          return formatErrorResult('Approval context unavailable: world runtime is required for create_agent.');
        }

        const autoReply = args?.autoReply !== undefined ? !!args.autoReply : true;
        const role = resolveRole(args?.role);
        const nextAgent = resolveNextAgent(args?.nextAgent);
        const provider = resolveProvider(world);
        const model = resolveModel(world);
        const systemPrompt = buildSystemPrompt(name, role, nextAgent);
        const chatId = context?.chatId ?? world.currentChatId ?? null;

        const approval = await requestWorldOption(world as any, {
          title: `Create agent ${name}?`,
          message: [
            `Create a new agent with name "${name}"?`,
            `autoReply: ${String(autoReply)}`,
            `role: ${role || '(not specified)'}`,
            `nextAgent: ${nextAgent}`,
            `provider: ${provider}`,
            `model: ${model}`,
          ].join('\n'),
          chatId,
          defaultOptionId: APPROVAL_OPTION_NO,
          options: [
            {
              id: APPROVAL_OPTION_YES,
              label: 'Yes',
              description: 'Create this agent now.',
            },
            {
              id: APPROVAL_OPTION_NO,
              label: 'No',
              description: 'Do not create this agent.',
            },
          ],
          metadata: {
            tool: 'create_agent',
            name,
            autoReply,
            role,
            nextAgent,
            provider,
            model,
          },
        });

        if (approval.optionId !== APPROVAL_OPTION_YES) {
          const denialMessage = approval.source === 'timeout'
            ? `Agent creation timed out and defaulted to ${approval.optionId}.`
            : 'User denied agent creation.';
          return formatDeniedResult(approval.optionId, approval.source, denialMessage);
        }

        const createdAgent = await createAgent(
          worldId,
          {
            name,
            type: 'default',
            autoReply,
            provider,
            model,
            systemPrompt,
          },
          { allowWhileProcessing: true },
        );

        return formatResult({
          success: true,
          created: true,
          agent: {
            id: createdAgent.id,
            name: createdAgent.name,
            autoReply: createdAgent.autoReply !== false,
            provider: createdAgent.provider,
            model: createdAgent.model,
            role: role || null,
            nextAgent,
            systemPrompt: createdAgent.systemPrompt || systemPrompt,
          },
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        return formatErrorResult(message);
      }
    },
  };
}
