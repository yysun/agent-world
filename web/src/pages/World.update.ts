/**
 * World Update Handlers - Core-Centric AppRun Event System
 *
 * Architecture:
 * - Core handles: Auto-restoration, auto-save, memory management
 * - Frontend handles: Display, user input, SSE streaming, UI state
 *
 * Features:
 * - World initialization with core auto-restore via getWorld()
 * - Chat management (create, load, delete) with proper state restoration
 * - Real-time messaging via SSE with auto-save integration
 * - Agent/world memory management and UI controls
 * - Settings and chat history navigation with modal management
 * - Markdown export functionality with HTML rendering
 * - Smooth streaming indicator management (removed after final message displayed)
 * - Message editing with backend API integration (remove + resubmit)
 * - Memory-only message streaming for agent→agent messages saved without response
 * - Tool call approval request/response detection and display
 * - Agent @mention support in approval responses
 *
 * Message Edit Feature (Frontend-Driven):
 * - Uses backend messageId (server-generated) for message identification
 * - Two-phase edit: 1) DELETE removes messages, 2) POST resubmits edited content
 * - Phase 1: Calls DELETE /worlds/:worldName/messages/:messageId (removal only)
 * - Phase 2: Reuses POST /messages with existing SSE streaming (agents respond naturally)
 * - LocalStorage backup before DELETE for recovery if POST fails
 * - Validates session mode BEFORE DELETE (not after)
 * - Optimistic UI updates with error rollback
 * - Comprehensive error handling (423 Locked, 404 Not Found, 400 Bad Request)
 * - Recovery mechanism: "Resume Edit" on POST failure
 * - User messages updated with backend messageId when message event received
 *
 * Message Deduplication (Multi-Agent):
 * - User messages deduplicated by messageId to prevent duplicate display
 * - Each agent receives same user message, but UI shows it only once
 * - Displays only FIRST agent (intended recipient) via seenByAgents array
 * - seenByAgents contains only the first agent, not all who received it (matches export.ts logic)
 * - Subsequent duplicates in other agents' memory are ignored for display
 * - Calculation happens in TWO places:
 *   1. SSE streaming: handleMessageEvent() sets first agent when message arrives
 *   2. Storage loading: deduplicateMessages() uses first agent from memory
 * - Displays single recipient: "To: a1" showing intended target agent
 * - Edit button disabled until messageId confirmed (prevents premature edit attempts)
 * - Applies deduplication in TWO paths:
 *   1. SSE streaming path: handleMessageEvent() checks for existing messageId OR temp userEntered message
 *   2. Load from storage path: deduplicateMessages() processes loaded history
 * - Uses combined check (messageId OR userEntered+text) to prevent race conditions
 * - Race condition fix: Multiple agents may process same temp message simultaneously
 *   Solution: Single findIndex with OR condition catches both messageId and temp message
 *
 * Tool Call Approval Flow:
 * - Detects client.requestApproval tool calls in SSE message events
 * - Flags messages with isToolCallRequest and toolCallData
 * - Renders ToolCallRequestBox with approval buttons inline in chat
 * - Detects tool result messages as approval responses
 * - Flags responses with isToolCallResponse and approval decision
 * - Renders ToolCallResponseBox showing approval result
 * - Captures agentId from approval requests and includes it in responses
 * - Sends approval responses using enhanced string protocol with agentId in JSON
 * - Enhanced protocol format: JSON.stringify({__type:'tool_result',tool_call_id,agentId,content})
 * - Server automatically prepends @mention based on agentId in JSON
 * - Matches TUI/CLI implementation for OpenAI-compliant agent memory
 *
 * Changes:
 * - 2025-11-11: Fixed createMessageFromMemory to pass through tool_calls and tool_call_id for frontend formatting
 * - 2025-11-11: Simplified spinner control to use pending operations count from world events (pending > 0 = show, pending === 0 = hide)
 * - 2025-11-11: Enhanced handleWorldActivity to support agent IDs without "agent:" prefix (e.g., "g1" instead of "agent:g1")
 * - 2025-11-10: Fixed detectToolCallResponse to properly parse enhanced protocol format
 * - 2025-11-10: Fixed tool result message display - filter out internal protocol messages with __type: tool_result
 * - 2025-11-10: Added SSE streaming support to tool result submission for real-time agent responses
 * - 2025-11-06: Moved agentId into JSON structure (cleaner than @mention prefix)
 * - 2025-11-06: Updated approval response to use enhanced string protocol (OpenAI format)
 * - 2025-11-05: Added agent @mention support for approval responses to match CLI behavior
 * - 2025-11-05: Added tool call request/response detection and inline display
 * - 2025-10-26: Phase 1 - Converted to AppRun native typed events with Update<State, Events> tuple pattern
 * - 2025-10-26: Fixed createMessageFromMemory to swap sender/fromAgentId for incoming agent messages
 * - 2025-10-26: Fixed display to show only first agent (intended recipient), not all recipients
 * - 2025-10-26: Fixed Bug #2 - Empty seenByAgents instead of ['unknown'] for multi-agent scenarios
 * - 2025-10-26: Aligned seenByAgents with export.ts - incremental build from actual data, not assumption
 * - 2025-10-26: Fixed deduplicateMessages() to calculate seenByAgents with all agent IDs (CR fix)
 * - 2025-10-25: Fixed seenByAgents to include all agent IDs instead of 'unknown' for user messages
 * - 2025-10-25: Fixed race condition in handleMessageEvent - combined messageId and temp message check
 * - 2025-10-25: Added deduplicateMessages() helper for loading chat history from storage
 * - 2025-10-25: Applied deduplication to both SSE streaming AND load-from-storage paths
 * - 2025-10-25: Added message deduplication by messageId for multi-agent scenarios
 * - 2025-10-25: Added seenByAgents tracking and delivery status display
 * - 2025-10-21: Refactored to frontend-driven approach (DELETE → POST) for SSE streaming reuse
 * - 2025-10-21: Added localStorage backup and recovery mechanism
 * - 2025-10-21: Fixed user message messageId tracking - updates temp message with backend ID
 * - 2025-10-21: Integrated message edit with backend API (remove-and-resubmit approach)
 * - 2025-08-09: Removed selectedSettingsTarget localStorage persistence
 */

import { app } from 'apprun';
import type { Update } from 'apprun';
import api from '../api';
import * as InputDomain from '../domain/input';
import * as EditingDomain from '../domain/editing';
import * as DeletionDomain from '../domain/deletion';
import * as ChatHistoryDomain from '../domain/chat-history';
import * as SSEStreamingDomain from '../domain/sse-streaming';
import * as AgentManagementDomain from '../domain/agent-management';
import * as WorldExportDomain from '../domain/world-export';
import * as MessageDisplayDomain from '../domain/message-display';
import {
  sendChatMessage,
  submitToolResult,
  handleStreamStart,
  handleStreamChunk,
  handleStreamEnd,
  handleStreamError as handleStreamErrorBase,
  handleLogEvent,
  handleToolError as handleToolErrorBase,
  handleToolStart as handleToolStartBase,
  handleToolProgress as handleToolProgressBase,
  handleToolResult as handleToolResultBase,
  handleToolStream as handleToolStreamBase,
  handleMessageToolCalls,
} from '../utils/sse-client';
import type { WorldComponentState, Agent, AgentMessage, Message, ApprovalRequest, HITLRequest } from '../types';
import type { WorldEventName, WorldEventPayload } from '../types/events';
import toKebabCase from '../utils/toKebabCase';

// Utility functions for message processing
const createMessageFromMemory = (memoryItem: AgentMessage, agentName: string): Message => {
  const sender = toKebabCase(memoryItem.sender || agentName);

  // Determine message type based on role field from backend
  // role='user' → incoming message (type='user') - saved to agent memory
  // role='assistant' → agent reply (type='agent') - agent's own response
  // role='tool' → tool result message (type='tool') - will be filtered by shouldHideMessage
  // sender='human'/'user' → human message (type='user')
  let messageType: string;
  if (sender === 'human' || sender === 'user') {
    messageType = 'user';
  } else if (memoryItem.role === 'tool') {
    // Tool result message
    messageType = 'tool';
  } else if (memoryItem.role === 'user') {
    // Agent message saved to memory as incoming (not a reply)
    messageType = 'user';
  } else if (memoryItem.role === 'assistant') {
    // Agent's own reply
    messageType = 'agent';
  } else {
    // Fallback: if sender is an agent and role is not specified, assume it's a reply
    messageType = 'agent';
  }

  const isUserMessage = messageType === 'user';

  // Auto-generate fallback ID for legacy messages without messageId
  if (!memoryItem.messageId) {
    // Generate deterministic fallback ID based on message content and timestamp
    const timestamp = memoryItem.createdAt ? new Date(memoryItem.createdAt).getTime() : Date.now();
    const contentHash = (memoryItem.content || '').substring(0, 20).replace(/\s/g, '');
    memoryItem.messageId = `fallback-${timestamp}-${contentHash.substring(0, 10)}`;
  }

  // For cross-agent incoming messages (role='user', sender is agent):
  // - memoryItem.sender = original message author (e.g., "a1")
  // - agentName = recipient agent whose memory this is (e.g., "o1")
  // - We need to swap them for display consistency with SSE:
  //   - sender should be recipient (o1)
  //   - fromAgentId should be original author (a1)
  const isAgentSender = sender !== 'human' && sender !== 'user';
  const isIncomingAgentMessage = isUserMessage && isAgentSender;

  let displaySender: string;
  let displayFromAgentId: string | undefined;

  if (isIncomingAgentMessage) {
    // Swap: display recipient as sender, original sender as fromAgentId
    displaySender = toKebabCase(agentName); // Recipient agent (o1)
    displayFromAgentId = sender; // Original sender (a1)
  } else {
    // Normal case: keep as is
    displaySender = sender;
    displayFromAgentId = memoryItem.agentId || (isUserMessage ? undefined : agentName);
  }

  // Check for tool call request/response in memory item
  const memoryData = memoryItem as any;
  const toolCallRequest = detectToolCallRequest(memoryData);
  const toolCallResponse = detectToolCallResponse(memoryData);

  // Set message text - use placeholder for tool call messages with empty content
  let messageText = memoryItem.content || '';
  if (!messageText && (toolCallRequest || toolCallResponse)) {
    if (toolCallRequest) {
      messageText = `[Tool approval request: ${toolCallRequest.toolName}]`;
    } else if (toolCallResponse) {
      messageText = `[Tool execution result]`;
    }
  }

  return {
    id: `msg-${Date.now() + Math.random()}`,
    sender: displaySender,
    text: messageText,
    messageId: memoryItem.messageId,
    replyToMessageId: memoryItem.replyToMessageId, // Preserve parent message reference
    createdAt: memoryItem.createdAt || new Date(),
    type: messageType,
    fromAgentId: displayFromAgentId,
    ownerAgentId: toKebabCase(agentName), // Track which agent's memory this came from
    role: memoryItem.role, // Preserve role for sorting
    // Pass through tool_calls and tool_call_id for frontend formatting
    tool_calls: memoryData.tool_calls || memoryData.toolCalls,
    tool_call_id: memoryData.tool_call_id || memoryData.toolCallId,
    // Set tool call flags
    isToolCallRequest: !!toolCallRequest,
    isToolCallResponse: !!toolCallResponse,
    toolCallData: toolCallRequest || toolCallResponse
  } as Message;
};

/**
 * Detect if message contains tool call approval request
 * @param messageData - Message data from SSE event
 * @returns Tool call data if this is an approval request, null otherwise
 */
const detectToolCallRequest = (messageData: any): Message['toolCallData'] | null => {
  // Handle both tool_calls (snake_case from DB) and toolCalls (camelCase from API)
  const toolCallsField = messageData?.tool_calls || messageData?.toolCalls;

  // If tool_calls/toolCalls is a string, parse it first
  let toolCalls = toolCallsField;
  if (typeof toolCallsField === 'string') {
    try {
      toolCalls = JSON.parse(toolCallsField);
    } catch (error) {
      console.warn('Failed to parse tool_calls JSON string:', error);
      return null;
    }
  }

  if (!toolCalls || !Array.isArray(toolCalls)) {
    return null;
  }

  // Find client.requestApproval tool call
  for (const toolCall of toolCalls) {
    const toolName = toolCall?.function?.name;
    if (toolName === 'client.requestApproval') {
      let parsedArgs: any = {};
      try {
        parsedArgs = toolCall.function?.arguments
          ? JSON.parse(toolCall.function.arguments)
          : {};
      } catch (error) {
        console.warn('Failed to parse approval request arguments:', error);
      }

      console.log('[detectToolCallRequest] Debug:', {
        'toolCall.id': toolCall.id,
        'parsedArgs': parsedArgs,
        'parsedArgs.originalToolCall': parsedArgs?.originalToolCall
      });
      return {
        toolCallId: toolCall.id || `approval-${Date.now()}`,
        originalToolCall: parsedArgs?.originalToolCall, // Store complete original tool call (including id)
        toolName: parsedArgs?.originalToolCall?.name ?? 'Unknown tool',
        toolArgs: parsedArgs?.originalToolCall?.args ?? {},
        approvalMessage: parsedArgs?.message ?? 'This tool requires your approval to continue.',
        approvalOptions: Array.isArray(parsedArgs?.options) && parsedArgs.options.length > 0
          ? parsedArgs.options
          : ['deny', 'approve_once', 'approve_session'],
        agentId: messageData?.sender || messageData?.agentId // Capture agent that made the request
      } as Message['toolCallData'];
    }
  }

  return null;
};

/**
 * Detect if message is a tool result (approval response)
 * ONLY detects approval responses - regular tool execution results should NOT be detected
 * Approval responses have tool_call_id starting with 'approval_' or contain enhanced protocol
 * Parses enhanced protocol format: {__type: 'tool_result', content: '{"decision":"approve",...}'}
 * @param messageData - Message data from SSE event
 * @returns Tool call data if this is an approval response, null otherwise (including regular tool results)
 */
const detectToolCallResponse = (messageData: any): Message['toolCallData'] | null => {
  // Check if this is a tool result message
  if (messageData.role === 'tool' || messageData.type === 'tool') {
    const toolCallId = messageData.tool_call_id || 'unknown';
    const rawContent = messageData.content || messageData.message || '';

    // Try to parse enhanced protocol format
    try {
      const outerParsed = JSON.parse(rawContent);

      // Check for __type: 'tool_result' (enhanced protocol for approval responses)
      if (outerParsed.__type === 'tool_result' && outerParsed.content) {
        try {
          const innerContent = JSON.parse(outerParsed.content);

          // Only process if it has decision field (approval response indicator)
          if (innerContent.decision) {
            // Extract decision and scope from structured data
            const approvalDecision: 'approve' | 'deny' = innerContent.decision === 'approve' ? 'approve' : 'deny';
            const approvalScope: 'once' | 'session' | 'none' =
              innerContent.scope === 'session' ? 'session' :
                innerContent.scope === 'once' ? 'once' : 'none';

            return {
              toolCallId: outerParsed.tool_call_id || toolCallId,
              toolName: innerContent.toolName || 'Tool Execution',
              toolArgs: innerContent.toolArgs || {},
              approvalDecision,
              approvalScope
            };
          }
          // No decision field - this is a regular tool result, not an approval response
          return null;
        } catch (innerError) {
          console.warn('Failed to parse tool result inner content:', innerError);
        }
      }
    } catch (outerError) {
      // Not JSON or not enhanced protocol - check if it's an approval by tool_call_id prefix
    }

    // Only detect as approval response if tool_call_id starts with 'approval_'
    if (!toolCallId.startsWith('approval_')) {
      return null; // Regular tool execution result - not an approval response
    }

    // Legacy approval detection for messages with 'approval_' prefix
    const content = rawContent.toLowerCase();
    let approvalDecision: 'approve' | 'deny' = 'deny';
    let approvalScope: 'once' | 'session' | 'none' = 'none';

    if (content.includes('approved') || content.includes('success')) {
      approvalDecision = 'approve';
      if (content.includes('session') || content.includes('always')) {
        approvalScope = 'session';
      } else if (content.includes('once')) {
        approvalScope = 'once';
      }
    }

    return {
      toolCallId,
      toolName: 'Tool Execution',
      toolArgs: {},
      approvalDecision,
      approvalScope
    };
  }

  return null;
};

/**
 * Deduplicates messages by messageId to handle multi-agent scenarios.
 * User messages appear only once, with seenByAgents showing only the FIRST agent (intended recipient).
 * Agent messages remain separate (one per agent).
 * 
 * Matches export.ts deduplication logic - shows first agent only, not all recipients.
 * 
 * @param messages - Array of messages to deduplicate
 * @param agents - Array of agents in the world (used to resolve agent IDs to names)
 */
const deduplicateMessages = (messages: Message[], agents: Agent[] = []): Message[] => {
  const messageMap = new Map<string, Message>();
  const messagesWithoutId: Message[] = [];

  // Build agent lookup map for name resolution
  const agentMap = new Map<string, Agent>();
  agents.forEach(agent => agentMap.set(agent.id, agent));

  for (const msg of messages) {
    // Only deduplicate user messages with messageId
    const isUserMessage = msg.type === 'user' ||
      (msg.sender || '').toLowerCase() === 'human' ||
      (msg.sender || '').toLowerCase() === 'user';

    if (isUserMessage && msg.messageId) {
      const existing = messageMap.get(msg.messageId);
      if (existing) {
        // Don't merge - keep only the FIRST agent (intended recipient)
        // Duplicates in other agents' memory are just copies, not additional recipients
      } else {
        // First occurrence - initialize seenByAgents with this agent
        // If there's only one agent and no fromAgentId, assign to that agent
        // Otherwise leave empty and let duplicates build the array
        let initialSeenBy: string[];
        if (msg.fromAgentId) {
          initialSeenBy = [msg.fromAgentId];
        } else if (agents.length === 1) {
          initialSeenBy = [agents[0].id];
        } else {
          // Multi-agent with no fromAgentId - leave empty, duplicates will populate
          initialSeenBy = [];
        }

        messageMap.set(msg.messageId, {
          ...msg,
          seenByAgents: initialSeenBy
        });
      }
    } else {
      // Keep all agent messages and messages without messageId
      messagesWithoutId.push(msg);
    }
  }

  // Combine deduplicated user messages with all agent messages
  // Sort by createdAt with logical flow: replies before incoming messages when timestamps match
  return [...Array.from(messageMap.values()), ...messagesWithoutId]
    .sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();

      // Primary sort: by timestamp
      if (dateA !== dateB) {
        return dateA - dateB;
      }

      // Secondary sort: when timestamps are equal, assistant/agent (reply) comes before user/human (incoming)
      // This ensures logical flow: agent replies first, then that reply is saved to other agents' memories
      // Note: Backend uses role='assistant'/'user', frontend API maps to type='agent'/'user'
      const roleOrderA = (a.type === 'agent' || a.type === 'assistant') ? 0 : (a.type === 'user' || a.type === 'human') ? 1 : 2;
      const roleOrderB = (b.type === 'agent' || b.type === 'assistant') ? 0 : (b.type === 'user' || b.type === 'human') ? 1 : 2;
      return roleOrderA - roleOrderB;
    });
};

const showApprovalRequestDialog = (
  state: WorldComponentState,
  request: ApprovalRequest
): WorldComponentState => {
  if (state.approvalRequest && state.approvalRequest.toolCallId === request.toolCallId) {
    return state;
  }

  return {
    ...state,
    approvalRequest: request,
    activeAgent: null,
    needScroll: true
  };
};

const hideApprovalRequestDialog = (state: WorldComponentState): WorldComponentState => {
  if (!state.approvalRequest) {
    return state;
  }

  return {
    ...state,
    approvalRequest: null
  };
};

const submitApprovalDecision = async (
  state: WorldComponentState,
  payload: WorldEventPayload<'submit-approval-decision'>
): Promise<WorldComponentState> => {
  const { decision, scope, toolCallId } = payload;

  // Check if this is from the approval dialog (state.approvalRequest exists)
  let request = state.approvalRequest;

  // If not from dialog, find the message with matching toolCallId (inline approval)
  if (!request || request.toolCallId !== toolCallId) {
    const message = state.messages?.find(msg =>
      msg.toolCallData?.toolCallId === toolCallId
    );

    if (message?.toolCallData) {
      request = {
        toolCallId: message.toolCallData.toolCallId,
        originalToolCall: message.toolCallData.originalToolCall, // Preserve originalToolCall for correct tool_call_id
        toolName: message.toolCallData.toolName,
        toolArgs: message.toolCallData.toolArgs,
        message: message.toolCallData.approvalMessage || '',
        options: message.toolCallData.approvalOptions || [],
        agentId: message.toolCallData.agentId // Preserve agentId from toolCallData
      };
    } else {
      // No matching request found
      return state;
    }
  }

  const baseState: WorldComponentState = {
    ...state,
    approvalRequest: null,
    needScroll: true
  };

  // Use structured API for tool result submission with SSE streaming
  const approvalDecision: 'approve' | 'deny' = decision === 'approve' ? 'approve' : 'deny';
  const approvalScope: 'session' | 'once' | undefined =
    decision === 'approve' ? (scope === 'session' ? 'session' : 'once') : undefined;

  try {
    // Submit using structured API endpoint with streaming enabled
    const { originalToolCall } = request;
    // Always use approval request toolCallId - backend will extract originalToolCall.id itself
    console.log('[submitApprovalDecision] Debug:', {
      'request.toolCallId': request.toolCallId,
      'originalToolCall': originalToolCall,
      'originalToolCall.id': originalToolCall?.id
    });
    await submitToolResult(
      state.worldName,
      request.agentId,
      {
        tool_call_id: request.toolCallId,
        decision: approvalDecision,
        scope: approvalScope,
        toolName: originalToolCall?.name || request.toolName,
        toolArgs: originalToolCall?.args || request.toolArgs,
        workingDirectory: originalToolCall?.workingDirectory
      },
      true // Enable SSE streaming
    );

    return baseState;
  } catch (error) {
    return {
      ...baseState,
      error: (error as Error).message || 'Failed to submit approval decision'
    };
  }
};

const showHITLRequestDialog = (
  state: WorldComponentState,
  request: HITLRequest
): WorldComponentState => {
  if (state.hitlRequest && state.hitlRequest.toolCallId === request.toolCallId) {
    return state;
  }

  return {
    ...state,
    hitlRequest: request,
    activeAgent: null,
    needScroll: true
  };
};

const hideHITLRequestDialog = (state: WorldComponentState): WorldComponentState => {
  if (!state.hitlRequest) {
    return state;
  }

  return {
    ...state,
    hitlRequest: null
  };
};

const submitHITLDecision = async (
  state: WorldComponentState,
  payload: WorldEventPayload<'submit-hitl-decision'>
): Promise<WorldComponentState> => {
  const { choice, toolCallId } = payload;

  // Check if this is from the HITL dialog (state.hitlRequest exists)
  let request = state.hitlRequest;

  // If not from dialog, find the message with matching toolCallId (inline HITL)
  if (!request || request.toolCallId !== toolCallId) {
    const message = state.messages?.find(msg =>
      msg.hitlData?.toolCallId === toolCallId
    );

    if (message?.hitlData) {
      request = {
        toolCallId: message.hitlData.toolCallId,
        originalToolCall: message.hitlData.originalToolCall,
        prompt: message.hitlData.prompt,
        options: message.hitlData.options,
        context: message.hitlData.context,
        agentId: message.hitlData.agentId
      };
    } else {
      // No matching request found
      return state;
    }
  }

  const baseState: WorldComponentState = {
    ...state,
    hitlRequest: null,
    needScroll: true
  };

  try {
    // Submit HITL decision via tool result API
    await submitToolResult(
      state.worldName,
      request.agentId,
      {
        tool_call_id: request.toolCallId,
        choice: choice,
        toolName: request.originalToolCall?.name || 'client.humanIntervention',
        toolArgs: request.originalToolCall?.args
      },
      true // Enable SSE streaming
    );

    return baseState;
  } catch (error) {
    return {
      ...baseState,
      error: (error as Error).message || 'Failed to submit HITL decision'
    };
  }
};
const handleStreamError = (state: WorldComponentState, data: any): WorldComponentState => {
  return handleStreamErrorBase(state, data);
};

const handleToolStart = (state: WorldComponentState, data: any): WorldComponentState => {
  // Tool events are informational - don't control spinner
  // Spinner is controlled by world events (pending count)
  return handleToolStartBase(state, data);
};

const handleToolProgress = (state: WorldComponentState, data: any): WorldComponentState => {
  // Tool events are informational - don't control spinner
  // Spinner is controlled by world events (pending count)
  return handleToolProgressBase(state, data);
};

const handleToolResult = (state: WorldComponentState, data: any): WorldComponentState => {
  // Tool events are informational - don't control spinner
  // Spinner is controlled by world events (pending count)
  return handleToolResultBase(state, data);
};

const handleToolError = (state: WorldComponentState, data: any): WorldComponentState => {
  // Tool events are informational - don't control spinner
  // Spinner is controlled by world events (pending count)
  return handleToolErrorBase(state, data);
};

const handleWorldActivity = (state: WorldComponentState, activity: any): WorldComponentState | void => {
  // Check for valid event types
  if (!activity || (activity.type !== 'response-start' && activity.type !== 'response-end' && activity.type !== 'idle')) {
    console.log('[World] Invalid event type, no state change');
    return;
  }

  const activityId = typeof activity.activityId === 'number' ? activity.activityId : null;
  const pending = typeof activity.pendingOperations === 'number' ? activity.pendingOperations : 0;
  const source = typeof activity.source === 'string' ? activity.source : '';

  // Control spinner based on pending operations count (simple and reliable)
  // pending > 0: Show spinner
  // pending === 0: Hide spinner
  const shouldWait = pending > 0;

  // Log world activity events for debugging
  if (activity.type === 'response-start') {
    console.log(`[World] Processing started | pending: ${pending} | activityId: ${activityId} | source: ${source} | isWaiting: ${state.isWaiting} → ${shouldWait}`);
  } else if (activity.type === 'idle' && pending === 0) {
    console.log(`[World] All processing complete | pending: ${pending} | activityId: ${activityId} | source: ${source} | isWaiting: ${state.isWaiting} → ${shouldWait}`);
  } else if (activity.type === 'response-end') {
    console.log(`[World] Processing ended | pending: ${pending} | activityId: ${activityId} | source: ${source} | isWaiting: ${state.isWaiting} → ${shouldWait}`);
  }

  // Only update and return state if isWaiting needs to change
  if (state.isWaiting !== shouldWait) {
    return {
      ...state,
      isWaiting: shouldWait,
      needScroll: true  // Scroll when processing state changes (new content incoming)
    };
  }
  // No return = no re-render
};

// World initialization with core auto-restore
async function* initWorld(state: WorldComponentState, name: string, chatId?: string): AsyncGenerator<WorldComponentState> {
  if (!name) {
    location.href = '/';
    return;
  }
  try {
    const worldName = decodeURIComponent(name);

    // Default selectedSettingsTarget to 'world' on init (no persistence)
    state.selectedSettingsTarget = 'world';
    state.worldName = worldName;
    state.loading = true;

    const world = await api.getWorld(worldName);
    if (!world) {
      throw new Error('World not found: ' + worldName);
    }

    if (!chatId || !(chatId in world.chats)) {
      chatId = world.currentChatId || undefined;
    }

    if (world.currentChatId !== chatId && chatId) {
      await api.setChat(worldName, chatId);
    }

    let rawMessages: any[] = [];

    const agents: Agent[] = Array.from(world.agents.values());
    for (const agent of agents) {
      agent.spriteIndex = agents.indexOf(agent) % 9;
      agent.messageCount = 0;
      for (const memoryItem of agent.memory || []) {
        if (memoryItem.chatId === chatId) {
          agent.messageCount++;
          const message = createMessageFromMemory(memoryItem, agent.name);
          rawMessages.push(message);
        }
      }
    }

    // Apply deduplication to loaded messages (same as SSE streaming path)
    // Pass agents array so user messages get correct seenByAgents
    const messages = deduplicateMessages([...rawMessages], agents);

    yield {
      ...state,
      world,
      currentChat: world.chats.find(c => c.id === chatId) || null,
      messages,
      rawMessages,
      loading: false,
      needScroll: true,
      approvalRequest: null,
      lastUserMessageText: null,
    };

  } catch (error: any) {
    yield {
      ...state,
      error: error.message || 'Failed to load world data',
      loading: false,
      needScroll: false,
      approvalRequest: null,
      lastUserMessageText: state.lastUserMessageText ?? null,
    };
  }
}


// Event handlers for SSE and system events
const handleSystemEvent = async (state: WorldComponentState, data: any): Promise<WorldComponentState> => {
  // Create a log-style message for system events
  const systemMessage: Message = {
    id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'system',
    sender: 'SYSTEM',
    text: '',
    createdAt: new Date(),
    worldEvent: {
      type: 'system',
      category: 'system',
      message: typeof data === 'string' ? data : (data.content || data.message || 'System event'),
      timestamp: new Date().toISOString(),
      data: typeof data === 'object' ? data : undefined,
      messageId: `system-${Date.now()}`
    },
    isLogExpanded: false
  };

  const newState = {
    ...state,
    messages: [...(state.messages || []), systemMessage],
    needScroll: true
  };

  // Handle specific system events
  if (data.content === 'chat-title-updated' || data === 'chat-title-updated') {
    const updates = initWorld(newState, newState.worldName, data.chatId);
    for await (const update of updates) {
      return { ...newState, ...update };
    }
  }

  return newState;
};

const handleMessageEvent = <T extends WorldComponentState>(state: T, data: any): T => {

  const messageData = data || {};
  const senderName = messageData.sender;

  // Filter out internal protocol messages (tool results with __type marker)
  // These are internal protocol messages not meant for display
  if (messageData.content && typeof messageData.content === 'string') {
    try {
      const parsed = JSON.parse(messageData.content);
      if (parsed.__type === 'tool_result') {
        // This is an internal tool result message - don't display it
        return state;
      }
    } catch (e) {
      // Not JSON or parse error - continue normal processing
    }
  }

  // PHASE 1: Check for tool_calls and handle approval requests (OpenAI protocol)
  // This must happen before message display to show approval dialog immediately
  if (messageData.tool_calls) {
    handleMessageToolCalls(messageData);
  }

  // Find and update agent message count
  let fromAgentId: string | undefined;
  if (state.world?.agents) {
    const agent = state.world.agents.find((a: any) => a.name.toLowerCase() === senderName.toLowerCase());
    if (agent) {
      if (!agent.messageCount) {
        agent.messageCount = 0;
      }
      agent.messageCount++;
      fromAgentId = agent.id;
    }
  }

  // Check if this is a tool call approval request or response FIRST
  const toolCallRequest = detectToolCallRequest(messageData);
  const toolCallResponse = detectToolCallResponse(messageData);

  // Set message text - use placeholder for tool call messages with empty content
  let messageText = messageData.content || messageData.message || '';
  if (!messageText && (toolCallRequest || toolCallResponse)) {
    // Tool call message with empty content - use placeholder
    if (toolCallRequest) {
      messageText = `[Tool approval request: ${toolCallRequest.toolName}]`;
    } else if (toolCallResponse) {
      messageText = `[Tool execution result]`;
    }
  }

  // Determine message type based on role field
  let messageType: string;
  if (messageData.role === 'tool') {
    messageType = 'tool';
  } else if (messageData.role === 'user' || senderName === 'human' || senderName === 'user') {
    messageType = 'user';
  } else if (messageData.role === 'assistant') {
    messageType = 'agent';
  } else {
    messageType = messageData.type || 'message';
  }

  const newMessage = {
    id: messageData.id || `msg-${Date.now() + Math.random()}`,
    type: messageType,
    sender: senderName,
    text: messageText,
    createdAt: messageData.createdAt || new Date().toISOString(),
    fromAgentId,
    messageId: messageData.messageId,
    replyToMessageId: messageData.replyToMessageId,
    role: messageData.role, // Preserve role for filtering
    // Set tool call flags
    isToolCallRequest: !!toolCallRequest,
    isToolCallResponse: !!toolCallResponse,
    toolCallData: toolCallRequest || toolCallResponse
  };

  const existingMessages = state.messages || [];
  const normalizedSender = (senderName || '').toLowerCase();

  // Check if this is a user message that we need to deduplicate or update
  const isUserMessage = normalizedSender === 'human' || normalizedSender === 'user';
  if (isUserMessage && messageData.messageId) {
    // Check for existing message (either by messageId or temp message with matching text)
    // This prevents race conditions where multiple agents process the same temp message
    const existingMessageIndex = existingMessages.findIndex(
      msg => msg.messageId === messageData.messageId ||
        (msg.userEntered && msg.text === newMessage.text)
    );

    if (existingMessageIndex !== -1) {
      const existingMessage = existingMessages[existingMessageIndex];

      // Check if this message already has the messageId
      if (existingMessage.messageId === messageData.messageId) {
        // Message already has messageId - this is a duplicate from another agent
        // Don't merge - keep only the FIRST agent (intended recipient)
        // Duplicates in other agents' memory are just copies
        return state;
      }

      // Message is temp (userEntered=true) and needs messageId
      const updatedMessages = existingMessages.map((msg, index) => {
        if (index === existingMessageIndex) {
          return {
            ...msg,
            messageId: messageData.messageId,
            createdAt: messageData.createdAt || msg.createdAt,
            userEntered: false, // No longer temporary
            seenByAgents: fromAgentId ? [fromAgentId] : [] // Initialize with first agent or empty
          };
        }
        return msg;
      });

      return {
        ...state,
        messages: updatedMessages
      };
    }
  }

  // If a streaming placeholder exists for this sender, convert it to the final message
  const streamingIndex = existingMessages.findIndex(
    msg => msg?.isStreaming && (msg.sender || '').toLowerCase() === normalizedSender
  );

  if (streamingIndex !== -1) {
    const updatedMessages = existingMessages
      .map((msg, index) => {
        if (index !== streamingIndex) {
          return msg;
        }

        return {
          ...msg,
          ...newMessage,
          id: newMessage.id,
          isStreaming: false,
          messageId: newMessage.messageId ?? msg.messageId
        };
      })
      .filter(msg => !!msg && !msg.userEntered);

    return {
      ...state,
      messages: updatedMessages
    };
  }

  // Filter out temporary placeholders and user-entered messages before adding the new one
  state.messages = existingMessages.filter(msg =>
    !msg.userEntered &&
    !(msg.isStreaming && (msg.sender || '').toLowerCase() === normalizedSender)
  );
  state.messages.push(newMessage);

  return {
    ...state
  };
};

const handleError = <T extends WorldComponentState>(state: T, error: any): T => {
  const errorMessage = error.message || 'SSE error';

  const errorMsg = {
    id: Date.now() + Math.random(),
    type: 'error',
    sender: 'System',
    text: errorMessage,
    createdAt: new Date().toISOString(),
    worldName: state.worldName,
    hasError: true
  };

  return {
    ...state,
    error: errorMessage,
    messages: [...(state.messages || []), errorMsg],
    needScroll: true
  } as T;
};


/**
 * World Update Handlers - AppRun Native Typed Events
 * 
 * Converted from object to tuple array for compile-time type safety.
 * Uses Update<State, Events> pattern with discriminated unions.
 * 
 * TypeScript now validates:
 * - Event names (catches typos at compile time)
 * - Payload structures (ensures correct parameters)
 * - Handler return types (state consistency)
 */



export const worldUpdateHandlers: Update<WorldComponentState, WorldEventName> = {

  // ========================================
  // ROUTE & INITIALIZATION
  // ========================================

  'initWorld': initWorld,
  '/World': initWorld,

  // ========================================
  // USER INPUT & MESSAGING
  // ========================================

  'update-input': (state: WorldComponentState, payload: WorldEventPayload<'update-input'>): WorldComponentState =>
    InputDomain.updateInput(state, payload.target.value),

  'key-press': (state: WorldComponentState, payload: WorldEventPayload<'key-press'>) => {
    if (InputDomain.shouldSendOnEnter(payload.key, state.userInput)) {
      app.run('send-message');
    }
  },

  'send-message': async (state: WorldComponentState): Promise<WorldComponentState> => {
    const prepared = InputDomain.validateAndPrepareMessage(state.userInput, state.worldName);
    if (!prepared) return state;

    const sendingState = InputDomain.createSendingState(state, prepared.message);
    const newState: WorldComponentState = {
      ...sendingState,
      lastUserMessageText: prepared.text
    };

    try {
      // Send the message via SSE stream
      await sendChatMessage(state.worldName, prepared.text, {
        sender: 'HUMAN'
      });

      // Note: isWaiting is controlled by world events (pending count), not send/stream events
      return InputDomain.createSentState(newState);
    } catch (error: any) {
      return InputDomain.createSendErrorState(newState, error.message || 'Failed to send message');
    }
  },

  // ========================================
  // SSE STREAMING EVENTS
  // ========================================

  'handleStreamStart': handleStreamStart,
  'handleStreamChunk': handleStreamChunk,
  'handleStreamEnd': handleStreamEnd,
  'handleStreamError': handleStreamError,
  'handleLogEvent': handleLogEvent,
  'handleMessageEvent': handleMessageEvent,
  'handleSystemEvent': handleSystemEvent,
  'handleError': handleError,
  'handleToolError': handleToolError,
  'handleToolStart': handleToolStart,
  'handleToolProgress': handleToolProgress,
  'handleToolResult': handleToolResult,
  'handleToolStream': handleToolStream,
  'handleToolResultSubmitted': (state: WorldComponentState, data: any) => {
    // Tool result submitted confirmation - log for debugging
    console.log('Tool result submitted successfully:', data);
  },
  'handleWorldActivity': (state: WorldComponentState, activity: any): WorldComponentState | void => {
    return handleWorldActivity(state, activity);
  },
  // Note: handleMemoryOnlyMessage removed - memory-only events no longer sent via SSE

  'show-approval-request': showApprovalRequestDialog,
  'hide-approval-request': hideApprovalRequestDialog,
  'submit-approval-decision': submitApprovalDecision,

  'show-hitl-request': showHITLRequestDialog,
  'hide-hitl-request': hideHITLRequestDialog,
  'submit-hitl-decision': submitHITLDecision,

  // ========================================
  // MESSAGE DISPLAY
  // ========================================

  'toggle-log-details': (state: WorldComponentState, messageId: WorldEventPayload<'toggle-log-details'>): WorldComponentState =>
    MessageDisplayDomain.toggleLogDetails(state, messageId),

  // ========================================
  // MESSAGE EDITING
  // ========================================

  'start-edit-message': (state: WorldComponentState, payload: WorldEventPayload<'start-edit-message'>): WorldComponentState => ({
    ...EditingDomain.startEditMessage(state, payload.messageId, payload.text),
    needScroll: false  // Don't scroll when starting edit
  }),

  'cancel-edit-message': (state: WorldComponentState): WorldComponentState =>
    EditingDomain.cancelEditMessage(state),

  'update-edit-text': (state: WorldComponentState, payload: WorldEventPayload<'update-edit-text'>): WorldComponentState =>
    EditingDomain.updateEditText(state, payload.target.value),

  // ========================================
  // MESSAGE DELETION
  // ========================================

  'show-delete-message-confirm': (state: WorldComponentState, payload: WorldEventPayload<'show-delete-message-confirm'>): WorldComponentState =>
    DeletionDomain.showDeleteConfirmation(
      state,
      payload.messageId,
      payload.backendMessageId,
      payload.messageText,
      payload.userEntered
    ),

  'hide-delete-message-confirm': (state: WorldComponentState): WorldComponentState =>
    DeletionDomain.hideDeleteConfirmation(state),

  'delete-message-confirmed': async (state: WorldComponentState): Promise<WorldComponentState> => {
    if (!state.messageToDelete) return state;

    const { id, messageId, chatId } = state.messageToDelete;

    try {
      // Call DELETE to remove message and all subsequent messages
      const deleteResult = await api.deleteMessage(
        state.worldName,
        messageId,
        chatId
      );

      // Check DELETE result
      if (!deleteResult.success) {
        return {
          ...state,
          error: `Failed to delete message: ${deleteResult.failedAgents?.map((a: any) => a.error).join(', ') || 'Unknown error'}`,
          messageToDelete: null
        };
      }

      // Reload the world to get updated messages from backend
      const world = await api.getWorld(state.worldName);

      // Rebuild messages from agent memory (same logic as initWorld)
      let messages: any[] = [];
      // Handle agents as either array, Map-like (with values()), or plain object
      const agents: Agent[] = Array.isArray(world.agents)
        ? world.agents
        : world.agents && typeof (world.agents as any).values === 'function'
          ? Array.from((world.agents as any).values())
          : Object.values(world.agents || {}) as Agent[];

      for (const agent of agents) {
        agent.spriteIndex = agents.indexOf(agent) % 9;
        agent.messageCount = 0;
        for (const memoryItem of agent.memory || []) {
          if (memoryItem.chatId === chatId) {
            agent.messageCount++;
            const message = createMessageFromMemory(memoryItem, agent.name);
            messages.push(message);
          }
        }
      }

      // Apply deduplication to loaded messages
      messages = deduplicateMessages(messages, agents);

      return {
        ...state,
        world,
        messages,
        messageToDelete: null,
        needScroll: true
      };
    } catch (error: any) {
      return {
        ...state,
        error: error.message || 'Failed to delete message',
        messageToDelete: null
      };
    }
  },

  'save-edit-message': async (state: WorldComponentState, messageId: WorldEventPayload<'save-edit-message'>): Promise<WorldComponentState> => {
    const editedText = state.editingText?.trim();
    if (!editedText) return state;

    // Find the message by frontend ID
    const message = state.messages.find(msg => msg.id === messageId);
    if (!message) {
      return {
        ...state,
        error: 'Message not found',
        editingMessageId: null,
        editingText: ''
      };
    }

    // Check if message has backend messageId
    if (!message.messageId) {
      return {
        ...state,
        error: 'Cannot edit message: missing message ID. Message may not be saved yet.',
        editingMessageId: null,
        editingText: ''
      };
    }

    // Check if we have a current chat
    if (!state.currentChat?.id) {
      return {
        ...state,
        error: 'Cannot edit message: no active chat session',
        editingMessageId: null,
        editingText: ''
      };
    }

    // Check session mode before proceeding
    if (!state.world?.currentChatId) {
      return {
        ...state,
        error: 'Cannot edit message: session mode is OFF. Please enable session mode first.',
        editingMessageId: null,
        editingText: ''
      };
    }

    // Store edit backup in localStorage before DELETE
    const editBackup = {
      messageId: message.messageId,
      chatId: state.currentChat.id,
      newContent: editedText,
      timestamp: Date.now(),
      worldName: state.worldName
    };
    try {
      localStorage.setItem('agent-world-edit-backup', JSON.stringify(editBackup));
    } catch (e) {
      console.warn('Failed to save edit backup to localStorage:', e);
    }

    // Optimistically update UI: remove messages from edited message onwards
    const editedIndex = state.messages.findIndex(msg => msg.id === messageId);
    const updatedMessages = editedIndex >= 0 ? state.messages.slice(0, editedIndex) : state.messages;

    const optimisticState = {
      ...state,
      messages: updatedMessages,
      editingMessageId: null,
      editingText: '',
      isSending: true,
      needScroll: false, // Don't scroll when editing - user is likely viewing that area
      lastUserMessageText: editedText
    };

    try {
      // PHASE 1: Call DELETE to remove messages
      const deleteResult = await api.deleteMessage(
        state.worldName,
        message.messageId,
        state.currentChat.id
      );

      // Check DELETE result
      if (!deleteResult.success) {
        // Partial failure - some agents failed
        const failedAgentNames = deleteResult.failedAgents?.map((f: any) => f.agentId).join(', ');
        return {
          ...state,
          isSending: false,
          error: `Message removal partially failed for agents: ${failedAgentNames}. ${deleteResult.messagesRemovedTotal || 0} messages removed.`
        };
      }

      // PHASE 2: Call POST to resubmit edited message (reuses existing SSE streaming)
      try {
        await sendChatMessage(state.worldName, editedText, {
          sender: 'human'
        });

        // Clear localStorage backup on successful resubmission
        try {
          localStorage.removeItem('agent-world-edit-backup');
        } catch (e) {
          console.warn('Failed to clear edit backup:', e);
        }

        // Success - message will arrive via SSE
        return {
          ...optimisticState,
          isSending: false
        };
      } catch (resubmitError: any) {
        // POST failed after DELETE succeeded
        return {
          ...optimisticState,
          isSending: false,
          error: `Messages removed but resubmission failed: ${resubmitError.message || 'Unknown error'}. Please try editing again.`
        };
      }

    } catch (error: any) {
      // Handle DELETE errors
      let errorMessage = error.message || 'Failed to edit message';

      if (error.message?.includes('423')) {
        errorMessage = 'Cannot edit message: world is currently processing. Please try again in a moment.';
      } else if (error.message?.includes('404')) {
        errorMessage = 'Message not found in agent memories. It may have been already deleted.';
      } else if (error.message?.includes('400')) {
        errorMessage = 'Invalid message: only user messages can be edited.';
      }

      // Restore original messages on DELETE error
      return {
        ...state,
        isSending: false,
        editingMessageId: null,
        editingText: '',
        error: errorMessage
      };
    }
  },

  // ========================================
  // CHAT HISTORY & MODALS
  // ========================================

  'chat-history-show-delete-confirm': (state: WorldComponentState, chat: WorldEventPayload<'chat-history-show-delete-confirm'>): WorldComponentState =>
    ChatHistoryDomain.showChatDeletionConfirm(state, chat),

  'chat-history-hide-modals': (state: WorldComponentState): WorldComponentState =>
    ChatHistoryDomain.hideChatDeletionModals(state),

  // ========================================
  // AGENT MANAGEMENT
  // ========================================

  'delete-agent': async (state: WorldComponentState, payload: WorldEventPayload<'delete-agent'>): Promise<WorldComponentState> =>
    AgentManagementDomain.deleteAgent(state, payload.agent, state.worldName),

  // ========================================
  // WORLD MANAGEMENT
  // ========================================

  'export-world-markdown': async (state: WorldComponentState, payload: WorldEventPayload<'export-world-markdown'>): Promise<WorldComponentState> =>
    WorldExportDomain.exportWorldMarkdown(state, payload.worldName),

  'view-world-markdown': async (state: WorldComponentState, payload: WorldEventPayload<'view-world-markdown'>): Promise<WorldComponentState> =>
    WorldExportDomain.viewWorldMarkdown(state, payload.worldName),

  // ========================================
  // CHAT SESSION MANAGEMENT
  // ========================================

  'create-new-chat': async function* (state: WorldComponentState): AsyncGenerator<WorldComponentState> {
    try {
      yield ChatHistoryDomain.createChatLoadingState(state);

      const result = await api.newChat(state.worldName);
      if (!result.success) {
        yield ChatHistoryDomain.createChatErrorState(state, 'Failed to create new chat');
        return;
      }
      app.run('initWorld', state.worldName);
    } catch (error: any) {
      yield ChatHistoryDomain.createChatErrorState(state, error.message || 'Failed to create new chat');
    }
  },

  'load-chat-from-history': async function* (state: WorldComponentState, chatId: WorldEventPayload<'load-chat-from-history'>): AsyncGenerator<WorldComponentState> {
    try {
      yield ChatHistoryDomain.createChatLoadingState(state);

      const result = await api.setChat(state.worldName, chatId);
      if (!result.success) {
        yield state;
      }
      const path = ChatHistoryDomain.buildChatRoutePath(state.worldName, chatId);
      app.route(path);
      history.pushState(null, '', path);
    } catch (error: any) {
      yield ChatHistoryDomain.createChatErrorState(state, error.message || 'Failed to load chat from history');
    }
  },

  'delete-chat-from-history': async function* (state: WorldComponentState, payload: WorldEventPayload<'delete-chat-from-history'>): AsyncGenerator<WorldComponentState> {
    try {
      yield ChatHistoryDomain.createChatLoadingStateWithClearedModal(state);
      await api.deleteChat(state.worldName, payload.chatId);
      const path = ChatHistoryDomain.buildChatRoutePath(state.worldName);
      app.route(path);
      history.pushState(null, '', path);
    } catch (error: any) {
      yield ChatHistoryDomain.createChatErrorState(state, error.message || 'Failed to delete chat', true);
    }
  },

  // ========================================
  // MEMORY MANAGEMENT
  // ========================================

  'clear-agent-messages': async (state: WorldComponentState, payload: WorldEventPayload<'clear-agent-messages'>): Promise<WorldComponentState> =>
    AgentManagementDomain.clearAgentMessages(state, payload.agent, state.worldName),

  'clear-world-messages': async (state: WorldComponentState): Promise<WorldComponentState> =>
    AgentManagementDomain.clearWorldMessages(state, state.worldName),
};


