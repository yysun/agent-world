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
 * - Message editing with core-managed backend integration (single edit request)
 * - Memory-only message streaming for agent→agent messages saved without response
 *
 * Message Edit Feature (Core-Driven):
 * - Uses backend messageId (server-generated) for message identification
 * - Single-phase edit: PUT /worlds/:worldName/messages/:messageId with chatId + newContent
 * - Core handles removal + resubmission + title-regeneration reset consistently across clients
 * - LocalStorage backup retained for recovery in case backend edit flow fails
 * - Optimistic UI updates with error rollback
 * - Handles removal failures and resubmission-status failures from core result payload
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
 * Changes:
 * - 2026-02-19: Added web chat branch handler and chat-history search state updates for MVP parity.
 * - 2026-02-19: Moved chat-title refresh handling from `system` events to chat `crud` update events.
 * - 2026-02-19: Added CRUD SSE refresh handler so new/updated/deleted agents appear without manual page reload.
 * - 2026-02-16: Added no-op edit guard to skip save when message content is unchanged.
 * - 2026-02-15: Updated init chat selection to prioritize current selected chat ID, with backend currentChatId as fallback.
 * - 2026-02-14: Added generic HITL option prompt queue handling and response submission event for web approval flows.
 * - 2026-02-14: Added `stop-message-processing` event handler for chat-scoped processing cancellation from web composer.
 * - 2026-02-13: Switched web edit flow to core-managed `api.editMessage` and updated system-event handling for structured `chat-title-updated` payloads
 * - 2026-02-08: Removed legacy manual tool-intervention request detection and response submission flow
 * - 2025-11-11: Fixed createMessageFromMemory to pass through tool_calls and tool_call_id for frontend formatting
 * - 2025-11-11: Simplified spinner control to use pending operations count from world events (pending > 0 = show, pending === 0 = hide)
 * - 2025-11-11: Enhanced handleWorldActivity to support agent IDs without "agent:" prefix (e.g., "g1" instead of "agent:g1")
 * - 2025-11-10: Fixed tool result message display - filter out internal protocol messages with __type: tool_result
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
import * as HitlDomain from '../domain/hitl';
import { resolveActiveChatId } from '../domain/chat-selection';
import {
  sendChatMessage,
  editChatMessage,
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
} from '../utils/sse-client';
import type { WorldComponentState, Agent, AgentMessage, Message } from '../types';
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

  const memoryData = memoryItem as any;

  return {
    id: `msg-${Date.now() + Math.random()}`,
    sender: displaySender,
    text: memoryItem.content || '',
    messageId: memoryItem.messageId,
    chatId: memoryItem.chatId,
    replyToMessageId: memoryItem.replyToMessageId, // Preserve parent message reference
    createdAt: memoryItem.createdAt || new Date(),
    type: messageType,
    fromAgentId: displayFromAgentId,
    ownerAgentId: toKebabCase(agentName), // Track which agent's memory this came from
    role: memoryItem.role, // Preserve role for sorting
    // Pass through tool_calls and tool_call_id for frontend formatting
    tool_calls: memoryData.tool_calls || memoryData.toolCalls,
    tool_call_id: memoryData.tool_call_id || memoryData.toolCallId,
  } as Message;
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

// ========================================
// PHASE 2: STREAMING STATE HELPERS (RAF Debouncing)
// ========================================

/**
 * Schedule RAF flush for debounced stream updates (60fps)
 * Returns new state with updated debounceFrameId
 */
const scheduleStreamFlush = (state: WorldComponentState): WorldComponentState => {
  if (state.debounceFrameId !== null) {
    return state; // Already scheduled
  }

  const frameId = requestAnimationFrame(() => {
    app.run('flush-stream-updates');
  });

  return { ...state, debounceFrameId: frameId };
};

/**
 * Start elapsed timer for activity tracking
 * Returns new state with timer started
 */
const startElapsedTimer = (state: WorldComponentState): WorldComponentState => {
  if (state.elapsedIntervalId !== null) {
    return state; // Already running
  }

  const startTime = Date.now();
  const intervalId = window.setInterval(() => {
    app.run('update-elapsed-time');
  }, 1000); // Update every second

  return {
    ...state,
    activityStartTime: startTime,
    elapsedIntervalId: intervalId,
    elapsedMs: 0
  };
};

/**
 * Stop elapsed timer
 * Returns new state with timer stopped
 */
const stopElapsedTimer = (state: WorldComponentState): WorldComponentState => {
  if (state.elapsedIntervalId !== null) {
    clearInterval(state.elapsedIntervalId);
  }

  return {
    ...state,
    elapsedIntervalId: null,
    activityStartTime: null,
    elapsedMs: 0
  };
};

/**
 * Check if any activity is in progress (tools or streams)
 */
const hasActivity = (state: WorldComponentState): boolean => {
  return state.activeTools.length > 0 || state.pendingStreamUpdates.size > 0;
};

// ========================================
// STREAM & TOOL HANDLERS (with debouncing)
// ========================================

const handleStreamError = (state: WorldComponentState, data: any): WorldComponentState => {
  return handleStreamErrorBase(state, data);
};

/**
 * Handle tool start - track in activeTools and start elapsed timer (Phase 2)
 */
const handleToolStart = (state: WorldComponentState, data: any): WorldComponentState => {
  // Call base handler for message updates
  let newState = handleToolStartBase(state, data);

  // Add to activeTools array (Phase 2)
  const toolEntry: import('../types').ToolEntry = {
    toolUseId: data.messageId || `tool-${Date.now()}`,
    toolName: data.toolExecution?.toolName || 'unknown',
    toolInput: data.toolExecution?.input,
    status: 'running',
    result: null,
    errorMessage: null,
    progress: null,
    startedAt: new Date().toISOString(),
    completedAt: null
  };

  newState = {
    ...newState,
    activeTools: [...newState.activeTools, toolEntry],
    isBusy: true
  };

  // Start elapsed timer if not already running
  if (newState.elapsedIntervalId === null) {
    newState = startElapsedTimer(newState);
  }

  return newState;
};

const handleToolProgress = (state: WorldComponentState, data: any): WorldComponentState => {
  // Tool events are informational - don't control spinner
  // Spinner is controlled by world events (pending count)
  return handleToolProgressBase(state, data);
};

/**
 * Handle tool result - remove from activeTools and stop timer if idle (Phase 2)
 */
const handleToolResult = (state: WorldComponentState, data: any): WorldComponentState => {
  // Call base handler for message updates
  let newState = handleToolResultBase(state, data);

  // Remove from activeTools array (Phase 2)
  const toolUseId = data.messageId;
  newState = {
    ...newState,
    activeTools: newState.activeTools.filter(tool => tool.toolUseId !== toolUseId)
  };

  // Update busy state (safe check with optional chaining)
  const stillBusy = hasActivity(newState);
  newState = { ...newState, isBusy: stillBusy };

  // Stop elapsed timer if no more activity
  if (!stillBusy && newState.elapsedIntervalId !== null) {
    newState = stopElapsedTimer(newState);
  }

  return newState;
};

const handleToolError = (state: WorldComponentState, data: any): WorldComponentState => {
  // Tool events are informational - don't control spinner
  // Spinner is controlled by world events (pending count)
  return handleToolErrorBase(state, data);
};

/**
 * Handle stream chunk - add to pending updates and schedule RAF flush (Phase 2)
 */
const handleStreamChunkDebounced = (state: WorldComponentState, data: any): WorldComponentState => {
  const { messageId, content } = data;

  // Add to pending updates map
  const pending = new Map(state.pendingStreamUpdates);
  pending.set(messageId, content || '');

  let newState = {
    ...state,
    pendingStreamUpdates: pending
  };

  // Schedule RAF flush if not already scheduled
  newState = scheduleStreamFlush(newState);

  // Also call base handler to ensure message exists in array
  newState = handleStreamChunk(newState, data);

  return newState;
};

const handleToolStream = (state: WorldComponentState, data: any): WorldComponentState => {
  // Tool stream events for real-time shell command output
  // Spinner is controlled by world events (pending count)
  return handleToolStreamBase(state, data);
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

const handleCrudEvent = async (state: WorldComponentState, eventData: any): Promise<WorldComponentState> => {
  if (!eventData) {
    return state;
  }

  const entityType = String(eventData.entityType || '').trim();
  if (entityType !== 'agent' && entityType !== 'chat') {
    return state;
  }

  if (!state.worldName) {
    return state;
  }

  try {
    const refreshedWorld = await api.getWorld(state.worldName);
    const activeChatId = state.currentChat?.id || state.world?.currentChatId || undefined;
    const resolvedChatId = resolveActiveChatId(refreshedWorld as any, activeChatId) || undefined;
    const chats = Array.isArray(refreshedWorld.chats) ? refreshedWorld.chats : [];
    const agents = Array.isArray(refreshedWorld.agents) ? refreshedWorld.agents : [];
    const currentChat = chats.find((chat: any) => chat.id === resolvedChatId) || null;
    const selectedAgentId = state.selectedAgent?.id || null;
    const selectedAgent = selectedAgentId
      ? agents.find((agent: any) => agent.id === selectedAgentId) || null
      : null;

    return {
      ...state,
      world: refreshedWorld,
      currentChat,
      selectedAgent,
      error: null
    };
  } catch (error: any) {
    return {
      ...state,
      error: error?.message || 'Failed to refresh world after agent update.'
    };
  }
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

    chatId = resolveActiveChatId(world, chatId) || undefined;

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
      lastUserMessageText: null,
    };

  } catch (error: any) {
    yield {
      ...state,
      error: error.message || 'Failed to load world data',
      loading: false,
      needScroll: false,
      lastUserMessageText: state.lastUserMessageText ?? null,
    };
  }
}


// Event handlers for SSE and system events
const handleSystemEvent = async (state: WorldComponentState, data: any): Promise<WorldComponentState> => {
  const envelope = (data && typeof data === 'object') ? (data as Record<string, any>) : null;
  const contentPayload = envelope && 'content' in envelope ? envelope.content : data;
  const structuredPayload =
    contentPayload && typeof contentPayload === 'object' ? contentPayload : null;
  const eventType =
    (structuredPayload && typeof structuredPayload.eventType === 'string' && structuredPayload.eventType) ||
    (typeof contentPayload === 'string' ? contentPayload : null) ||
    (typeof data === 'string' ? data : null);

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
      message:
        (typeof contentPayload === 'string' && contentPayload) ||
        (typeof eventType === 'string' && eventType) ||
        (envelope && typeof envelope.message === 'string' ? envelope.message : '') ||
        'System event',
      timestamp: new Date().toISOString(),
      data: envelope || undefined,
      messageId: `system-${Date.now()}`
    },
    isLogExpanded: false
  };

  const newState = {
    ...state,
    messages: [...(state.messages || []), systemMessage],
    needScroll: true
  };

  const hitlPrompt = HitlDomain.parseHitlPromptRequest(data);
  if (hitlPrompt) {
    return {
      ...newState,
      hitlPromptQueue: HitlDomain.enqueueHitlPrompt(newState.hitlPromptQueue || [], hitlPrompt)
    };
  }

  return newState;
};

const handleMessageEvent = <T extends WorldComponentState>(state: T, data: any): T => {

  const messageData = data || {};
  const activeChatId = state.currentChat?.id || state.world?.currentChatId || null;
  const incomingChatId = messageData.chatId ?? null;

  if (activeChatId && (!incomingChatId || incomingChatId !== activeChatId)) {
    return state;
  }

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

  const messageText = messageData.content || messageData.message || '';

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
    chatId: messageData.chatId,
    replyToMessageId: messageData.replyToMessageId,
    role: messageData.role, // Preserve role for filtering
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
            chatId: messageData.chatId ?? msg.chatId,
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
        sender: 'HUMAN',
        chatId: state.currentChat?.id || state.world?.currentChatId || undefined
      });

      // Note: isWaiting is controlled by world events (pending count), not send/stream events
      return InputDomain.createSentState(newState);
    } catch (error: any) {
      return InputDomain.createSendErrorState(newState, error.message || 'Failed to send message');
    }
  },

  'stop-message-processing': async function* (state: WorldComponentState): AsyncGenerator<WorldComponentState> {
    const chatId = state.currentChat?.id || state.world?.currentChatId || null;
    if (!chatId) {
      yield {
        ...state,
        error: 'No active chat session to stop.'
      };
      return;
    }

    if (state.isStopping) {
      return;
    }

    const stoppingState: WorldComponentState = {
      ...state,
      isStopping: true,
      error: null
    };
    yield stoppingState;

    try {
      const result = await api.stopMessageProcessing(state.worldName, chatId);
      const shouldResetProcessingState = Boolean(result?.stopped) || result?.reason === 'no-active-process';

      if (shouldResetProcessingState) {
        if (stoppingState.debounceFrameId !== null) {
          cancelAnimationFrame(stoppingState.debounceFrameId);
        }
        if (stoppingState.elapsedIntervalId !== null) {
          clearInterval(stoppingState.elapsedIntervalId);
        }
      }

      yield {
        ...stoppingState,
        isStopping: false,
        isWaiting: shouldResetProcessingState ? false : stoppingState.isWaiting,
        isBusy: shouldResetProcessingState ? false : stoppingState.isBusy,
        activeTools: shouldResetProcessingState ? [] : stoppingState.activeTools,
        pendingStreamUpdates: shouldResetProcessingState ? new Map() : stoppingState.pendingStreamUpdates,
        debounceFrameId: shouldResetProcessingState ? null : stoppingState.debounceFrameId,
        elapsedIntervalId: shouldResetProcessingState ? null : stoppingState.elapsedIntervalId,
        activityStartTime: shouldResetProcessingState ? null : stoppingState.activityStartTime,
        elapsedMs: shouldResetProcessingState ? 0 : stoppingState.elapsedMs,
        needScroll: shouldResetProcessingState ? true : stoppingState.needScroll,
        error: null
      };
    } catch (error: any) {
      yield {
        ...stoppingState,
        isStopping: false,
        error: error?.message || 'Failed to stop message processing.'
      };
    }
  },

  // ========================================
  // SSE STREAMING EVENTS
  // ========================================
  // SSE STREAMING HANDLERS
  // ========================================

  'handleStreamStart': handleStreamStart,
  'handleStreamChunk': handleStreamChunkDebounced, // Phase 2: Debounced version
  'handleStreamEnd': handleStreamEnd,
  'handleStreamError': handleStreamError,
  'handleLogEvent': handleLogEvent,
  'handleMessageEvent': handleMessageEvent,
  'handleSystemEvent': handleSystemEvent,
  'respond-hitl-option': async function* (
    state: WorldComponentState,
    payload: WorldEventPayload<'respond-hitl-option'>
  ): AsyncGenerator<WorldComponentState> {
    const requestId = String(payload?.requestId || '').trim();
    const optionId = String(payload?.optionId || '').trim();
    if (!requestId || !optionId) {
      yield {
        ...state,
        error: 'Invalid HITL response payload.'
      };
      return;
    }

    const prompt = (state.hitlPromptQueue || []).find((entry) => entry.requestId === requestId);
    if (!prompt) {
      yield {
        ...state,
        error: `HITL request '${requestId}' not found.`
      };
      return;
    }

    yield {
      ...state,
      submittingHitlRequestId: requestId,
      error: null
    };

    try {
      const result = await api.respondHitlOption(
        state.worldName,
        requestId,
        optionId,
        payload?.chatId ?? prompt.chatId ?? null
      );
      if (!result?.accepted) {
        yield {
          ...state,
          submittingHitlRequestId: null,
          error: result?.reason || 'HITL response was not accepted.'
        };
        return;
      }
      yield {
        ...state,
        submittingHitlRequestId: null,
        hitlPromptQueue: HitlDomain.removeHitlPromptByRequestId(state.hitlPromptQueue || [], requestId)
      };
    } catch (error: any) {
      yield {
        ...state,
        submittingHitlRequestId: null,
        error: error?.message || 'Failed to submit HITL response.'
      };
    }
  },
  'handleError': handleError,
  'handleToolError': handleToolError,
  'handleToolStart': handleToolStart,
  'handleToolProgress': handleToolProgress,
  'handleToolResult': handleToolResult,
  'handleToolStream': handleToolStream,
  'handleWorldActivity': (state: WorldComponentState, activity: any): WorldComponentState | void => {
    return handleWorldActivity(state, activity);
  },
  'handleCrudEvent': (state: WorldComponentState, payload: WorldEventPayload<'handleCrudEvent'>): Promise<WorldComponentState> => {
    return handleCrudEvent(state, payload);
  },
  // Note: handleMemoryOnlyMessage removed - memory-only events no longer sent via SSE

  // ========================================
  // PHASE 2: STREAMING STATE UPDATES
  // ========================================

  /**
   * Flush pending stream updates (called by RAF)
   */
  'flush-stream-updates': (state: WorldComponentState): WorldComponentState => {
    if (state.pendingStreamUpdates.size === 0) {
      return { ...state, debounceFrameId: null };
    }

    // Apply all pending updates to messages immutably
    const messages = state.messages.map(msg => {
      const pending = state.pendingStreamUpdates.get(msg.messageId);
      return pending ? { ...msg, text: pending } : msg;
    });

    return {
      ...state,
      messages,
      pendingStreamUpdates: new Map(),
      debounceFrameId: null,
      needScroll: true
    };
  },

  /**
   * Update elapsed time (called by interval timer)
   */
  'update-elapsed-time': (state: WorldComponentState): WorldComponentState => {
    if (state.activityStartTime === null) {
      return state;
    }

    const elapsed = Date.now() - state.activityStartTime;
    return { ...state, elapsedMs: elapsed };
  },

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

  // Phase 5: Toggle tool output expansion
  'toggle-tool-output': (state: WorldComponentState, messageId: string): WorldComponentState => {
    const messages = state.messages.map(msg => {
      if (msg.id === messageId) {
        return {
          ...msg,
          isToolOutputExpanded: !msg.isToolOutputExpanded
        };
      }
      return msg;
    });

    return {
      ...state,
      messages
    };
  },

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

  'save-edit-message': async function* (state: WorldComponentState, messageId: WorldEventPayload<'save-edit-message'>): AsyncGenerator<WorldComponentState> {
    const editedText = state.editingText?.trim();
    if (!editedText) return;

    // Find the message by frontend ID
    const message = state.messages.find(msg => msg.id === messageId);
    if (!message) {
      yield {
        ...state,
        error: 'Message not found',
        editingMessageId: null,
        editingText: ''
      };
      return;
    }

    const currentText = String(message.text || '').trim();
    if (editedText === currentText) {
      return;
    }

    // Check if message has backend messageId
    if (!message.messageId) {
      yield {
        ...state,
        error: 'Cannot edit message: missing message ID. Message may not be saved yet.',
        editingMessageId: null,
        editingText: ''
      };
      return;
    }

    const targetChatId = message.chatId || state.currentChat?.id;

    // Check if we have a target chat
    if (!targetChatId) {
      yield {
        ...state,
        error: 'Cannot edit message: no active chat session',
        editingMessageId: null,
        editingText: ''
      };
      return;
    }

    // Store edit backup before backend mutation for local recovery.
    const editBackup = {
      messageId: message.messageId,
      chatId: targetChatId,
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

    // Yield optimistic state immediately so the editing UI closes right away
    yield optimisticState;

    try {
      // Use edit streaming endpoint so post-edit responses stream back into the web UI.
      await editChatMessage(
        state.worldName,
        message.messageId,
        editedText,
        targetChatId,
        { awaitCompletion: false }
      );

      try {
        localStorage.removeItem('agent-world-edit-backup');
      } catch (e) {
        console.warn('Failed to clear edit backup from localStorage:', e);
      }

      // SSE events will stream edited message + responses.
      yield {
        ...optimisticState,
        isSending: false,
        error: null
      };
    } catch (error: any) {
      // Handle backend edit request errors.
      let errorMessage = error.message || 'Failed to edit message';
      const isWorldLockedError = error.message?.includes('423') || error.message?.includes('WORLD_LOCKED');

      if (isWorldLockedError) {
        errorMessage = 'Cannot edit message: world is currently processing. Please try again in a moment.';
      } else if (error.message?.includes('404')) {
        errorMessage = 'Message not found in agent memories. It may have been already deleted.';
      } else if (error.message?.includes('400')) {
        errorMessage = 'Invalid message: only user messages can be edited.';
      }

      // Restore original messages when edit request fails.
      yield {
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

  'update-chat-search': (state: WorldComponentState, payload: WorldEventPayload<'update-chat-search'>): WorldComponentState => ({
    ...state,
    chatSearchQuery: String(payload?.target?.value || '')
  }),

  'load-chat-from-history': async function* (state: WorldComponentState, chatId: WorldEventPayload<'load-chat-from-history'>): AsyncGenerator<WorldComponentState> {
    try {
      // Phase 2: Cleanup streaming state before loading new chat
      if (state.debounceFrameId !== null) {
        cancelAnimationFrame(state.debounceFrameId);
      }
      if (state.elapsedIntervalId !== null) {
        clearInterval(state.elapsedIntervalId);
      }

      const cleanState = {
        ...state,
        pendingStreamUpdates: new Map(),
        debounceFrameId: null,
        activeTools: [],
        isBusy: false,
        elapsedMs: 0,
        activityStartTime: null,
        elapsedIntervalId: null,
        hitlPromptQueue: [],
        submittingHitlRequestId: null
      };

      yield ChatHistoryDomain.createChatLoadingState(cleanState);

      const result = await api.setChat(state.worldName, chatId);
      if (!result.success) {
        yield cleanState;
      }
      const path = ChatHistoryDomain.buildChatRoutePath(state.worldName, chatId);
      app.route(path);
      history.pushState(null, '', path);
    } catch (error: any) {
      yield ChatHistoryDomain.createChatErrorState(state, error.message || 'Failed to load chat from history');
    }
  },

  'branch-chat-from-message': async function* (
    state: WorldComponentState,
    payload: WorldEventPayload<'branch-chat-from-message'>
  ): AsyncGenerator<WorldComponentState> {
    const messageId = String(payload?.messageId || '').trim();
    const sourceChatId = String(payload?.chatId || state.currentChat?.id || state.world?.currentChatId || '').trim();
    if (!messageId || !sourceChatId) {
      yield {
        ...state,
        error: 'Cannot branch chat: missing source chat or message ID.'
      };
      return;
    }

    try {
      yield {
        ...state,
        messagesLoading: true,
        error: null
      };

      const result = await api.branchChatFromMessage(state.worldName, sourceChatId, messageId);
      if (!result?.success || !result?.chatId) {
        yield {
          ...state,
          messagesLoading: false,
          error: 'Failed to branch chat from message.'
        };
        return;
      }

      const path = ChatHistoryDomain.buildChatRoutePath(state.worldName, result.chatId);
      app.route(path);
      history.pushState(null, '', path);
    } catch (error: any) {
      yield {
        ...state,
        messagesLoading: false,
        error: error?.message || 'Failed to branch chat from message.'
      };
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
