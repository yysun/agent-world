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
  handleStreamStart,
  handleStreamChunk,
  handleStreamEnd,
  handleStreamError as handleStreamErrorBase,
  handleLogEvent,
  handleToolError as handleToolErrorBase,
  handleToolStart as handleToolStartBase,
  handleToolProgress as handleToolProgressBase,
  handleToolResult as handleToolResultBase,
  handleMessageToolCalls,
} from '../utils/sse-client';
import type { WorldComponentState, Agent, AgentMessage, Message, AgentActivityStatus, ApprovalRequest } from '../types';
import type { WorldEventName, WorldEventPayload } from '../types/events';
import toKebabCase from '../utils/toKebabCase';

// Utility functions for message processing
const createMessageFromSSE = (messageData: any): Message => {
  const senderName = messageData.sender;

  // Find and update agent message count
  let fromAgentId: string | undefined;

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

  const newMessage = {
    id: messageData.id || `msg-${Date.now() + Math.random()}`,
    type: messageData.type || 'message',
    sender: senderName,
    text: messageText,
    createdAt: messageData.createdAt || new Date().toISOString(),
    fromAgentId,
    messageId: messageData.messageId,
    replyToMessageId: messageData.replyToMessageId,
    // Set tool call flags
    isToolCallRequest: !!toolCallRequest,
    isToolCallResponse: !!toolCallResponse,
    toolCallData: toolCallRequest || toolCallResponse
  };

  return newMessage;
};

const createMessageFromMemory = (memoryItem: AgentMessage, agentName: string): Message => {
  const sender = toKebabCase(memoryItem.sender || agentName);

  // Determine message type based on role field from backend
  // role='user' → incoming message (type='user') - saved to agent memory
  // role='assistant' → agent reply (type='agent') - agent's own response
  // sender='human'/'user' → human message (type='user')
  let messageType: string;
  if (sender === 'human' || sender === 'user') {
    messageType = 'user';
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
    // Set tool call flags
    isToolCallRequest: !!toolCallRequest,
    isToolCallResponse: !!toolCallResponse,
    toolCallData: toolCallRequest || toolCallResponse
  };
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

      return {
        toolCallId: toolCall.id || `approval-${Date.now()}`,
        toolName: parsedArgs?.originalToolCall?.name ?? 'Unknown tool',
        toolArgs: parsedArgs?.originalToolCall?.args ?? {},
        approvalMessage: parsedArgs?.message ?? 'This tool requires your approval to continue.',
        approvalOptions: Array.isArray(parsedArgs?.options) && parsedArgs.options.length > 0
          ? parsedArgs.options
          : ['deny', 'approve_once', 'approve_session'],
        agentId: messageData?.sender || messageData?.agentId // Capture agent that made the request
      };
    }
  }

  return null;
};

/**
 * Detect if message is a tool result (approval response)
 * @param messageData - Message data from SSE event
 * @returns Tool call data if this is a tool response, null otherwise
 */
const detectToolCallResponse = (messageData: any): Message['toolCallData'] | null => {
  // Check if this is a tool result message
  if (messageData.role === 'tool' || messageData.type === 'tool') {
    // Try to extract tool call info from the message
    const toolCallId = messageData.tool_call_id || 'unknown';

    // Parse content to determine approval decision
    const content = messageData.content || messageData.message || '';
    let approvalDecision: 'approve' | 'deny' = 'deny';
    let approvalScope: 'once' | 'session' | 'none' = 'none';

    // Look for approval indicators in content
    if (content.toLowerCase().includes('approved') || content.toLowerCase().includes('success')) {
      approvalDecision = 'approve';
      if (content.toLowerCase().includes('session') || content.toLowerCase().includes('always')) {
        approvalScope = 'session';
      } else if (content.toLowerCase().includes('once')) {
        approvalScope = 'once';
      }
    }

    return {
      toolCallId,
      toolName: 'Tool Execution', // Generic name for responses
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

type AgentActivityMap = Record<string, AgentActivityStatus>;

function cloneAgentActivities(map: AgentActivityMap | undefined): AgentActivityMap {
  return map ? { ...map } : {};
}

function normalizeAgentId(agentId?: string | null): string {
  if (!agentId) {
    return 'agent';
  }
  return toKebabCase(agentId);
}

function setAgentActivity(
  state: WorldComponentState,
  agentIdRaw: string | null | undefined,
  options: {
    message: string;
    phase: AgentActivityStatus['phase'];
    activityId?: number | null;
    toolName?: string;
  }
): WorldComponentState {
  const agentId = normalizeAgentId(agentIdRaw);
  const currentActivities = state.agentActivities ?? {};
  const previous = currentActivities[agentId];
  const activityId = options.activityId ?? previous?.activityId ?? null;
  const toolName = options.toolName ?? previous?.toolName;

  const nextEntry: AgentActivityStatus = {
    agentId,
    message: options.message,
    phase: options.phase,
    activityId,
    toolName,
    updatedAt: Date.now()
  };

  if (
    previous &&
    previous.message === nextEntry.message &&
    previous.phase === nextEntry.phase &&
    previous.activityId === nextEntry.activityId &&
    previous.toolName === nextEntry.toolName
  ) {
    if (!state.isWaiting) {
      return { ...state, isWaiting: true };
    }
    return state;
  }

  const nextActivities: AgentActivityMap = {
    ...currentActivities,
    [agentId]: nextEntry
  };

  return {
    ...state,
    agentActivities: nextActivities,
    isWaiting: true
  };
}

function clearAgentActivity(
  state: WorldComponentState,
  agentIdRaw: string | null | undefined,
  pendingOperations?: number
): WorldComponentState {
  const agentId = normalizeAgentId(agentIdRaw);
  const currentActivities = state.agentActivities ?? {};

  if (!currentActivities[agentId]) {
    const pending = pendingOperations ?? 0;
    if (pending === 0 && state.isWaiting && Object.keys(currentActivities).length === 0) {
      return { ...state, isWaiting: false };
    }
    return state;
  }

  const nextActivities = cloneAgentActivities(currentActivities);
  delete nextActivities[agentId];

  const hasRemaining = Object.keys(nextActivities).length > 0;
  const pending = pendingOperations ?? 0;
  const shouldWait = hasRemaining || pending > 0;

  return {
    ...state,
    agentActivities: nextActivities,
    isWaiting: shouldWait
  };
}

function clearAllAgentActivities(state: WorldComponentState, pendingOperations: number = 0): WorldComponentState {
  if (!state.agentActivities || Object.keys(state.agentActivities).length === 0) {
    if (pendingOperations === 0 && state.isWaiting) {
      return { ...state, isWaiting: false };
    }
    return state;
  }

  const shouldWait = pendingOperations > 0;
  return {
    ...state,
    agentActivities: {},
    isWaiting: shouldWait ? state.isWaiting : false
  };
}

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
    isWaiting: false,
    activeAgent: null,
    needScroll: true
  };
};

// Update hideApprovalRequestDialog - track dismissal
const hideApprovalRequestDialog = (state: WorldComponentState) => {
  if (!state.approvalRequest) return state;

  // Add to dismissed set
  const dismissed = new Set(state.dismissedApprovals);
  dismissed.add(state.approvalRequest.toolCallId);

  return {
    ...state,
    approvalRequest: null,
    dismissedApprovals: dismissed
  };
};

// Update submitApprovalDecision - clear from dismissed, include full approval data
const submitApprovalDecision = async (state: WorldComponentState, payload: any) => {
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
        toolName: message.toolCallData.toolName,
        toolArgs: message.toolCallData.toolArgs,
        message: message.toolCallData.approvalMessage || '',
        options: message.toolCallData.approvalOptions || [],
        agentId: message.toolCallData.agentId, // Preserve agentId from toolCallData
        workingDirectory: message.toolCallData.workingDirectory
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

  // Create approval decision for enhanced string protocol
  let approvalDecision: 'approve' | 'deny';
  let approvalScope: 'session' | 'once' | undefined;

  if (decision === 'approve') {
    approvalDecision = 'approve';
    approvalScope = scope === 'session' ? 'session' : 'once';
  } else {
    approvalDecision = 'deny';
    approvalScope = undefined;
  }

  // Create approval response with full matching data
  const enhancedMessage = JSON.stringify({
    __type: 'tool_result',
    tool_call_id: request.toolCallId,
    agentId: request.agentId,
    content: JSON.stringify({
      decision: approvalDecision,
      scope: approvalScope,
      toolName: request.toolName,
      toolArgs: request.toolArgs,         // For session approval matching
      workingDirectory: request.workingDirectory // For session approval matching
    })
  });

  const messageContent = enhancedMessage;

  try {
    // Send using enhanced string protocol
    await sendChatMessage(state.worldName, messageContent, {
      sender: 'HUMAN'
    });

    // Remove from dismissed set (user made decision)
    const dismissed = new Set(state.dismissedApprovals);
    dismissed.delete(payload.toolCallId);

    return {
      ...baseState,
      dismissedApprovals: dismissed,
      isWaiting: decision === 'approve' // Only wait for streaming response if approved
    };
  } catch (error) {
    // Remove from dismissed set (user made decision)
    const dismissed = new Set(state.dismissedApprovals);
    dismissed.delete(payload.toolCallId);

    return {
      ...baseState,
      dismissedApprovals: dismissed,
      isWaiting: false,
      error: (error as Error).message || 'Failed to submit approval decision'
    };
  }
};

function formatThinkingMessage(agentIdRaw: string | null | undefined): string {
  return `${normalizeAgentId(agentIdRaw)} thinking ...`;
}

function formatToolMessage(
  agentIdRaw: string | null | undefined,
  action: string,
  toolName?: string,
  suffix?: string
): string {
  const agentId = normalizeAgentId(agentIdRaw);
  const segments = [`${agentId} ${action}`];
  if (toolName) {
    segments.push(`- ${toolName}`);
  }
  if (suffix) {
    segments.push(suffix);
  }
  return segments.join(' ').replace(/\s+/g, ' ').trim();
}

function extractToolName(eventData: any): string | undefined {
  return eventData?.toolExecution?.toolName ?? eventData?.toolExecution?.name ?? undefined;
}

function extractToolAgentId(eventData: any): string | undefined {
  return eventData?.sender ?? eventData?.agentName ?? eventData?.toolExecution?.agentId ?? undefined;
}

const handleStreamError = (state: WorldComponentState, data: any): WorldComponentState => {
  return clearAllAgentActivities(handleStreamErrorBase(state, data));
};

const handleToolStart = (state: WorldComponentState, data: any): WorldComponentState => {
  const nextState = handleToolStartBase(state, data);
  const agentId = extractToolAgentId(data);
  const toolName = extractToolName(data);
  const message = formatToolMessage(agentId, 'calling tool', toolName, '...');
  return setAgentActivity(nextState, agentId, {
    message,
    phase: 'tool-start',
    toolName
  });
};

const handleToolProgress = (state: WorldComponentState, data: any): WorldComponentState => {
  const nextState = handleToolProgressBase(state, data);
  const agentId = extractToolAgentId(data);
  const toolName = extractToolName(data);
  const message = formatToolMessage(agentId, 'continuing tool', toolName, '...');
  return setAgentActivity(nextState, agentId, {
    message,
    phase: 'tool-progress',
    toolName
  });
};

const handleToolResult = (state: WorldComponentState, data: any): WorldComponentState => {
  const nextState = handleToolResultBase(state, data);
  const agentId = extractToolAgentId(data);
  const toolName = extractToolName(data);

  const duration = data?.toolExecution?.duration;
  const resultSize = data?.toolExecution?.resultSize;
  const parts: string[] = [];
  if (typeof duration === 'number' && Number.isFinite(duration)) {
    parts.push(`${Math.round(duration)}ms`);
  }
  if (typeof resultSize === 'number' && Number.isFinite(resultSize) && resultSize > 0) {
    parts.push(`${resultSize} chars`);
  }
  const suffix = parts.length > 0 ? `(${parts.join(', ')})` : undefined;

  const message = formatToolMessage(agentId, 'tool finished', toolName, suffix);
  return setAgentActivity(nextState, agentId, {
    message,
    phase: 'tool-result',
    toolName
  });
};

const handleToolError = (state: WorldComponentState, data: any): WorldComponentState => {
  const nextState = handleToolErrorBase(state, data);
  const agentId = extractToolAgentId(data);
  const toolName = extractToolName(data) ?? 'tool';
  const toolError = data?.toolExecution?.error ?? 'failed';
  const message = `${normalizeAgentId(agentId)} tool failed - ${toolName}: ${toolError}`;
  return setAgentActivity(nextState, agentId, {
    message,
    phase: 'tool-error',
    toolName
  });
};

const handleWorldActivity = (state: WorldComponentState, activity: any): WorldComponentState => {
  // Check for valid event types
  if (!activity || (activity.type !== 'response-start' && activity.type !== 'response-end' && activity.type !== 'idle')) {
    return state;
  }

  const activityId = typeof activity.activityId === 'number' ? activity.activityId : null;
  const pending = typeof activity.pendingOperations === 'number' ? activity.pendingOperations : 0;
  const source = typeof activity.source === 'string' ? activity.source : '';

  // Create log-style message for significant world activity events
  let shouldCreateMessage = false;
  let activityMessage = '';
  let category = 'world';
  let logLevel: 'info' | 'debug' = 'debug';

  if (activity.type === 'response-start') {
    if (source.startsWith('agent:')) {
      const agentId = source.slice('agent:'.length);
      const agent = state.world?.agents.find(a => a.id === agentId);
      activityMessage = `${agent?.name || agentId} started processing`;
      category = 'activity';
      logLevel = 'info';
      shouldCreateMessage = true;
    } else if (source) {
      activityMessage = `${source} started`;
      category = 'activity';
      logLevel = 'info';
      shouldCreateMessage = true;
    }
  } else if (activity.type === 'idle' && pending === 0) {
    activityMessage = 'All processing complete';
    category = 'activity';
    logLevel = 'info';
    shouldCreateMessage = true;
  } else if (activity.type === 'response-end' && pending > 0) {
    // Show ongoing activity when one source finishes but others are still active
    if (activity.activeSources && activity.activeSources.length > 0) {
      const activeList = activity.activeSources
        .map((s: string) => s.startsWith('agent:') ? s.slice('agent:'.length) : s)
        .join(', ');
      activityMessage = `Active: ${activeList} (${pending} pending)`;
      category = 'activity';
      logLevel = 'debug';
      shouldCreateMessage = true;
    }
  }

  let newState = state;
  if (shouldCreateMessage) {
    // Log world activity event once when received (not on every render)
    // Format: [World] message | pending: N | activityId: N | source: agent:id
    const sourceName = source.startsWith('agent:') ? source.slice('agent:'.length) : source;
    console.log(`[World] ${activityMessage} | pending: ${pending} | activityId: ${activityId} | source: ${sourceName}`);

    // Note: We used to add world events to messages array, but this caused duplicate logs
    // on every component re-render. Now we just log once here and don't add to messages.
    // The UI doesn't display world events anyway (they return null in the view).
    newState = state;
  }

  // Update agent activity status
  if (source.startsWith('agent:')) {
    const agentId = source.slice('agent:'.length);
    if (activity.type === 'response-start') {
      return setAgentActivity(newState, agentId, {
        message: formatThinkingMessage(agentId),
        phase: 'thinking',
        activityId
      });
    }

    if (activity.type === 'idle') {
      return clearAgentActivity(newState, agentId, pending);
    }
  } else {
    if (activity.type === 'response-start') {
      return newState.isWaiting ? newState : { ...newState, isWaiting: true };
    }

    if (activity.type === 'idle' && pending === 0) {
      return clearAllAgentActivities(newState, pending);
    }
  }

  return newState;
};

import { findPendingApproval } from '../domain/approval-detection.js';

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

    // NEW: Always check for pending approvals in memory
    const pendingApproval = findPendingApproval(messages, state.dismissedApprovals);

    yield {
      ...state,
      world,
      currentChat: world.chats.find(c => c.id === chatId) || null,
      messages,
      rawMessages,
      loading: false,
      needScroll: true,
      agentActivities: {},
      isWaiting: false,
      approvalRequest: pendingApproval, // Set from memory, not event
      dismissedApprovals: new Set(), // Reset dismissed on chat load
      lastUserMessageText: null,
    };

  } catch (error: any) {
    yield {
      ...state,
      error: error.message || 'Failed to load world data',
      loading: false,
      needScroll: false,
      agentActivities: {},
      isWaiting: false,
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

const handleMessageEvent = async <T extends WorldComponentState>(state: T, data: any): Promise<T> => {
  // ... existing message parsing and deduplication logic ...

  const newMessage = createMessageFromSSE(data);
  const newMessages = [...state.messages, newMessage];

  // Incremental approval detection - only scan when relevant message arrives
  let pendingApproval = state.approvalRequest;

  const isApprovalRequest = newMessage.isToolCallRequest && newMessage.toolCallData;
  const isApprovalResponse = newMessage.role === 'tool' && newMessage.tool_call_id;

  if (isApprovalRequest || isApprovalResponse) {
    // Re-scan only when approval state might have changed
    pendingApproval = findPendingApproval(newMessages, state.dismissedApprovals);
  }

  return {
    ...state,
    messages: newMessages,
    approvalRequest: pendingApproval, // Update from memory, not event flag
    needScroll: true
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

  const clearedState = clearAllAgentActivities(state);

  return {
    ...clearedState,
    error: errorMessage,
    messages: [...(clearedState.messages || []), errorMsg],
    needScroll: true,
    isWaiting: false
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
      agentActivities: {},
      lastUserMessageText: prepared.text
    };

    try {
      // Send the message via SSE stream
      await sendChatMessage(state.worldName, prepared.text, {
        sender: 'HUMAN'
      });

      // Note: isWaiting will be set to false by handleStreamEnd when the stream completes or by handleStreamError/handleError on errors
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
  'handleWorldActivity': (state: WorldComponentState, activity: any): WorldComponentState => {
    return handleWorldActivity(state, activity);
  },
  // Note: handleMemoryOnlyMessage removed - memory-only events no longer sent via SSE

  'show-approval-request': showApprovalRequestDialog,
  'hide-approval-request': hideApprovalRequestDialog,
  'submit-approval-decision': submitApprovalDecision,

  'show-next-approval': (state) => {
    // Re-scan with empty dismissed set to get first pending
    const pendingApproval = findPendingApproval(state.messages, new Set());

    return {
      ...state,
      approvalRequest: pendingApproval
      // Don't clear dismissedApprovals - just override display
    };
  },

  // ========================================
  // MESSAGE DISPLAY
  // ========================================

  'toggle-log-details': (state: WorldComponentState, messageId: WorldEventPayload<'toggle-log-details'>): WorldComponentState =>
    MessageDisplayDomain.toggleLogDetails(state, messageId),

  'ack-scroll': (state: WorldComponentState): WorldComponentState =>
    MessageDisplayDomain.acknowledgeScroll(state),

  // ========================================
  // MESSAGE EDITING
  // ========================================

  'start-edit-message': (state: WorldComponentState, payload: WorldEventPayload<'start-edit-message'>): WorldComponentState =>
    EditingDomain.startEditMessage(state, payload.messageId, payload.text),

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
      isWaiting: true,
      needScroll: true,
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
          isWaiting: false,
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

        // Success - message will arrive via SSE, keep waiting for responses
        return {
          ...optimisticState,
          isSending: false
          // Keep isWaiting: true until SSE events complete
        };
      } catch (resubmitError: any) {
        // POST failed after DELETE succeeded
        return {
          ...optimisticState,
          isSending: false,
          isWaiting: false,
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
        isWaiting: false,
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
