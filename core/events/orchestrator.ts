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
 * - Enhanced tool call message formatting with parameters display
 * - SSE tool call data for web clients (streaming mode)
 * - Robust JSON parsing with detailed error logging for malformed tool arguments
 * 
 * Implementation:
 * - Tool calls follow standard tool execution and LLM continuation flow
 * - Tool call messages show up to 3 parameters with truncation for readability
 *   * Single tool: "Calling tool: shell_cmd (command: "ls", directory: "./")"
 *   * Multiple tools: "Calling 2 tools: shell_cmd, read_file"
 * - In streaming mode, formatted tool call content with tool_calls data is sent via SSE
 *   * Ensures web/Electron clients display complete tool call info with parameters
 *   * Prevents incomplete display (e.g., "Calling tool: shell_cmd" without params)
 * - JSON parse errors include detailed logging (preview, length, error position)
 *   * Helps diagnose LLM-generated malformed JSON in tool arguments
 * - JSON sanitization attempts to fix common LLM JSON issues before parsing
 *   * Handles unterminated strings, trailing commas, truncation, unmatched braces
 *   * Tries progressive fixes: trailing commas → close strings → truncate to valid
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
 * - 2026-02-16: Added `LOG_LLM_TOOL_BRIDGE` gate for LLM↔tool console bridge logs.
 * - 2026-02-16: Added explicit console debug logs for LLM↔tool request/result/error handoff payloads.
 * - 2026-02-14: Shell tool trusted cwd fallback now uses core default working directory (user home) when world `working_directory` is missing.
 * - 2026-02-13: Fixed shell_cmd mismatch handling by validating path targets in command parameters (e.g. `~/`) against world working_directory before execution.
 * - 2026-02-13: Added hard-stop guard for shell_cmd directory mismatches (LLM-requested `directory` must match world `working_directory`).
 * - 2026-02-13: Enriched displayed `shell_cmd` tool-call arguments with trusted world cwd so UI tool-call messages show the actual execution directory.
 * - 2026-02-13: Forced shell tool cwd to trusted world `working_directory`; mismatched LLM `directory` requests now stop execution with explicit error.
 * - 2026-02-13: Added chat-scoped `tool-start/tool-result/tool-error` event publishing so renderer session state stays accurate during tool execution.
 * - 2026-02-13: Added session processing-handle guards so stop requests abort active tool/continuation flow without spawning new LLM work.
 * - 2026-02-13: Propagated explicit `chatId` and stop abort-signal context through LLM/tool execution paths.
 * - 2026-02-11: Enhanced JSON parse error logging with rawArgs preview and suffix
 * - 2026-02-11: Fixed tool call display in Electron/web - send formatted content with tool_calls via SSE
 * - 2026-02-11: Fixed OpenAI tool-call protocol integrity.
 *   - Persist only the first executable tool_call when agent execution is single-call.
 *   - Route JSON parse/tool lookup failures through tool-error persistence so each persisted tool_call gets a matching tool message.
 * - 2026-02-10: Upgrade generic LLM tool-call text (e.g., "Calling tool: shell_cmd") to include parsed parameters
 * - 2026-02-10: Made tool-call argument parsing more robust for both JSON strings and object-like payloads
 * - 2026-02-08: Enhanced tool call message formatting to include parameters
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
  extractParagraphBeginningMentions,
  getDefaultWorkingDirectory,
  getEnvValueFromText
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
import { publishMessage, publishSSE, publishEvent, publishToolEvent, isStreamingEnabled } from './publishers.js';
import { handleTextResponse } from './memory-manager.js';
import {
  executeShellCommand,
  formatResultForLLM,
  validateShellDirectoryRequest,
  validateShellCommandScope
} from '../shell-cmd-tool.js';
import {
  beginChatMessageProcessing,
  isMessageProcessingCanceledError,
  throwIfMessageProcessingStopped
} from '../message-processing-control.js';

import { logToolBridge, getToolResultPreview } from './tool-bridge-logging.js';

const loggerAgent = createCategoryLogger('agent');
const loggerResponse = createCategoryLogger('response');
const loggerTurnLimit = createCategoryLogger('turnlimit');

type DisplayToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
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
 * Sanitize and fix common JSON issues from LLM-generated tool arguments
 * Handles: unterminated strings, unescaped quotes, trailing commas, truncation
 */
function sanitizeAndParseJSON(jsonString: string): Record<string, any> {
  if (!jsonString || jsonString.trim() === '') {
    return {};
  }

  // Try parsing as-is first
  try {
    return JSON.parse(jsonString);
  } catch (firstError) {
    loggerAgent.debug('Initial JSON parse failed, attempting sanitization', {
      error: firstError instanceof Error ? firstError.message : String(firstError)
    });
  }

  let sanitized = jsonString;

  // Fix 1: Remove trailing commas (common LLM mistake)
  sanitized = sanitized.replace(/,(\s*[}\]])/g, '$1');

  // Fix 2: Handle unterminated strings at end (truncation)
  // If the error is "Unterminated string", try to close it
  const unterminatedMatch = sanitized.match(/"[^"]*$/);
  if (unterminatedMatch) {
    loggerAgent.debug('Detected unterminated string at end, attempting to close');
    sanitized = sanitized + '"';

    // Check if we need to close open braces/brackets
    const openBraces = (sanitized.match(/{/g) || []).length;
    const closeBraces = (sanitized.match(/}/g) || []).length;
    const openBrackets = (sanitized.match(/\[/g) || []).length;
    const closeBrackets = (sanitized.match(/\]/g) || []).length;

    // Close any unclosed arrays
    for (let i = 0; i < openBrackets - closeBrackets; i++) {
      sanitized += ']';
    }
    // Close any unclosed objects
    for (let i = 0; i < openBraces - closeBraces; i++) {
      sanitized += '}';
    }
  }

  // Try parsing sanitized version
  try {
    return JSON.parse(sanitized);
  } catch (secondError) {
    loggerAgent.debug('Sanitization failed, trying more aggressive fixes');
  }

  // Fix 3: Try to extract valid JSON from the beginning if there's garbage at the end
  // Find the last valid closing brace/bracket
  let lastValidIndex = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < sanitized.length; i++) {
    const char = sanitized[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"' && !escaped) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{' || char === '[') {
        depth++;
      } else if (char === '}' || char === ']') {
        depth--;
        if (depth === 0) {
          lastValidIndex = i;
        }
      }
    }
  }

  if (lastValidIndex > 0) {
    const truncated = sanitized.substring(0, lastValidIndex + 1);
    try {
      loggerAgent.debug('Attempting to parse truncated JSON', {
        originalLength: sanitized.length,
        truncatedLength: truncated.length
      });
      return JSON.parse(truncated);
    } catch (truncError) {
      loggerAgent.debug('Truncated parse also failed');
    }
  }

  // If all else fails, throw the original error with the sanitized string
  throw new Error(`Unable to parse or sanitize JSON. Original length: ${jsonString.length}, Sanitized length: ${sanitized.length}`);
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

function withTrustedShellDirectory(
  toolCalls: DisplayToolCall[],
  trustedWorkingDirectory: string
): DisplayToolCall[] {
  return toolCalls.map((toolCall) => {
    if (toolCall.function?.name !== 'shell_cmd') {
      return toolCall;
    }

    try {
      const args = parseToolCallArgs(toolCall.function.arguments);
      if (!args) {
        return toolCall;
      }

      const orderedArgs: Record<string, unknown> = {};
      if (Object.prototype.hasOwnProperty.call(args, 'command')) {
        orderedArgs.command = args.command;
      }
      if (Object.prototype.hasOwnProperty.call(args, 'parameters')) {
        orderedArgs.parameters = args.parameters;
      }
      const requestedDirectory = typeof args.directory === 'string' ? args.directory.trim() : '';
      if (requestedDirectory) {
        // Preserve what the model requested; mismatch handling happens at execution guard.
        orderedArgs.directory = args.directory;
      }
      orderedArgs.workingDirectory = trustedWorkingDirectory;

      for (const [key, value] of Object.entries(args)) {
        if (key === 'command' || key === 'parameters' || key === 'directory' || key === 'workingDirectory') continue;
        orderedArgs[key] = value;
      }

      return {
        ...toolCall,
        function: {
          ...toolCall.function,
          arguments: JSON.stringify(orderedArgs)
        }
      };
    } catch {
      return toolCall;
    }
  });
}

/**
 * Agent message processing with LLM response generation and auto-mention logic
 */
export async function processAgentMessage(
  world: World,
  agent: Agent,
  messageEvent: WorldMessageEvent
): Promise<void> {
  // Derive target chatId before activity begins so it is captured in per-chat tracking
  const targetChatId = messageEvent.chatId ?? world.currentChatId ?? null;
  const completeActivity = beginWorldActivity(world, `agent:${agent.id}`, targetChatId ?? undefined);
  let processingHandle: ReturnType<typeof beginChatMessageProcessing> | null = null;
  try {
    if (targetChatId) {
      processingHandle = beginChatMessageProcessing(world.id, targetChatId);
    }
    throwIfMessageProcessingStopped(processingHandle?.signal);

    // Prepare messages for LLM - loads fresh data from storage
    // The user message is already saved in subscribeAgentToMessages, so it's in storage
    const filteredMessages = await prepareMessagesForLLM(
      world.id,
      agent,
      targetChatId
    );
    throwIfMessageProcessingStopped(processingHandle?.signal);

    // Log prepared messages for debugging
    loggerAgent.debug('Prepared messages for LLM', {
      agentId: agent.id,
      chatId: targetChatId,
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

    // Create a wrapped publishSSE that captures the targetChatId for concurrency-safe event routing
    // This ensures SSE events stay bound to the originating session even during concurrent processing
    const publishSSEWithChatId = (w: World, data: Partial<import('../types.js').WorldSSEEvent>) => {
      publishSSE(w, { ...data, chatId: targetChatId });
    };

    if (isStreamingEnabled()) {
      const { streamAgentResponse } = await import('../llm-manager.js');
      const result = await streamAgentResponse(
        world,
        agent,
        filteredMessages,
        publishSSEWithChatId,
        targetChatId ?? null,
        processingHandle?.signal
      );
      llmResponse = result.response;
      messageId = result.messageId;
    } else {
      const { generateAgentResponse } = await import('../llm-manager.js');
      const result = await generateAgentResponse(
        world,
        agent,
        filteredMessages,
        undefined,
        false,
        targetChatId ?? null,
        processingHandle?.signal
      );
      llmResponse = result.response;
      messageId = result.messageId;
    }
    throwIfMessageProcessingStopped(processingHandle?.signal);

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
      // Pass targetChatId explicitly for concurrency-safe processing
      throwIfMessageProcessingStopped(processingHandle?.signal);
      await handleTextResponse(world, agent, responseText, messageId, messageEvent, targetChatId);
      return;
    }

    // Handle tool calls - Execute tools through unified execution path
    // This works for both streaming and non-streaming modes
    if (llmResponse.type === 'tool_calls') {
      const returnedToolCalls = llmResponse.tool_calls || [];
      const executableToolCalls = returnedToolCalls.slice(0, 1);
      const trustedWorkingDirectory = String(
        getEnvValueFromText(world.variables, 'working_directory') || getDefaultWorkingDirectory()
      ).trim() || getDefaultWorkingDirectory();
      const displayToolCalls = withTrustedShellDirectory(
        executableToolCalls as DisplayToolCall[],
        trustedWorkingDirectory
      );
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
      if (displayToolCalls.length > 0 &&
        shouldUpgradeToolCallMessage(messageContent, displayToolCalls)) {
        messageContent = formatToolCallsMessage(displayToolCalls);
      }

      // For streaming mode, send the formatted tool call message via SSE
      // This ensures web clients receive the complete tool call info with parameters
      // Use publishSSEWithChatId to ensure concurrency-safe event routing
      if (isStreamingEnabled()) {
        publishSSEWithChatId(world, {
          agentName: agent.id,
          type: 'chunk',
          content: messageContent,
          messageId,
          tool_calls: displayToolCalls
        });
      }

      const assistantMessage: AgentMessage = {
        role: 'assistant',
        content: messageContent,
        sender: agent.id,
        createdAt: new Date(),
        chatId: targetChatId,
        messageId,
        replyToMessageId: messageEvent.messageId,
        tool_calls: displayToolCalls,
        agentId: agent.id,
        // Mark tool calls as incomplete (waiting for execution)
        toolCallStatus: displayToolCalls.reduce((acc, tc) => {
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
        throwIfMessageProcessingStopped(processingHandle?.signal);
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
            try {
              // Use sanitization function to handle common LLM JSON issues
              toolArgs = sanitizeAndParseJSON(rawArgs);

              // Log if sanitization was needed (successful parse after initial failure)
              try {
                JSON.parse(rawArgs);
              } catch {
                loggerAgent.warn('Tool arguments required JSON sanitization', {
                  agentId: agent.id,
                  toolCallId: toolCall.id,
                  toolName: toolCall.function.name,
                  rawArgsLength: rawArgs.length
                });
              }
            } catch (parseError) {
              // Enhanced error logging for JSON parse failures
              loggerAgent.error('Failed to parse tool call arguments as JSON (even after sanitization)', {
                agentId: agent.id,
                toolCallId: toolCall.id,
                toolName: toolCall.function.name,
                error: parseError instanceof Error ? parseError.message : String(parseError),
                rawArgsLength: rawArgs.length,
                rawArgsPreview: rawArgs.substring(0, 500), // First 500 chars
                rawArgsSuffix: rawArgs.length > 500 ? rawArgs.substring(rawArgs.length - 200) : '', // Last 200 chars
              });
              throw new Error(`Invalid JSON in tool arguments: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            }
          } else if (rawArgs && typeof rawArgs === 'object') {
            toolArgs = rawArgs as Record<string, any>;
          } else {
            toolArgs = {};
          }

          publishToolEvent(world, {
            agentName: agent.id,
            type: 'tool-start',
            messageId: toolCall.id,
            chatId: targetChatId,
            toolExecution: {
              toolName: toolCall.function.name,
              toolCallId: toolCall.id,
              input: toolArgs,
              metadata: {
                isStreaming: isStreamingEnabled()
              }
            }
          });

          logToolBridge('LLM -> TOOL', {
            worldId: world.id,
            agentId: agent.id,
            chatId: targetChatId,
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            args: toolArgs,
          });

          if (toolCall.function.name === 'shell_cmd') {
            const directoryValidation = validateShellDirectoryRequest(
              toolArgs.directory,
              trustedWorkingDirectory
            );
            if (!directoryValidation.valid) {
              throw new Error(directoryValidation.error);
            }
            const scopeValidation = validateShellCommandScope(
              toolArgs.command,
              toolArgs.parameters,
              trustedWorkingDirectory
            );
            if (!scopeValidation.valid) {
              throw new Error(scopeValidation.error);
            }
          }

          // Execute tool with context
          const toolContext = {
            world,
            messages: agent.memory,
            toolCallId: toolCall.id,
            chatId: targetChatId,
            abortSignal: processingHandle?.signal,
            workingDirectory: trustedWorkingDirectory
          };

          const toolResult = await toolDef.execute(toolArgs, undefined, undefined, toolContext);
          if (processingHandle?.isStopped()) {
            const toolCallMsg = agent.memory.find(
              m => m.role === 'assistant' && (m as any).tool_calls?.some((tc: any) => tc.id === toolCall.id)
            );
            if (toolCallMsg && (toolCallMsg as any).toolCallStatus) {
              (toolCallMsg as any).toolCallStatus[toolCall.id] = { complete: true, result: 'canceled' };
            }
            try {
              const storage = await getStorageWrappers();
              await storage.saveAgent(world.id, agent);
            } catch (error) {
              loggerAgent.error('Failed to save canceled tool state', {
                agentId: agent.id,
                error: error instanceof Error ? error.message : error
              });
            }
            loggerAgent.info('Tool execution canceled by stop request before continuation', {
              agentId: agent.id,
              toolCallId: toolCall.id,
              targetChatId
            });
            publishToolEvent(world, {
              agentName: agent.id,
              type: 'tool-error',
              messageId: toolCall.id,
              chatId: targetChatId,
              toolExecution: {
                toolName: toolCall.function.name,
                toolCallId: toolCall.id,
                input: toolArgs,
                error: 'Tool execution canceled by user'
              }
            });
            return;
          }

          // Tool executed successfully - save result and continue LLM loop
          loggerAgent.debug('Tool executed successfully', {
            agentId: agent.id,
            toolCallId: toolCall.id,
            resultLength: typeof toolResult === 'string' ? toolResult.length : 0
          });

          // Publish tool-execution event
          publishEvent(world, 'tool-execution', {
            agentId: agent.id,
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
            chatId: targetChatId,
            ...(toolArgs.command && { command: toolArgs.command }),
            ...(toolArgs.parameters && { parameters: toolArgs.parameters }),
            ...(toolCall.function.name === 'shell_cmd' && { directory: trustedWorkingDirectory }),
            ...(toolCall.function.name !== 'shell_cmd' && toolArgs.directory && { directory: toolArgs.directory })
          });
          const serializedToolResult = typeof toolResult === 'string'
            ? toolResult
            : JSON.stringify(toolResult) ?? String(toolResult);
          const toolResultPreview = serializedToolResult.slice(0, 4000);
          publishToolEvent(world, {
            agentName: agent.id,
            type: 'tool-result',
            messageId: toolCall.id,
            chatId: targetChatId,
            toolExecution: {
              toolName: toolCall.function.name,
              toolCallId: toolCall.id,
              input: toolArgs,
              result: toolResultPreview,
              resultType: typeof toolResult === 'string'
                ? 'string'
                : Array.isArray(toolResult)
                  ? 'array'
                  : toolResult === null
                    ? 'null'
                    : 'object',
              resultSize: toolResultPreview.length
            }
          });

          logToolBridge('TOOL -> LLM', {
            worldId: world.id,
            agentId: agent.id,
            chatId: targetChatId,
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            resultPreview: getToolResultPreview(toolResult),
          });

          // Save tool result to agent memory
          const toolResultMessage: AgentMessage = {
            role: 'tool',
            content: serializedToolResult,
            tool_call_id: toolCall.id,
            sender: agent.id,
            createdAt: new Date(),
            chatId: targetChatId,
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
            toolCallId: toolCall.id,
            targetChatId
          });

          // Continue the LLM execution loop with the tool result
          // Pass explicit chatId for concurrency-safe continuation
          throwIfMessageProcessingStopped(processingHandle?.signal);
          const { continueLLMAfterToolExecution } = await import('./memory-manager.js');
          await continueLLMAfterToolExecution(world, agent, targetChatId, {
            abortSignal: processingHandle?.signal
          });

        } catch (error) {
          if (isMessageProcessingCanceledError(error) || processingHandle?.isStopped()) {
            loggerAgent.info('Tool execution canceled', {
              agentId: agent.id,
              toolCallId: toolCall.id,
              error: error instanceof Error ? error.message : String(error)
            });
            const toolCallMsg = agent.memory.find(
              m => m.role === 'assistant' && (m as any).tool_calls?.some((tc: any) => tc.id === toolCall.id)
            );
            if (toolCallMsg && (toolCallMsg as any).toolCallStatus) {
              (toolCallMsg as any).toolCallStatus[toolCall.id] = { complete: true, result: 'canceled' };
            }
            try {
              const storage = await getStorageWrappers();
              await storage.saveAgent(world.id, agent);
            } catch (saveError) {
              loggerAgent.error('Failed to save canceled tool state', {
                agentId: agent.id,
                error: saveError instanceof Error ? saveError.message : saveError
              });
            }
            publishToolEvent(world, {
              agentName: agent.id,
              type: 'tool-error',
              messageId: toolCall.id,
              chatId: targetChatId,
              toolExecution: {
                toolName: toolCall.function.name,
                toolCallId: toolCall.id,
                error: 'Tool execution canceled by user'
              }
            });
            return;
          }

          loggerAgent.error('Tool execution error', {
            agentId: agent.id,
            toolCallId: toolCall.id,
            error: error instanceof Error ? error.message : error
          });
          publishToolEvent(world, {
            agentName: agent.id,
            type: 'tool-error',
            messageId: toolCall.id,
            chatId: targetChatId,
            toolExecution: {
              toolName: toolCall.function.name,
              toolCallId: toolCall.id,
              error: error instanceof Error ? error.message : String(error)
            }
          });

          logToolBridge('TOOL ERROR -> LLM', {
            worldId: world.id,
            agentId: agent.id,
            chatId: targetChatId,
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            error: error instanceof Error ? error.message : String(error),
          });

          // Save error as tool result
          const errorMessage: AgentMessage = {
            role: 'tool',
            content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
            tool_call_id: toolCall.id,
            sender: agent.id,
            createdAt: new Date(),
            chatId: targetChatId,
            messageId: generateId(),
            replyToMessageId: messageId,
            agentId: agent.id
          };

          agent.memory.push(errorMessage);

          const toolCallMsg = agent.memory.find(
            m => m.role === 'assistant' && (m as any).tool_calls?.some((tc: any) => tc.id === toolCall.id)
          );
          if (toolCallMsg && (toolCallMsg as any).toolCallStatus) {
            (toolCallMsg as any).toolCallStatus[toolCall.id] = {
              complete: true,
              result: errorMessage.content
            };
          }

          try {
            const storage = await getStorageWrappers();
            await storage.saveAgent(world.id, agent);
          } catch (saveError) {
            loggerAgent.error('Failed to save error message', {
              agentId: agent.id,
              error: saveError instanceof Error ? saveError.message : saveError
            });
          }

          loggerAgent.debug('Continuing LLM loop with tool error result', {
            agentId: agent.id,
            toolCallId: toolCall.id,
            targetChatId
          });

          throwIfMessageProcessingStopped(processingHandle?.signal);
          const { continueLLMAfterToolExecution } = await import('./memory-manager.js');
          await continueLLMAfterToolExecution(world, agent, targetChatId, {
            abortSignal: processingHandle?.signal
          });
        }
      }

      return;
    }
  } catch (error) {
    if (isMessageProcessingCanceledError(error) || processingHandle?.isStopped()) {
      loggerAgent.info('Agent message processing canceled', {
        agentId: agent.id,
        chatId: messageEvent.chatId ?? world.currentChatId ?? null,
        error: error instanceof Error ? error.message : String(error)
      });
      return;
    }

    loggerAgent.error('Error processing agent message', {
      agentId: agent.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  } finally {
    processingHandle?.complete();
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
    const turnLimitChatId = messageEvent.chatId ?? world.currentChatId ?? null;
    if (turnLimitChatId) {
      publishMessage(world, turnLimitMessage, agent.id, turnLimitChatId);
    } else {
      loggerTurnLimit.warn('Skipping turn limit message publish without chat context', {
        agentId: agent.id,
        worldId: world.id,
        messageId: messageEvent.messageId,
      });
    }
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
