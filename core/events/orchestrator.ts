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
 * 
 * Implementation:
 * - AI commands executed via shell_cmd bypass LLM response flow
 * - Full tool result saved as 'tool' role message (standard flow)
 * - Assistant message content based on exit code:
 *   * Exit code 0: Save only stdout (clean output)
 *   * Exit code != 0: Save full formatted result (includes stderr, error details)
 * - Tool call marked complete and turn ends without LLM processing
 * - Normal shell commands follow standard tool execution and LLM continuation
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
import { globalGuardrail } from '../security/guardrails.js';

// Pi-agent-core imports
import {
  getPiAgentForAgent,
  toAgentMessages,
  toStoredMessage,
  bridgeEventToWorld,
  clearPiAgentCache
} from '../pi-agent-adapter.js';
import { getToolsForAgent } from '../pi-agent-tools.js';
import type { AgentEvent } from '@mariozechner/pi-agent-core';

const loggerAgent = createCategoryLogger('agent');
const loggerResponse = createCategoryLogger('response');
const loggerTurnLimit = createCategoryLogger('turnlimit');

// Storage wrapper instance - initialized lazily
let storageWrappers: StorageAPI | null = null;
async function getStorageWrappers(): Promise<StorageAPI> {
  if (!storageWrappers) {
    storageWrappers = await createStorageWithWrappers();
  }
  return storageWrappers!;
}

/**
 * Agent message processing with LLM response generation and auto-mention logic
 */
export async function processAgentMessage(
  world: World,
  agent: Agent,
  messageEvent: WorldMessageEvent
): Promise<void> {
  console.log(`[ORCHESTRATOR] Processing message for agent: ${agent.id}`);
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
      let responseText = llmResponse.content || '';
      
      // Phase 1: Security Guardrails
      const guardrail = globalGuardrail.validate(responseText);
      if (guardrail.flagged) {
          loggerAgent.warn('Security Guardrail Triggered', { 
              agentId: agent.id, 
              reason: guardrail.reason,
              original: responseText 
          });
          responseText = guardrail.redactedText || "[Redacted by Safety Guardrail]";
      }

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
      loggerAgent.debug('LLM returned tool calls', {
        agentId: agent.id,
        toolCallCount: llmResponse.tool_calls?.length || 0,
        toolNames: llmResponse.tool_calls?.map(tc => tc.function.name)
      });

      // Save assistant message with tool_calls to agent memory FIRST
      // This ensures the tool call is in memory before execution

      // Format meaningful content for tool calls if LLM didn't provide text
      let messageContent = llmResponse.content || '';
      if (!messageContent && llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
        const toolNames = llmResponse.tool_calls.map(tc => tc.function.name).join(', ');
        const toolCount = llmResponse.tool_calls.length;
        messageContent = toolCount === 1
          ? `Calling tool: ${toolNames}`
          : `Calling ${toolCount} tools: ${toolNames}`;
      }

      const assistantMessage: AgentMessage = {
        role: 'assistant',
        content: messageContent,
        sender: agent.id,
        createdAt: new Date(),
        chatId: world.currentChatId || null,
        messageId,
        replyToMessageId: messageEvent.messageId,
        tool_calls: llmResponse.tool_calls,
        agentId: agent.id,
        // Mark tool calls as incomplete (waiting for execution)
        toolCallStatus: llmResponse.tool_calls?.reduce((acc, tc) => {
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
          toolCallCount: llmResponse.tool_calls?.length || 0,
          toolCallIds: llmResponse.tool_calls?.map(tc => tc.id)
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
      const toolCall = llmResponse.tool_calls?.[0];
      if (toolCall) {
        // Emit tool-start event for monitoring/tracing
        const toolStartEvent: any = {
          type: 'tool-start',
          messageId: assistantMessage.messageId || generateId(),
          agentName: agent.id,
          toolExecution: {
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
            input: JSON.parse(toolCall.function.arguments || '{}')
          }
        };
        world.eventEmitter.emit('world', toolStartEvent);

        loggerAgent.debug('Executing tool call', {
          agentId: agent.id,
          toolCallId: toolCall.id,
          toolName: toolCall.function.name
        });

        // Get MCP tools
        const { getMCPToolsForWorld } = await import('../mcp-server-registry.js');
        const mcpTools = await getMCPToolsForWorld(world.id);
        const toolDef = mcpTools[toolCall.function.name];

        if (!toolDef) {
          loggerAgent.error('Tool not found', {
            agentId: agent.id,
            toolName: toolCall.function.name
          });
          return;
        }

        // Parse tool arguments
        const toolArgs = JSON.parse(toolCall.function.arguments || '{}');

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

        try {
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

          // Emit tool-result event for Opik/Tracing (fixes missing span end)
          world.eventEmitter.emit('world', {
            type: 'tool-result',
            messageId: assistantMessage.messageId, 
            agentName: agent.id,
            toolExecution: {
                toolName: toolCall.function.name,
                toolCallId: toolCall.id,
                result: toolResult
            }
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

          // Emit tool-error event for Opik/Tracing
          world.eventEmitter.emit('world', {
            type: 'tool-error',
            messageId: assistantMessage.messageId,
            agentName: agent.id,
            toolExecution: {
                toolName: toolCall.function.name,
                toolCallId: toolCall.id,
                result: error instanceof Error ? error.message : String(error)
            }
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
    
    // Check if any mention matches agent ID or normalized Name
    const agentIdLower = agent.id.toLowerCase();
    
    // Normalize agent name for matching (e.g. "Maestro Composer" -> "maestro composer", "maestro-composer", "maestro")
    const agentNameLower = agent.name.toLowerCase();
    const nameParts = agentNameLower.split(/[\s-_]+/);
    
    const shouldRespond = mentions.some(mention => {
      const m = mention.toLowerCase();
      // 1. Exact ID match (existing logic)
      if (m === agentIdLower) return true;
      
      // 2. Exact Name match (spaces allowed in mention if extractor supported it, but here mention is single word)
      // So checks if "maestro" matches start of agent name parts
      if (nameParts.includes(m)) return true;

      // 3. Prefix match for ID (e.g. "maestro" matches "maestro-composer")
      if (agentIdLower.startsWith(m + '-')) return true;

      return false;
    });

    loggerResponse.debug('HUMAN message mention check', { agentId: agent.id, mentions, shouldRespond });
    return shouldRespond;
  }

  // For agent messages, only respond if this agent has a paragraph-beginning mention
  const shouldRespond = mentions.includes(agent.id.toLowerCase());
  loggerResponse.debug('AGENT message mention check', { agentId: agent.id, shouldRespond });
  return shouldRespond;
}

// ============================================================================
// Pi-Agent-Core Based Processing (New Implementation)
// ============================================================================

/**
 * Feature flag to enable pi-agent-core based processing
 * Set USE_PI_AGENT=true environment variable to use pi-agent-core instead of llm-manager.ts
 */
let usePiAgentCore = process.env.USE_PI_AGENT === 'true';

/**
 * Enable or disable pi-agent-core based processing
 */
export function setUsePiAgentCore(enabled: boolean): void {
  usePiAgentCore = enabled;
  loggerAgent.info('Pi-agent-core mode', { enabled });
}

/**
 * Check if pi-agent-core is enabled
 */
export function isPiAgentCoreEnabled(): boolean {
  return usePiAgentCore;
}

/**
 * Process agent message using pi-agent-core
 * 
 * This is the new implementation that uses @mariozechner/pi-agent-core
 * instead of the old llm-manager.ts approach.
 */
export async function processAgentMessageWithPiAgent(
  world: World,
  agent: Agent,
  messageEvent: WorldMessageEvent
): Promise<void> {
  const completeActivity = beginWorldActivity(world, `agent:${agent.id}`);
  const messageId = generateId();

  try {
    loggerAgent.debug('Processing agent message with pi-agent-core', {
      agentId: agent.id,
      worldId: world.id,
      chatId: world.currentChatId
    });

    // Get tools for this agent
    const tools = getToolsForAgent(agent.id);

    // Get or create pi-agent instance
    const piAgent = await getPiAgentForAgent(world, agent, tools);

    // CRITICAL FIX: Only set isStreaming=true if this adapter supports proper streaming
    // pi-agent-core interprets isStreaming=true as "I am currently busy", which blocks execution
    // We must NOT set this to true before prompt() unless we want to block ourselves.
    // Instead, piAgent likely expects 'isStreaming' to correspond to its internal busy state, 
    // OR it interprets this as "Should I stream response?".
    // If the latter, the error thrown "Agent is already processing" implies status check.
    
    // Let's assume piAgent manages 'isStreaming' state internally and we should not overwrite it.
    // piAgent.state.isStreaming = isStreamingEnabled();
    
    // However, we want strict JSON output for Engraver, and streaming might break that if not handled.
    // But for now, fixing the BLOCKER is priority.
    
    loggerAgent.debug('Set pi-agent streaming mode', {
      agentId: agent.id,
      isStreaming: piAgent.state.isStreaming // Log what it is naturally
    });

    // Load existing messages from agent memory and convert to pi-agent format
    const piMessages = toAgentMessages(agent.memory);
    piAgent.replaceMessages(piMessages);

    // Set system prompt if present
    if (agent.systemPrompt) {
      piAgent.setSystemPrompt(agent.systemPrompt);
    }

    // Set tools
    piAgent.setTools(tools);

    // Track new messages for saving
    const newMessages: AgentMessage[] = [];
    const lastAssistantMessageId = messageId;

    // Subscribe to events and bridge to World using adapter's bridging function
    const unsubscribe = piAgent.subscribe((event: AgentEvent) => {
      // Use adapter's event bridging for SSE and tool events
      bridgeEventToWorld(world, event, agent.id, lastAssistantMessageId);

      // Handle turn_end for message collection and turn limit
      if (event.type === 'turn_end') {
        // Increment LLM call count on each turn
        agent.llmCallCount++;
        agent.lastLLMCall = new Date();

        // Convert the turn's message to storage format
        const storedMsg = toStoredMessage(
          event.message,
          agent.id,
          world.currentChatId || null
        );
        if (storedMsg) {
          storedMsg.replyToMessageId = messageEvent.messageId;
          newMessages.push(storedMsg);
        }

        // Check turn limit
        const turnLimit = getWorldTurnLimit(world);
        if (agent.llmCallCount >= turnLimit) {
          loggerTurnLimit.info('Turn limit reached, aborting agent', {
            agentId: agent.id,
            llmCallCount: agent.llmCallCount,
            turnLimit
          });
          piAgent.abort();
          publishMessage(world, `@human Turn limit reached (${turnLimit} LLM calls). Please take control of the conversation.`, agent.id);
        }
      }

      // Log agent completion
      if (event.type === 'agent_end') {
        loggerAgent.debug('Pi-agent run completed', {
          agentId: agent.id,
          messageCount: event.messages.length,
          newMessages: newMessages.length
        });
      }
    });

    try {
      // Run the prompt with retry logic
      try {
        await piAgent.prompt(messageEvent.content);
      } catch (promptError) {
        if (String(promptError).includes('Agent is already processing a prompt')) {
           // If stuck, clear cache so the NEXT attempt works.
           // Auto-retry is hard because of event subscription closure complexity.
           // By clearing cache and re-throwing, we ensure the user's NEXT message works at least.
           loggerAgent.warn('Agent stuck in processing state, clearing cache', { agentId: agent.id });
           clearPiAgentCache(world.id, agent.id);
        }
        throw promptError;
      }

      // Save new messages to agent memory
      if (newMessages.length > 0) {
        for (const msg of newMessages) {
          agent.memory.push(msg);
        }

        // Also emit the final message event
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content) {
          const finalEvent: WorldMessageEvent = {
            content: lastMsg.content,
            sender: agent.id,
            timestamp: lastMsg.createdAt || new Date(),
            messageId: lastMsg.messageId || generateId(),
            chatId: lastMsg.chatId,
            replyToMessageId: lastMsg.replyToMessageId
          };
          world.eventEmitter.emit('message', finalEvent);
        }

        // Save agent state
        try {
          const storage = await getStorageWrappers();
          await storage.saveAgent(world.id, agent);
          loggerAgent.debug('Saved agent memory after pi-agent run', {
            agentId: agent.id,
            newMessages: newMessages.length,
            totalMemory: agent.memory.length
          });
        } catch (error) {
          loggerAgent.error('Failed to save agent memory', {
            agentId: agent.id,
            error: error instanceof Error ? error.message : error
          });
        }
      } else {
        loggerAgent.warn('Pi-agent run completed but no new messages collected', {
          agentId: agent.id,
          worldId: world.id
        });
      }
    } finally {
      unsubscribe();
    }

  } catch (error) {
    // If agent is stuck in processing state, clear the cache so fresh instance is created next time
    if (String(error).includes('Agent is already processing a prompt')) {
      loggerAgent.warn('Agent stuck in processing state, clearing cache', { agentId: agent.id });
      clearPiAgentCache(world.id, agent.id);
    }

    loggerAgent.error('Error processing agent message with pi-agent-core', {
      agentId: agent.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  } finally {
    completeActivity();
  }
}
