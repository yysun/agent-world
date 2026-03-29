/**
 * Agent Turn Loop Runner
 *
 * Purpose:
 * - Provide one named runtime loop helper for agent-turn LLM call / inspect / continue control flow.
 *
 * Key Features:
 * - Centralizes LLM call execution for both initial and continuation turn steps.
 * - Normalizes optional plain-text tool-intent fallback before branching.
 * - Supports bounded empty-text retries and callback-driven continue/stop behavior.
 * - Keeps providers pure by delegating persistence/tool execution through caller callbacks.
 *
 * Implementation Notes:
 * - The runner owns loop repetition; callers own transcript persistence and tool execution details.
 * - This is the Phase 1 control-flow owner, not yet a full standalone action executor.
 *
 * Recent Changes:
 * - 2026-03-29: Initial extracted agent-turn loop helper used by direct and continuation paths.
 */

import type { Agent, AgentMessage, LLMResponse, World, WorldSSEEvent } from '../types.js';
import { generateAgentResponse, streamAgentResponse } from '../llm-manager.js';
import { createCategoryLogger } from '../logger.js';
import { isStreamingEnabled, publishSSE } from './publishers.js';

const loggerTurnLoop = createCategoryLogger('agent.turn.loop');

type ParsedToolIntent = {
  toolName: string;
  toolArgs: Record<string, unknown>;
} | null;

export type AgentTurnLoopControl =
  | { control: 'stop' }
  | { control: 'continue'; transientInstruction?: string };

export interface RunAgentTurnLoopOptions {
  world: World;
  agent: Agent;
  chatId: string;
  abortSignal?: AbortSignal;
  label: 'direct' | 'continuation';
  emptyTextRetryLimit: number;
  initialEmptyTextRetryCount?: number;
  buildMessages: (params: {
    emptyTextRetryCount: number;
    transientInstruction?: string;
  }) => Promise<AgentMessage[]>;
  parsePlainTextToolIntent?: (content: string) => ParsedToolIntent;
  onTextResponse: (params: { responseText: string; messageId: string }) => Promise<AgentTurnLoopControl | void>;
  onToolCallsResponse: (params: { llmResponse: LLMResponse; messageId: string }) => Promise<AgentTurnLoopControl | void>;
  onEmptyTextStop?: (params: { messageId: string; retryCount: number }) => Promise<void>;
  onUnhandledResponse?: (params: { llmResponse: LLMResponse; messageId: string; retryCount: number }) => Promise<void>;
}

function normalizeToolIntentResponse(params: {
  llmResponse: LLMResponse;
  parsePlainTextToolIntent?: (content: string) => ParsedToolIntent;
}): LLMResponse {
  const { llmResponse, parsePlainTextToolIntent } = params;
  if (llmResponse.type !== 'text' || typeof llmResponse.content !== 'string' || !llmResponse.content.trim() || !parsePlainTextToolIntent) {
    return llmResponse;
  }

  const parsedPlainTextToolIntent = parsePlainTextToolIntent(llmResponse.content);
  if (!parsedPlainTextToolIntent) {
    return llmResponse;
  }

  const syntheticToolCallId = `tool-intent-${Date.now()}`;

  return {
    type: 'tool_calls',
    content: llmResponse.content,
    tool_calls: [{
      id: syntheticToolCallId,
      type: 'function',
      function: {
        name: parsedPlainTextToolIntent.toolName,
        arguments: JSON.stringify(parsedPlainTextToolIntent.toolArgs || {}),
      },
    }],
    assistantMessage: {
      role: 'assistant',
      content: llmResponse.content,
      tool_calls: [{
        id: syntheticToolCallId,
        type: 'function',
        function: {
          name: parsedPlainTextToolIntent.toolName,
          arguments: JSON.stringify(parsedPlainTextToolIntent.toolArgs || {}),
        },
      }],
    },
  } as LLMResponse;
}

async function callAgentModel(params: {
  world: World;
  agent: Agent;
  chatId: string;
  abortSignal?: AbortSignal;
  messages: AgentMessage[];
}): Promise<{ response: LLMResponse; messageId: string }> {
  const publishSSEWithChatId = (world: World, data: Partial<WorldSSEEvent>) => {
    publishSSE(world, { ...data, chatId: params.chatId });
  };

  if (isStreamingEnabled()) {
    return streamAgentResponse(
      params.world,
      params.agent,
      params.messages,
      publishSSEWithChatId,
      params.chatId,
      params.abortSignal,
    );
  }

  return generateAgentResponse(
    params.world,
    params.agent,
    params.messages,
    undefined,
    false,
    params.chatId,
    params.abortSignal,
  );
}

export async function runAgentTurnLoop(options: RunAgentTurnLoopOptions): Promise<void> {
  let emptyTextRetryCount = options.initialEmptyTextRetryCount ?? 0;
  let transientInstruction: string | undefined;

  while (true) {
    const messages = await options.buildMessages({
      emptyTextRetryCount,
      transientInstruction,
    });
    transientInstruction = undefined;

    const { response, messageId } = await callAgentModel({
      world: options.world,
      agent: options.agent,
      chatId: options.chatId,
      abortSignal: options.abortSignal,
      messages,
    });

    const llmResponse = normalizeToolIntentResponse({
      llmResponse: response,
      parsePlainTextToolIntent: options.parsePlainTextToolIntent,
    });

    if (llmResponse.type === 'tool_calls') {
      emptyTextRetryCount = 0;
      const next = await options.onToolCallsResponse({ llmResponse, messageId });
      if (next?.control === 'continue') {
        transientInstruction = next.transientInstruction;
        continue;
      }
      return;
    }

    if (llmResponse.type === 'text' && String(llmResponse.content || '').trim()) {
      emptyTextRetryCount = 0;
      const next = await options.onTextResponse({
        responseText: String(llmResponse.content || ''),
        messageId,
      });
      if (next?.control === 'continue') {
        transientInstruction = next.transientInstruction;
        continue;
      }
      return;
    }

    loggerTurnLoop.warn('Agent turn loop received empty or unhandled response', {
      worldId: options.world.id,
      chatId: options.chatId,
      agentId: options.agent.id,
      label: options.label,
      responseType: llmResponse.type,
      retryCount: emptyTextRetryCount,
      messageId,
    });

    if (llmResponse.type === 'text' && emptyTextRetryCount < options.emptyTextRetryLimit) {
      emptyTextRetryCount += 1;
      continue;
    }

    if (llmResponse.type === 'text') {
      await options.onEmptyTextStop?.({ messageId, retryCount: emptyTextRetryCount });
      return;
    }

    await options.onUnhandledResponse?.({
      llmResponse,
      messageId,
      retryCount: emptyTextRetryCount,
    });
    return;
  }
}
