/**
 * Create Agent Tool Module - Built-in tool for approval-gated agent creation
 *
 * Purpose:
 * - Expose a built-in `create_agent` tool that creates one new agent after explicit user approval.
 *
 * Key Features:
 * - Requires `name` and supports optional `autoReply`, `role`, and `nextAgent` inputs.
 * - Enforces HITL approval with deterministic deny/timeout handling before persistence.
 * - Generates deterministic system prompt text for multi-agent routing.
 * - Uses world-level chat provider/model settings with deterministic fallbacks.
 *
 * Implementation Notes:
 * - Uses manager-level `createAgent` as the persistence boundary.
 * - Returns deterministic JSON-string payloads for success, denial, and errors.
 * - Keeps runtime contract canonical (`autoReply`, `nextAgent`) while aliases are handled upstream.
 *
 * Recent Changes:
 * - 2026-02-20: Added post-create HITL informational confirmation (`Agent <name> has been created`) with `refreshAfterDismiss` metadata set to true.
 * - 2026-02-20: Pre-claim agent creation slot before approval dialog to prevent parallel-call race where both calls pass approval before either calls createAgent.
 * - 2026-02-20: Updated tool create path to allow manager-level create during the current in-flight world processing turn.
 * - 2026-02-20: Updated `create_agent` default behavior so omitted `autoReply` resolves to `false`.
 * - 2026-02-20: Added initial built-in `create_agent` tool implementation with mandatory approval gate.
 */

import { requestWorldOption } from './hitl.js';
import { createAgent, claimAgentCreationSlot } from './managers.js';
import { LLMProvider, EventType, type CreateAgentParams, type World } from './types.js';
import { publishEvent } from './events/publishers.js';

const APPROVAL_OPTION_YES = 'yes';
const APPROVAL_OPTION_NO = 'no';
const INFO_OPTION_DISMISS = 'dismiss';
const DEFAULT_NEXT_AGENT = 'human';
const DEFAULT_PROVIDER: LLMProvider = LLMProvider.OPENAI;
const DEFAULT_MODEL = 'gpt-4';

type CreateAgentToolArgs = {
  name?: unknown;
  autoReply?: unknown;
  role?: unknown;
  nextAgent?: unknown;
};

type CreateAgentToolContext = {
  world?: World;
  chatId?: string | null;
};

type NormalizedCreateAgentArgs = {
  name: string;
  autoReply: boolean;
  role: string | null;
  nextAgent: string;
};

function stringifyResult(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function validateAndNormalizeArgs(args: CreateAgentToolArgs): {
  valid: true;
  args: NormalizedCreateAgentArgs;
} | {
  valid: false;
  error: string;
} {
  if (typeof args.name !== 'string' || !args.name.trim()) {
    return { valid: false, error: 'Missing required parameter: name' };
  }

  if (args.autoReply !== undefined && typeof args.autoReply !== 'boolean') {
    return { valid: false, error: 'Parameter autoReply must be a boolean when provided' };
  }

  if (args.role !== undefined && typeof args.role !== 'string') {
    return { valid: false, error: 'Parameter role must be a string when provided' };
  }

  if (args.nextAgent !== undefined && typeof args.nextAgent !== 'string') {
    return { valid: false, error: 'Parameter nextAgent must be a string when provided' };
  }

  const name = normalizeWhitespace(args.name);
  const autoReply = args.autoReply ?? false;
  const role = typeof args.role === 'string' && args.role.trim()
    ? normalizeWhitespace(args.role)
    : null;
  const nextAgent = typeof args.nextAgent === 'string' && args.nextAgent.trim()
    ? normalizeWhitespace(args.nextAgent)
    : DEFAULT_NEXT_AGENT;

  return {
    valid: true,
    args: { name, autoReply, role, nextAgent },
  };
}

function buildDeterministicSystemPrompt(
  name: string,
  role: string | null,
  nextAgent: string,
): string {
  const firstLine = role
    ? `You are agent ${name}. Your role is ${role}.`
    : `You are agent ${name}.`;
  return `${firstLine}\n\nAlways respond in exactly this structure:\n@${nextAgent}\n{Your response}`;
}

function resolveProviderAndModel(world?: World): { provider: LLMProvider; model: string } {
  const provider = typeof world?.chatLLMProvider === 'string' && world.chatLLMProvider.trim()
    ? world.chatLLMProvider
    : DEFAULT_PROVIDER;
  const model = typeof world?.chatLLMModel === 'string' && world.chatLLMModel.trim()
    ? world.chatLLMModel.trim()
    : DEFAULT_MODEL;

  return { provider: provider as LLMProvider, model };
}

async function requestCreateAgentApproval(options: {
  world: World;
  chatId: string | null;
  name: string;
  autoReply: boolean;
  role: string | null;
  nextAgent: string;
}): Promise<{
  approved: boolean;
  reason: 'approved' | 'user_denied' | 'timeout';
}> {
  const approval = await requestWorldOption(options.world, {
    title: `Create agent ${options.name}?`,
    message: [
      `Create a new agent named "${options.name}"?`,
      `Auto reply: ${options.autoReply ? 'enabled' : 'disabled'}`,
      `Role: ${options.role ?? '(none)'}`,
      `Next agent: ${options.nextAgent}`,
    ].join('\n'),
    chatId: options.chatId,
    defaultOptionId: APPROVAL_OPTION_NO,
    options: [
      { id: APPROVAL_OPTION_YES, label: 'Yes', description: 'Create the agent now.' },
      { id: APPROVAL_OPTION_NO, label: 'No', description: 'Do not create the agent.' },
    ],
    metadata: {
      tool: 'create_agent',
      name: options.name,
      autoReply: options.autoReply,
      role: options.role,
      nextAgent: options.nextAgent,
    },
  });

  if (approval.optionId === APPROVAL_OPTION_YES) {
    return { approved: true, reason: 'approved' };
  }

  if (approval.source === 'timeout') {
    return { approved: false, reason: 'timeout' };
  }

  return { approved: false, reason: 'user_denied' };
}

async function requestCreateAgentCreatedInfo(options: {
  world: World;
  chatId: string | null;
  name: string;
  autoReply: boolean;
  role: string | null;
  nextAgent: string;
  provider: LLMProvider;
  model: string;
}): Promise<void> {
  await requestWorldOption(options.world, {
    title: `Agent ${options.name} created`,
    message: [
      `Agent ${options.name} has been created.`,
      `Auto reply: ${options.autoReply ? 'enabled' : 'disabled'}`,
      `Role: ${options.role ?? '(none)'}`,
      `Next agent: ${options.nextAgent}`,
      `Provider: ${options.provider}`,
      `Model: ${options.model}`,
    ].join('\n'),
    chatId: options.chatId,
    defaultOptionId: INFO_OPTION_DISMISS,
    options: [
      { id: INFO_OPTION_DISMISS, label: 'Dismiss', description: 'Close this confirmation.' },
    ],
    metadata: {
      kind: 'create_agent_created',
      refreshAfterDismiss: true,
      agent: {
        name: options.name,
        autoReply: options.autoReply,
        role: options.role,
        nextAgent: options.nextAgent,
        provider: options.provider,
        model: options.model,
      },
    },
  });
}

export function createCreateAgentToolDefinition() {
  return {
    description:
      'Create a new agent after explicit user approval. Requires name. Optional: autoReply (alias auto-reply), role, nextAgent (alias next agent).',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Required agent display name.',
        },
        autoReply: {
          type: 'boolean',
          description: 'Optional auto-reply toggle. Alias forms like "auto-reply" are accepted.',
        },
        role: {
          type: 'string',
          description: 'Optional role sentence fragment for deterministic system prompt generation.',
        },
        nextAgent: {
          type: 'string',
          description: 'Optional next agent mention target. Alias forms like "next agent" are accepted.',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
    execute: async (args: CreateAgentToolArgs, _sequenceId?: string, _parentToolCall?: string, context?: CreateAgentToolContext) => {
      const normalized = validateAndNormalizeArgs(args || {});
      if (!normalized.valid) {
        return stringifyResult({
          ok: false,
          status: 'error',
          code: 'validation_error',
          created: false,
          message: normalized.error,
        });
      }

      const world = context?.world;
      const worldId = String(world?.id || '').trim();
      const chatId = context?.chatId ?? world?.currentChatId ?? null;

      if (!world || !worldId) {
        return stringifyResult({
          ok: false,
          status: 'error',
          code: 'approval_unavailable',
          created: false,
          message: 'create_agent requires a valid world context to request approval.',
        });
      }

      // Claim the creation slot BEFORE showing the approval dialog.
      // This prevents a race where two parallel create_agent calls both pass approval
      // before either calls createAgent — the second call would then find the agent
      // already exists and fail with a confusing post-approval error.
      const slot = await claimAgentCreationSlot(worldId, normalized.args.name);
      if (!slot.claimed) {
        return stringifyResult({
          ok: false,
          status: 'error',
          code: 'agent_exists',
          created: false,
          name: normalized.args.name,
          message: slot.reason === 'already_pending'
            ? `Agent '${normalized.args.name}' is already being created.`
            : `Agent '${normalized.args.name}' already exists.`,
        });
      }

      // Track whether createAgent was called so the finally block knows whether
      // to release the slot manually (createAgent's own finally handles it otherwise).
      let createAgentCalled = false;
      try {
        const approval = await requestCreateAgentApproval({
          world,
          chatId,
          name: normalized.args.name,
          autoReply: normalized.args.autoReply,
          role: normalized.args.role,
          nextAgent: normalized.args.nextAgent,
        });

        if (!approval.approved) {
          return stringifyResult({
            ok: false,
            status: 'denied',
            created: false,
            reason: approval.reason,
            name: normalized.args.name,
          });
        }

        const { provider, model } = resolveProviderAndModel(world);
        const systemPrompt = buildDeterministicSystemPrompt(
          normalized.args.name,
          normalized.args.role,
          normalized.args.nextAgent,
        );
        const createParams: CreateAgentParams = {
          name: normalized.args.name,
          type: 'default',
          autoReply: normalized.args.autoReply,
          provider,
          model,
          systemPrompt,
        };
        createAgentCalled = true;
        const createdAgent = await createAgent(worldId, createParams, {
          allowWhileWorldProcessing: true,
          slotAlreadyClaimed: true,
        });

        // Notify UI to refresh the agent list
        publishEvent(world, EventType.SYSTEM, {
          eventType: 'agent-created',
          agent: {
            id: createdAgent.id,
            name: createdAgent.name,
            type: createdAgent.type,
            autoReply: createdAgent.autoReply ?? false,
          },
        }, chatId);

        try {
          await requestCreateAgentCreatedInfo({
            world,
            chatId,
            name: createdAgent.name,
            autoReply: createdAgent.autoReply ?? false,
            role: normalized.args.role,
            nextAgent: normalized.args.nextAgent,
            provider: createdAgent.provider,
            model: createdAgent.model,
          });
        } catch {
          // Agent creation already succeeded. Failure to show a follow-up info
          // prompt must not turn a successful create into an error result.
        }

        return stringifyResult({
          ok: true,
          status: 'created',
          created: true,
          agent: {
            id: createdAgent.id,
            name: createdAgent.name,
            type: createdAgent.type,
            autoReply: createdAgent.autoReply ?? false,
            provider: createdAgent.provider,
            model: createdAgent.model,
          },
          effective: {
            role: normalized.args.role,
            nextAgent: normalized.args.nextAgent,
            systemPrompt,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return stringifyResult({
          ok: false,
          status: 'error',
          code: 'create_failed',
          created: false,
          name: normalized.args.name,
          message,
        });
      } finally {
        // Release the slot if createAgent was never called (denial, timeout, or
        // pre-creation error). If createAgent was called, its own finally already
        // cleaned up — calling release() again is safe (idempotent Set.delete).
        if (!createAgentCalled) {
          slot.release();
        }
      }
    },
  };
}
