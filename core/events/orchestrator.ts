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
      loggerAgent.debug('LLM returned tool calls', {
        agentId: agent.id,
        toolCallCount: llmResponse.tool_calls?.length || 0,
        toolNames: llmResponse.tool_calls?.map(tc => tc.function.name)
      });

      // Save assistant message with tool_calls to agent memory FIRST
      // This ensures the tool call is in memory before execution/approval

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

          // Create a new assistant message with the result
          const assistantReply: AgentMessage = {
            role: 'assistant',
            content: formattedResult,
            sender: agent.id,
            createdAt: new Date(),
            chatId: world.currentChatId || null,
            messageId: generateId(),
            replyToMessageId: messageId,
            agentId: agent.id
          };
          agent.memory.push(assistantReply);

          // Mark original tool call as complete
          const toolCallMsg = agent.memory.find(
            m => m.role === 'assistant' && m.tool_calls?.some(tc => tc.id === toolCall.id)
          );
          if (toolCallMsg && toolCallMsg.toolCallStatus) {
            toolCallMsg.toolCallStatus[toolCall.id] = { complete: true, result: formattedResult };
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

          // Publish the new message
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

        // Execute tool with context (approval checking happens inside wrapToolWithValidation)
        const toolContext = {
          world,
          messages: agent.memory,
          toolCallId: toolCall.id,
          workingDirectory: toolArgs.directory || process.cwd()
        };

        try {
          const toolResult = await toolDef.execute(toolArgs, undefined, undefined, toolContext);

          // Check if tool returned approval request
          if (toolResult && typeof toolResult === 'object' && toolResult._stopProcessing && toolResult._approvalMessage) {
            loggerAgent.debug('Tool requires approval', {
              agentId: agent.id,
              toolCallId: toolCall.id
            });

            // Save and publish approval request message
            const approvalMsg = toolResult._approvalMessage;
            const approvalMessageId = generateId();
            const approvalMessage: AgentMessage = {
              role: approvalMsg.role,
              content: approvalMsg.content || '',
              sender: agent.id,
              createdAt: new Date(),
              chatId: world.currentChatId || null,
              messageId: approvalMessageId,
              replyToMessageId: messageId,
              tool_calls: approvalMsg.tool_calls,
              agentId: agent.id,
              toolCallStatus: approvalMsg.toolCallStatus
            };

            agent.memory.push(approvalMessage);

            // Save agent with approval message
            try {
              const storage = await getStorageWrappers();
              await storage.saveAgent(world.id, agent);
              loggerAgent.debug('Approval request saved to memory', {
                agentId: agent.id,
                approvalMessageId
              });
            } catch (error) {
              loggerAgent.error('Failed to save approval request', {
                agentId: agent.id,
                error: error instanceof Error ? error.message : error
              });
            }

            // Publish approval request message event
            const approvalEvent: WorldMessageEvent = {
              content: approvalMessage.content || '',
              sender: agent.id,
              timestamp: approvalMessage.createdAt || new Date(),
              messageId: approvalMessage.messageId!,
              chatId: approvalMessage.chatId,
              replyToMessageId: approvalMessage.replyToMessageId
            };
            (approvalEvent as any).role = 'assistant';
            (approvalEvent as any).tool_calls = approvalMessage.tool_calls;
            (approvalEvent as any).toolCallStatus = approvalMessage.toolCallStatus;

            world.eventEmitter.emit('message', approvalEvent);

            loggerAgent.debug('Approval request published', {
              agentId: agent.id,
              approvalMessageId
            });

            return; // Wait for user approval
          }

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

          // Continue LLM loop with tool result - call resumeLLMAfterApproval
          // The tool result is now in memory, so the next LLM call will see it
          loggerAgent.debug('Continuing LLM loop with tool result', {
            agentId: agent.id,
            toolCallId: toolCall.id
          });

          // Use the existing resumeLLMAfterApproval function (same as approval flow)
          const { resumeLLMAfterApproval } = await import('./memory-manager.js');
          await resumeLLMAfterApproval(world, agent, world.currentChatId);

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
