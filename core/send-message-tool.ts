/**
 * Send Message Tool Module - Built-in tool for dispatching message arrays to the active world/chat scope.
 *
 * Purpose:
 * - Expose a built-in `send_message` tool that dispatches one or more messages in order.
 *
 * Key Features:
 * - Accepts `messages` as `Array<string | { content: string; sender?: string }>`.
 * - Injects trusted `worldId` and `chatId` from tool execution context.
 * - Ignores model-provided routing fields (`worldId`, `chatId`) for safety.
 * - Delegates human/user senders to queue-backed `enqueueAndProcessUserTurn`.
 * - Delegates assistant/tool/system senders to explicit immediate dispatch.
 * - Returns deterministic JSON-string summaries with per-item status.
 *
 * Implementation Notes:
 * - This tool does not claim downstream response completion; it reports dispatch/enqueue outcomes only.
 * - Root-level `worldId` and `chatId` are accepted for compatibility but never used for routing.
 * - Runtime routing requires explicit `context.chatId`; it does not fall back to `world.currentChatId`.
 *
 * Recent Changes:
 * - 2026-03-10: Split sender routing so queue-backed dispatch is user-only and non-user senders use immediate dispatch.
 * - 2026-03-04: Removed `world.currentChatId` fallback from trusted runtime routing; `context.chatId` is now required.
 * - 2026-03-04: Initial implementation of built-in `send_message` tool with trusted context injection.
 */

import { dispatchImmediateChatMessage, enqueueAndProcessUserTurn } from './managers.js';
import type { World } from './types.js';

type SendMessageArgs = {
  messages?: unknown;
  worldId?: unknown;
  chatId?: unknown;
};

type SendMessageContext = {
  world?: World;
  chatId?: string | null;
};

type NormalizedMessage = {
  index: number;
  content: string;
  sender: string;
};

type MessageResult = {
  index: number;
  sender?: string;
  status: 'dispatched' | 'error';
  dispatchMode?: 'queued' | 'immediate';
  messageId?: string | null;
  error?: string;
};

function stringifyResult(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

function normalizeSender(sender: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (sender === undefined || sender === null) {
    return { ok: true, value: 'human' };
  }
  if (typeof sender !== 'string') {
    return { ok: false, error: 'sender must be a string when provided' };
  }
  const normalized = sender.trim();
  if (!normalized) {
    return { ok: false, error: 'sender must not be empty when provided' };
  }
  return { ok: true, value: normalized };
}

function isUserSender(sender: string): boolean {
  const normalized = String(sender || '').trim().toLowerCase();
  return normalized === 'human' || normalized.startsWith('user');
}

function normalizeMessageEntry(entry: unknown, index: number):
  | { ok: true; value: NormalizedMessage }
  | { ok: false; error: string } {
  if (typeof entry === 'string') {
    if (!entry.trim()) {
      return { ok: false, error: 'content must not be empty' };
    }
    return {
      ok: true,
      value: {
        index,
        content: entry,
        sender: 'human',
      },
    };
  }

  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { ok: false, error: 'message entry must be a string or object with content' };
  }

  const candidate = entry as Record<string, unknown>;
  if (typeof candidate.content !== 'string' || !candidate.content.trim()) {
    return { ok: false, error: 'content must be a non-empty string' };
  }

  const sender = normalizeSender(candidate.sender);
  if (!sender.ok) {
    return { ok: false, error: sender.error };
  }

  return {
    ok: true,
    value: {
      index,
      content: candidate.content,
      sender: sender.value,
    },
  };
}

function resolveTrustedContext(context?: SendMessageContext):
  | { ok: true; world: World; worldId: string; chatId: string }
  | { ok: false; code: string; message: string } {
  const world = context?.world;
  const worldId = typeof world?.id === 'string' ? world.id.trim() : '';
  if (!world || !worldId) {
    return {
      ok: false,
      code: 'context_unavailable',
      message: 'send_message requires a valid world context.',
    };
  }

  const chatId = typeof context?.chatId === 'string' ? context.chatId.trim() : '';
  if (!chatId) {
    return {
      ok: false,
      code: 'chat_context_missing',
      message: 'send_message requires a chatId in trusted runtime context.',
    };
  }

  return { ok: true, world, worldId, chatId };
}

export function createSendMessageToolDefinition() {
  return {
    description:
      'Dispatch multiple messages to the active world/chat context. Requires messages array. worldId/chatId are injected from trusted runtime context.',
    parameters: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          description: 'Required array of messages. Each entry can be a string or { content, sender? } object.',
          items: {
            anyOf: [
              { type: 'string' },
              {
                type: 'object',
                properties: {
                  content: { type: 'string' },
                  sender: { type: 'string' },
                },
                required: ['content'],
                additionalProperties: true,
              },
            ],
          },
        },
        worldId: {
          type: 'string',
          description: 'Compatibility-only field. Ignored for routing; trusted context worldId is always used.',
        },
        chatId: {
          type: 'string',
          description: 'Compatibility-only field. Ignored for routing; trusted context chatId is always used.',
        },
      },
      required: ['messages'],
      additionalProperties: false,
    },
    execute: async (args: SendMessageArgs, _sequenceId?: string, _parentToolCall?: string, context?: SendMessageContext) => {
      const resolved = resolveTrustedContext(context);
      if (!resolved.ok) {
        return stringifyResult({
          ok: false,
          status: 'error',
          code: resolved.code,
          message: resolved.message,
          requested: 0,
          accepted: 0,
          dispatched: 0,
          failed: 0,
          results: [],
        });
      }

      if (!Array.isArray(args?.messages) || args.messages.length === 0) {
        return stringifyResult({
          ok: false,
          status: 'error',
          code: 'validation_error',
          message: 'messages must be a non-empty array.',
          worldId: resolved.worldId,
          chatId: resolved.chatId,
          requested: Array.isArray(args?.messages) ? args.messages.length : 0,
          accepted: 0,
          dispatched: 0,
          failed: 0,
          results: [],
        });
      }

      const results: MessageResult[] = [];
      let accepted = 0;
      let dispatched = 0;
      let failed = 0;

      for (let index = 0; index < args.messages.length; index += 1) {
        const normalized = normalizeMessageEntry(args.messages[index], index);
        if (!normalized.ok) {
          failed += 1;
          results.push({
            index,
            status: 'error',
            error: normalized.error,
          });
          continue;
        }

        accepted += 1;
        try {
          const queuedMessage = isUserSender(normalized.value.sender)
            ? await enqueueAndProcessUserTurn(
              resolved.worldId,
              resolved.chatId,
              normalized.value.content,
              normalized.value.sender,
              resolved.world,
              { source: 'direct' },
            )
            : null;
          const immediateMessage = queuedMessage
            ? null
            : await dispatchImmediateChatMessage(
              resolved.worldId,
              resolved.chatId,
              normalized.value.content,
              normalized.value.sender,
              resolved.world,
              { source: 'direct' },
            );

          dispatched += 1;
          results.push({
            index,
            sender: normalized.value.sender,
            status: 'dispatched',
            dispatchMode: queuedMessage ? 'queued' : 'immediate',
            messageId: queuedMessage?.messageId ?? immediateMessage?.messageId ?? null,
          });
        } catch (error) {
          failed += 1;
          results.push({
            index,
            sender: normalized.value.sender,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return stringifyResult({
        ok: true,
        status: failed > 0 ? 'partial' : 'dispatched',
        worldId: resolved.worldId,
        chatId: resolved.chatId,
        requested: args.messages.length,
        accepted,
        dispatched,
        failed,
        results,
      });
    },
  };
}
