/**
 * Orchestrator Module
 * 
 * Coordinates agent message processing, response generation, and turn management.
 * Provides high-level orchestration functions for agent behavior and LLM interaction.
 * 
 * Features:
 * - Process agent messages with LLM response generation
 * - Determine if agent should respond based on mentions and turn limits
 * - Reset LLM call count for new conversation turns
 * - Turn limit enforcement with automatic handoff to human
 * - AI command handling (gemini, copilot, codex) - results saved directly to memory
 * - Enhanced tool call message formatting with parameters display
 * - SSE tool call data for web clients (streaming mode)
 * 
 * Implementation:
 * - AI commands executed via shell_cmd bypass LLM response flow
 * - Full tool result saved as 'tool' role message (standard flow)
 * - Assistant message content based on exit code:
 *   * Exit code 0: Save only stdout (clean output)
 *   * Exit code != 0: Save full formatted result (includes stderr, error details)
 * - Tool call marked complete and turn ends without LLM processing
 * - Normal shell commands follow standard tool execution and LLM continuation
 * - Tool call messages show up to 3 parameters with truncation for readability
 *   * Single tool: "Calling tool: shell_cmd (command: "ls", directory: "./")"
 *   * Multiple tools: "Calling 2 tools: shell_cmd, read_file"
 * - In streaming mode, formatted tool call content with tool_calls data is sent via SSE
 *   * Ensures web/Electron clients display complete tool call info with parameters
 *   * Prevents incomplete display (e.g., "Calling tool: shell_cmd" without params)
 * 
 * Dependencies (Layer 5):
 * - types.ts (Layer 1)
 * - mention-logic.ts (Layer 2)
 * - publishers.ts (Layer 3)
 * - memory-manager.ts (Layer 4)
 * - utils.ts, logger.ts
 * - llm-manager.ts (runtime)
 * - storage (runtime)
 * 
 * Changes:
 * - 2026-02-11: Fixed tool call display in Electron/web - send formatted content with tool_calls via SSE
 * - 2026-02-11: Fixed OpenAI tool-call protocol integrity.
 *   - Persist only the first executable tool_call when agent execution is single-call.
 *   - Route JSON parse/tool lookup failures through tool-error persistence so each persisted tool_call gets a matching tool message.
 * - 2026-02-10: Upgrade generic LLM tool-call text (e.g., "Calling tool: shell_cmd") to include parsed parameters
 * - 2026-02-10: Made tool-call argument parsing more robust for both JSON strings and object-like payloads
 * - 2026-02-08: Enhanced tool call message formatting to include parameters
 * - 2025-11-11: Added AI command special handling - bypass LLM, save output to memory
 * - 2025-11-09: Extracted from events.ts for modular architecture
 */

import type {
  World,
  Agent,
  WorldMessageEvent,
  StorageAPI,
  AgentMessage
} from '../types.js';
import { SenderType } from '../types.js';
import {
  generateId,
  determineSenderType,
  prepareMessagesForLLM,
  getWorldTurnLimit,
  extractMentions,
  extractParagraphBeginningMentions
} from '../utils.js';
import { createCategoryLogger } from '../logger.js';
import { beginWorldActivity } from '../activity-tracker.js';
import { createStorageWithWrappers } from '../storage/storage-factory.js';
import { generateAgentResponse } from '../llm-manager.js';
import {
  shouldAutoMention,
  addAutoMention,
  hasAnyMentionAtBeginning
} from './mention-logic.js';
import { publishMessage, publishSSE, publishEvent, isStreamingEnabled } from './publishers.js';
import { handleTextResponse } from './memory-manager.js';
import { isAICommand } from '../ai-commands.js';
import { executeShellCommand, formatResultForLLM } from '../shell-cmd-tool.js';

const loggerAgent = createCategoryLogger('agent');
const loggerResponse = createCategoryLogger('response');
const loggerTurnLimit = createCategoryLogger('turnlimit');

type DisplayToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: unknown;
  };
};

// Storage wrapper instance - initialized lazily
let storageWrappers: StorageAPI | null = null;
async function getStorageWrappers(): Promise<StorageAPI> {
  if (!storageWrappers) {
    storageWrappers = await createStorageWithWrappers();
  }
  return storageWrappers!;
}

/**
 * Format tool calls with their parameters for display
 * @param toolCalls - Array of tool calls from LLM response
 * @returns Formatted message string showing tool names and parameters
 */
function parseToolCallArgs(rawArguments: unknown): Record<string, unknown> | null {
  if (rawArguments == null) return {};
  if (typeof rawArguments === 'object' && !Array.isArray(rawArguments)) {
    return rawArguments as Record<string, unknown>;
  }
  if (typeof rawArguments !== 'string') return null;

  const trimmed = rawArguments.trim();
  if (!trimmed) return {};

  const parsed = JSON.parse(trimmed);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return null;
}

function shouldUpgradeToolCallMessage(content: string, toolCalls: DisplayToolCall[]): boolean {
  if (!content.trim()) return true;
  if (!toolCalls || toolCalls.length === 0) return false;

  const normalizedContent = content.trim().toLowerCase().replace(/\s+/g, ' ');
  const genericCallingToolPattern = /^calling tool(?::|\s)/i;
  if (genericCallingToolPattern.test(content) && !content.includes('(')) {
    return true;
  }

  const firstToolName = String(toolCalls[0]?.function?.name || '').trim().toLowerCase();
  if (!firstToolName) return false;

  return normalizedContent === `calling tool: ${firstToolName}` ||
    normalizedContent === `calling tool ${firstToolName}` ||
    normalizedContent === `calling tool: ${firstToolName}.` ||
    normalizedContent === `calling tool ${firstToolName}.`;
}

function formatToolCallsMessage(toolCalls: DisplayToolCall[]): string {
  const toolCount = toolCalls.length;

  if (toolCount === 1) {
    const tc = toolCalls[0];
    const toolName = tc.function.name;

    try {
      const args = parseToolCallArgs(tc.function.arguments);
      if (!args) {
        return `Calling tool: ${toolName}`;
      }
      const paramParts: string[] = [];

      // Format parameters - show up to 3 key parameters
      const keys = Object.keys(args).slice(0, 3);
      for (const key of keys) {
        let value = args[key];

        // Truncate long values
        if (typeof value === 'string' && value.length > 50) {
          value = value.substring(0, 47) + '...';
        } else if (value !== null && typeof value === 'object') {
          const serialized = JSON.stringify(value);
          value = serialized ?? String(value);
          if (typeof value === 'string' && value.length > 50) {
            value = value.substring(0, 47) + '...';
          }
        }

        paramParts.push(`${key}: ${JSON.stringify(value)}`);
      }

      if (Object.keys(args).length > 3) {
        paramParts.push('...');
      }

      return paramParts.length > 0
        ? `Calling tool: ${toolName} (${paramParts.join(', ')})`
        : `Calling tool: ${toolName}`;
    } catch {
      // If arguments can't be parsed, just show the tool name
      return `Calling tool: ${toolName}`;
    }
  } else {
    // Multiple tools - just list the names
    const toolNames = toolCalls.map(tc => tc.function.name).join(', ');
    return `Calling ${toolCount} tools: ${toolNames}`;
  }
}

/**
 * Agent message processing with LLM response generation and auto-mention logic
 */
export async function processAgentMessage(
  world: World,
  agent: Agent,
  messageEvent: WorldMessageEvent
): Promise<void> {
  const completeActivity = beginWorldActivity(world, `agent:${agent.id}`);
  try {
    // Prepare messages for LLM - loads fresh data from storage
    // The user message is already saved in subscribeAgentToMessages, so it's in storage
    const filteredMessages = await prepareMessagesForLLM(
      world.id,
      agent,
      world.currentChatId ?? null
    );

    // Log prepared messages for debugging
    loggerAgent.debug('Prepared messages for LLM', {
      agentId: agent.id,
      chatId: world.currentChatId,
      totalMessages: filteredMessages.length,
      systemMessages: filteredMessages.filter(m => m.role === 'system').length,
      userMessages: filteredMessages.filter(m => m.role === 'user').length,
      assistantMessages: filteredMessages.filter(m => m.role === 'assistant').length,
      toolMessages: filteredMessages.filter(m => m.role === 'tool').length
    });

    // Increment LLM call count and save agent state
    agent.llmCallCount++;
    agent.lastLLMCall = new Date();

    try {
      const storage = await getStorageWrappers();
      await storage.saveAgent(world.id, agent);
    } catch (error) {
      loggerAgent.error('Failed to auto-save agent after LLM call increment', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    }

    // Generate LLM response (streaming or non-streaming) - now returns LLMResponse
    let llmResponse: import('../types.js').LLMResponse;
    let messageId: string;

    if (isStreamingEnabled()) {
      const { streamAgentResponse } = await import('../llm-manager.js');
      const result = await streamAgentResponse(world, agent, filteredMessages, publishSSE);
      llmResponse = result.response;
      messageId = result.messageId;
    } else {
      const { generateAgentResponse } = await import('../llm-manager.js');
      const result = await generateAgentResponse(world, agent, filteredMessages);
      llmResponse = result.response;
      messageId = result.messageId;
    }

    loggerAgent.debug('LLM response received', {
      agentId: agent.id,
      responseType: llmResponse.type,
      hasContent: !!llmResponse.content,
      hasToolCalls: llmResponse.type === 'tool_calls',
      toolCallCount: llmResponse.tool_calls?.length || 0
    });

    // Handle text responses
    if (llmResponse.type === 'text') {
      const responseText = llmResponse.content || '';
      if (!responseText) {
        loggerAgent.debug('LLM text response is empty', { agentId: agent.id });
        return;
      }

      // Process text response (existing logic below)
      await handleTextResponse(world, agent, responseText, messageId, messageEvent);
      return;
    }

    // Handle tool calls - Execute tools through unified execution path
    // This works for both streaming and non-streaming modes
    if (llmResponse.type === 'tool_calls') {
      const returnedToolCalls = llmResponse.tool_calls || [];
      const executableToolCalls = returnedToolCalls.slice(0, 1);
      if (returnedToolCalls.length > executableToolCalls.length) {
        loggerAgent.warn('LLM returned multiple tool calls; processing first call only', {
          agentId: agent.id,
          returnedToolCallCount: returnedToolCalls.length,
          processedToolCallIds: executableToolCalls.map(tc => tc.id),
          droppedToolCallIds: returnedToolCalls.slice(1).map(tc => tc.id)
        });
      }

      loggerAgent.debug('LLM returned tool calls', {
        agentId: agent.id,
        toolCallCount: executableToolCalls.length,
        toolNames: executableToolCalls.map(tc => tc.function.name)
      });

      // Save assistant message with tool_calls to agent memory FIRST
      // This ensures the tool call is in memory before execution

      // Format meaningful content for tool calls if LLM didn't provide text
      let messageContent = llmResponse.content || '';
      if (executableToolCalls.length > 0 &&
        shouldUpgradeToolCallMessage(messageContent, executableToolCalls as DisplayToolCall[])) {
        messageContent = formatToolCallsMessage(executableToolCalls as DisplayToolCall[]);
      }

      // For streaming mode, send the formatted tool call message via SSE
      // This ensures web clients receive the complete tool call info with parameters
      if (isStreamingEnabled()) {
        publishSSE(world, {
          agentName: agent.id,
          type: 'chunk',
          content: messageContent,
          messageId,
          tool_calls: executableToolCalls
        });
      }

      const assistantMessage: AgentMessage = {
        role: 'assistant',
        content: messageContent,
        sender: agent.id,
        createdAt: new Date(),
        chatId: world.currentChatId || null,
        messageId,
        replyToMessageId: messageEvent.messageId,
        tool_calls: executableToolCalls,
        agentId: agent.id,
        // Mark tool calls as incomplete (waiting for execution)
        toolCallStatus: executableToolCalls.reduce((acc, tc) => {
          acc[tc.id] = { complete: false, result: null };
          return acc;
        }, {} as Record<string, { complete: boolean; result: any }>)
      };

      agent.memory.push(assistantMessage);

      // Auto-save agent memory
      try {
        const storage = await getStorageWrappers();
        await storage.saveAgent(world.id, agent);
        loggerAgent.debug('Assistant message with tool_calls saved to memory', {
          agentId: agent.id,
          messageId,
          toolCallCount: executableToolCalls.length,
          toolCallIds: executableToolCalls.map(tc => tc.id)
        });
      } catch (error) {
        loggerAgent.error('Failed to save assistant message with tool_calls', {
          agentId: agent.id,
          error: error instanceof Error ? error.message : error
        });
      }

      // Publish original tool call message event (for display/logging)
      const toolCallEvent: WorldMessageEvent = {
        content: assistantMessage.content || '',
        sender: agent.id,
        timestamp: assistantMessage.createdAt || new Date(),
        messageId: assistantMessage.messageId!,
        chatId: assistantMessage.chatId,
        replyToMessageId: assistantMessage.replyToMessageId
      };
      (toolCallEvent as any).role = 'assistant';
      (toolCallEvent as any).tool_calls = assistantMessage.tool_calls;
      (toolCallEvent as any).toolCallStatus = assistantMessage.toolCallStatus;

      world.eventEmitter.emit('message', toolCallEvent);

      // Execute first tool call (only handle one at a time for now)
      // This is the UNIFIED tool execution path for both streaming and non-streaming
      const toolCall = executableToolCalls[0];
      if (toolCall) {
        loggerAgent.debug('Executing tool call', {
          agentId: agent.id,
          toolCallId: toolCall.id,
          toolName: toolCall.function.name
        });

        // Get MCP tools
        const { getMCPToolsForWorld } = await import('../mcp-server-registry.js');
        const mcpTools = await getMCPToolsForWorld(world.id);

        try {
          const toolDef = mcpTools[toolCall.function.name];
          if (!toolDef) {
            throw new Error(`Tool not found: ${toolCall.function.name}`);
          }

          let toolArgs: Record<string, any>;
          const rawArgs = toolCall.function.arguments;
          if (typeof rawArgs === 'string') {
            toolArgs = JSON.parse(rawArgs || '{}');
          } else if (rawArgs && typeof rawArgs === 'object') {
            toolArgs = rawArgs as Record<string, any>;
          } else {
            toolArgs = {};
          }

          // Handle special AI commands - bypass LLM and save result directly
          if (toolCall.function.name === 'shell_cmd' && isAICommand(toolArgs.command)) {
            loggerAgent.debug('AI command detected, bypassing LLM call', {
              agentId: agent.id,
              command: toolArgs.command
            });

            const result = await executeShellCommand(
              toolArgs.command,
              toolArgs.parameters || [],
              toolArgs.directory || './'
            );

            const formattedResult = formatResultForLLM(result);

            // Save the full tool result as a tool message (standard tool flow)
            const toolResultMessage: AgentMessage = {
              role: 'tool',
              content: formattedResult,
              tool_call_id: toolCall.id,
              sender: agent.id,
              createdAt: new Date(),
              chatId: world.currentChatId || null,
              messageId: generateId(),
              replyToMessageId: messageId,
              agentId: agent.id
            };
            agent.memory.push(toolResultMessage);

            // Save assistant message (bypassing LLM)
            // Exit code 0: Save only stdout (clean output)
            // Exit code != 0: Save full formatted result (includes stderr, error details)
            const assistantContent = result.exitCode === 0
              ? (result.stdout || '(No output)')
              : formattedResult;

            const assistantReply: AgentMessage = {
              role: 'assistant',
              content: assistantContent,
              sender: agent.id,
              createdAt: new Date(),
              chatId: world.currentChatId || null,
              messageId: generateId(),
              replyToMessageId: toolResultMessage.messageId,
              agentId: agent.id
            };
            agent.memory.push(assistantReply);

            // Mark original tool call as complete
            const toolCallMsg = agent.memory.find(
              m => m.role === 'assistant' && m.tool_calls?.some(tc => tc.id === toolCall.id)
            );
            if (toolCallMsg && toolCallMsg.toolCallStatus) {
              toolCallMsg.toolCallStatus[toolCall.id] = { complete: true, result: null };
            }

            // Save agent state
            try {
              const storage = await getStorageWrappers();
              await storage.saveAgent(world.id, agent);
              loggerAgent.debug('Saved agent memory with AI command result', { agentId: agent.id });
            } catch (error) {
              loggerAgent.error('Failed to save agent memory after AI command', {
                agentId: agent.id,
                error: error instanceof Error ? error.message : error
              });
            }

            // Publish the assistant message event (what the user sees)
            const aiCommandMessageEvent: WorldMessageEvent = {
              content: assistantReply.content || '',
              sender: agent.id,
              timestamp: assistantReply.createdAt || new Date(),
              messageId: assistantReply.messageId!,
              chatId: assistantReply.chatId,
              replyToMessageId: assistantReply.replyToMessageId,
            };
            (aiCommandMessageEvent as any).role = 'assistant';
            world.eventEmitter.emit('message', aiCommandMessageEvent);

            return; // End turn
          }

          // Execute tool with context
          const toolContext = {
            world,
            messages: agent.memory,
            toolCallId: toolCall.id,
            workingDirectory: toolArgs.directory || process.cwd()
          };

          const toolResult = await toolDef.execute(toolArgs, undefined, undefined, toolContext);

          // Tool executed successfully - save result and continue LLM loop
          loggerAgent.debug('Tool executed successfully', {
            agentId: agent.id,
            toolCallId: toolCall.id,
            resultLength: typeof toolResult === 'string' ? toolResult.length : 0
          });

          // Publish tool-execution event
          const { publishEvent } = await import('./publishers.js');
          publishEvent(world, 'tool-execution', {
            agentId: agent.id,
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
            chatId: world.currentChatId || null,
            ...(toolArgs.command && { command: toolArgs.command }),
            ...(toolArgs.parameters && { parameters: toolArgs.parameters }),
            ...(toolArgs.directory && { directory: toolArgs.directory })
          });

          // Save tool result to agent memory
          const toolResultMessage: AgentMessage = {
            role: 'tool',
            content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
            tool_call_id: toolCall.id,
            sender: agent.id,
            createdAt: new Date(),
            chatId: world.currentChatId || null,
            messageId: generateId(),
            replyToMessageId: messageId,
            agentId: agent.id
          };

          agent.memory.push(toolResultMessage);

          // Update tool call status to complete
          const toolCallMsg = agent.memory.find(
            m => m.role === 'assistant' && (m as any).tool_calls?.some((tc: any) => tc.id === toolCall.id)
          );
          if (toolCallMsg && (toolCallMsg as any).toolCallStatus) {
            (toolCallMsg as any).toolCallStatus[toolCall.id] = { complete: true, result: toolResult };
          }

          // Save agent with tool result
          try {
            const storage = await getStorageWrappers();
            await storage.saveAgent(world.id, agent);
            loggerAgent.debug('Tool result saved to memory', {
              agentId: agent.id,
              toolCallId: toolCall.id,
              messageId: toolResultMessage.messageId
            });
          } catch (error) {
            loggerAgent.error('Failed to save tool result', {
              agentId: agent.id,
              error: error instanceof Error ? error.message : error
            });
          }

          // Continue LLM loop with tool result
          // The tool result is now in memory, so the next LLM call will see it
          loggerAgent.debug('Continuing LLM loop with tool result', {
            agentId: agent.id,
            toolCallId: toolCall.id
          });

          // Continue the LLM execution loop with the tool result
          const { continueLLMAfterToolExecution } = await import('./memory-manager.js');
          await continueLLMAfterToolExecution(world, agent, world.currentChatId);

        } catch (error) {
          loggerAgent.error('Tool execution error', {
            agentId: agent.id,
            toolCallId: toolCall.id,
            error: error instanceof Error ? error.message : error
          });

          // Save error as tool result
          const errorMessage: AgentMessage = {
            role: 'tool',
            content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
            tool_call_id: toolCall.id,
            sender: agent.id,
            createdAt: new Date(),
            chatId: world.currentChatId || null,
            messageId: generateId(),
            replyToMessageId: messageId,
            agentId: agent.id
          };

          agent.memory.push(errorMessage);

          try {
            const storage = await getStorageWrappers();
            await storage.saveAgent(world.id, agent);
          } catch (saveError) {
            loggerAgent.error('Failed to save error message', {
              agentId: agent.id,
              error: saveError instanceof Error ? saveError.message : saveError
            });
          }
        }
      }

      return;
    }
  } catch (error) {
    loggerAgent.error('Error processing agent message', {
      agentId: agent.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  } finally {
    completeActivity();
  }
}

/**
 * Enhanced message filtering logic with turn limits and mention detection
 */
export async function shouldAgentRespond(world: World, agent: Agent, messageEvent: WorldMessageEvent): Promise<boolean> {
  // Never respond to own messages
  if (messageEvent.sender?.toLowerCase() === agent.id.toLowerCase()) {
    loggerResponse.debug('Skipping own message', { agentId: agent.id, sender: messageEvent.sender });
    return false;
  }

  const content = messageEvent.content || '';

  // Never respond to turn limit messages (prevents endless loops)
  if (content.includes('Turn limit reached')) {
    loggerTurnLimit.debug('Skipping turn limit message', { agentId: agent.id });
    return false;
  }

  // Check turn limit based on LLM call count
  const worldTurnLimit = getWorldTurnLimit(world);
  loggerTurnLimit.debug('Checking turn limit', { agentId: agent.id, llmCallCount: agent.llmCallCount, worldTurnLimit });

  if (agent.llmCallCount >= worldTurnLimit) {
    loggerTurnLimit.debug('Turn limit reached, sending turn limit message', { agentId: agent.id, llmCallCount: agent.llmCallCount, worldTurnLimit });
    const turnLimitMessage = `@human Turn limit reached (${worldTurnLimit} LLM calls). Please take control of the conversation.`;
    publishMessage(world, turnLimitMessage, agent.id);
    return false;
  }

  // Determine sender type for message handling logic
  const senderType = determineSenderType(messageEvent.sender);
  loggerResponse.debug('Determined sender type', { agentId: agent.id, sender: messageEvent.sender, senderType });

  // Never respond to system messages
  if (messageEvent.sender === 'system') {
    loggerResponse.debug('Skipping system message', { agentId: agent.id });
    return false;
  }

  // Always respond to world messages
  if (messageEvent.sender === 'world') {
    loggerResponse.debug('Responding to world message', { agentId: agent.id });
    return true;
  }

  const anyMentions = extractMentions(messageEvent.content);
  const mentions = extractParagraphBeginningMentions(messageEvent.content);
  loggerResponse.debug('Extracted mentions', { mentions, anyMentions });

  // For HUMAN messages
  if (senderType === SenderType.HUMAN) {
    if (mentions.length === 0) {
      if (anyMentions.length > 0) {
        loggerResponse.debug('Mentions exist but not at paragraph beginning', { agentId: agent.id });
        return false;
      }
      loggerResponse.debug('No mentions - public message', { agentId: agent.id });
      return true;
    }
    const shouldRespond = mentions.includes(agent.id.toLowerCase());
    loggerResponse.debug('HUMAN message mention check', { agentId: agent.id, shouldRespond });
    return shouldRespond;
  }

  // For agent messages, only respond if this agent has a paragraph-beginning mention
  const shouldRespond = mentions.includes(agent.id.toLowerCase());
  loggerResponse.debug('AGENT message mention check', { agentId: agent.id, shouldRespond });
  return shouldRespond;
}
