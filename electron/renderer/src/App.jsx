/**
 * Desktop Renderer App - Three-Column Workspace UI
 * Purpose:
 * - Render the Electron desktop workspace for world, session, and chat management.
 *
 * Features:
 * - World selector dropdown showing all worlds from workspace
 * - Workspace/world/session sidebar, chat center, context panel
 * - Theme toggle and collapsible left sidebar
 * - SSE-based streaming message rendering
 * - Agent management with avatar badges and message counts
 * - User message edit and delete functionality (via IPC)
 *
 * Implementation Notes:
 * - Function component with local state and IPC-only desktop API calls
 * - Window drag regions are explicit (`drag` + `no-drag`) for custom title rows
 * - Composer textarea auto-resizes and supports Enter-to-send (Shift+Enter newline)
 * - Loads all worlds from workspace folder, displays in dropdown for selection
 * - Message edit uses two-phase approach: DELETE (remove messages) → POST (resubmit edited content)
 * - Edit creates localStorage backup before deletion for recovery
 * - Message deduplication handles multi-agent scenarios (user messages shown once)
 *
 * Recent Changes:
 * - 2026-02-10: Tool output panels now default to collapsed state
 * - 2026-02-10: Sender labels now resolve reply chains to show HUMAN for final assistant replies after tool steps
 * - 2026-02-10: Switched tool output expand/collapse controls to icon-only buttons (no text labels)
 * - 2026-02-10: Removed agent/tool background tints; keep visual distinction with colored left borders only
 * - 2026-02-10: Added collapsible tool output sections in chat messages (expand/collapse)
 * - 2026-02-10: Added role-based message card styling so agent, tool, and system/log messages are visually distinct
 * - 2026-02-10: Updated tool message rendering so non-streaming tool output keeps terminal-style formatting
 * - 2026-02-10: Implemented user message edit and delete following web app patterns
 * - 2026-02-10: Added edit button (pencil icon) and delete button (X icon) on user messages
 * - 2026-02-10: Edit mode shows textarea with Save/Cancel buttons, supports Escape to cancel
 * - 2026-02-10: Delete shows confirmation dialog with message preview
 * - 2026-02-10: Both features use IPC bridge (deleteMessage, loadWorld, sendMessage)
 * - 2026-02-10: Added helper functions: createMessageFromMemory, deduplicateMessages
 * - 2026-02-10: Fixed stuck "Processing..." state by ending stale tool-stream activity and syncing stream counts on tool lifecycle events
 * - 2026-02-10: Added markdown rendering for messages (matching web app behavior)
 * - 2026-02-10: Added delete button (X) next to name field in agent edit form
 * - 2026-02-10: Added a leading dot indicator for each chat session row in the sidebar list
 * - 2026-02-10: Added left inset spacing for the chat-session list container
 * - 2026-02-10: Added chat-session search input above the session list and removed world-card ID/path details
 * - 2026-02-10: Nudged session badge/delete control farther right for tighter edge alignment
 * - 2026-02-10: Reduced session stack spacing and aligned badge/delete control to the far-right edge of each row
 * - 2026-02-10: Tightened session row text/padding to reduce visual line height
 * - 2026-02-10: Selected chat-session highlight now uses a slightly darker dedicated sidebar token
 * - 2026-02-10: Removed chat-session row borders and aligned selected-row highlight to `bg-sidebar-accent` (same as user messages)
 * - 2026-02-10: Session rows now use a compact height, with badge/delete controls overlaid in the same right-side position
 * - 2026-02-10: Session list now shows message totals as right-aligned badges instead of inline "x messages" text
 * - 2026-02-10: Keep selected session message count in sync with loaded/streamed messages for live sidebar updates
 * - Reworked edit-form actions to use a fixed bottom row with tighter button padding
 * - Reduced edit-form Save/Cancel button size and pinned actions to panel bottom for easier access
 * - Added world form parity with web app (chat provider/model + MCP config fields) for create/edit panels
 * - Agent avatar message badges now count only non-human messages from the selected chat
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createStreamingState } from './streaming-state.js';
import { createActivityState } from './activity-state.js';
import {
  ThinkingIndicator,
  ToolExecutionStatus,
  ActivityPulse,
  AgentQueueDisplay,
  ElapsedTimeCounter
} from './components/index.js';
import { renderMarkdown } from './utils/markdown';

const THEME_STORAGE_KEY = 'agent-world-desktop-theme';
const COMPOSER_MAX_ROWS = 5;
const DEFAULT_TURN_LIMIT = 5;
const MIN_TURN_LIMIT = 1;
const MAX_HEADER_AGENT_AVATARS = 8;
const DEFAULT_WORLD_CHAT_LLM_PROVIDER = 'ollama';
const DEFAULT_WORLD_CHAT_LLM_MODEL = 'llama3.2:3b';
const DEFAULT_AGENT_FORM = {
  id: '',
  name: '',
  type: 'assistant',
  provider: 'openai',
  model: 'gpt-4o-mini',
  systemPrompt: '',
  temperature: '',
  maxTokens: ''
};
const AGENT_PROVIDER_OPTIONS = ['openai', 'anthropic', 'google', 'xai', 'azure', 'openai-compatible', 'ollama'];
const WORLD_PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'azure', label: 'Azure' },
  { value: 'ollama', label: 'Ollama' }
];
const DRAG_REGION_STYLE = { WebkitAppRegion: 'drag' };
const NO_DRAG_REGION_STYLE = { WebkitAppRegion: 'no-drag' };
const HUMAN_SENDER_VALUES = new Set(['human', 'user', 'you']);

/**
 * Message Content Renderer Component
 * Renders message content with markdown support for regular messages
 * Preserves special formatting for tool output and log messages
 */
function MessageContent({ message }) {
  const role = String(message?.role || '').toLowerCase();
  const isToolMessage = role === 'tool' || message.isToolStreaming;
  const [isToolCollapsed, setIsToolCollapsed] = useState(true);

  // Use useMemo to cache markdown rendering and avoid re-parsing on every render
  const renderedContent = useMemo(() => {
    // Skip markdown for special message types that need specific formatting
    if (message.logEvent || isToolMessage) {
      return null;
    }

    // Render markdown for regular message content
    const content = message.content || '';
    if (!content) return '';

    return renderMarkdown(content);
  }, [message.content, message.logEvent, isToolMessage]);

  // Log message rendering with level-based colored dot
  if (message.logEvent) {
    return (
      <div className="flex items-start gap-2 text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>
        <span
          className="inline-block rounded-full mt-0.5"
          style={{
            width: '6px',
            height: '6px',
            flexShrink: 0,
            backgroundColor:
              message.logEvent.level === 'error' ? '#ef4444' :
                message.logEvent.level === 'warn' ? '#f59e0b' :
                  message.logEvent.level === 'info' ? '#10b981' :
                    message.logEvent.level === 'debug' ? '#06b6d4' :
                      '#9ca3af'
          }}
        />
        <div className="flex-1">
          <span className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
            {message.logEvent.category}
          </span>
          {' - '}
          <span>{message.logEvent.message}</span>
        </div>
      </div>
    );
  }

  // Tool output with stdout/stderr distinction
  if (isToolMessage) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {message.isToolStreaming ? '⚙️ Executing...' : '⚙️ Tool output'}
          </div>
          <button
            type="button"
            onClick={() => setIsToolCollapsed((collapsed) => !collapsed)}
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            aria-label={isToolCollapsed ? 'Expand tool output' : 'Collapse tool output'}
            title={isToolCollapsed ? 'Expand tool output' : 'Collapse tool output'}
          >
            {isToolCollapsed ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path d="m18 15-6-6-6 6" />
              </svg>
            )}
          </button>
        </div>
        {!isToolCollapsed ? (
          <div
            className="rounded-md overflow-hidden border"
            style={message.streamType === 'stderr' ? {
              backgroundColor: 'rgba(69, 10, 10, 0.3)',
              borderColor: 'rgba(239, 68, 68, 0.3)'
            } : {
              backgroundColor: 'rgb(15, 23, 42)',
              borderColor: 'rgb(51, 65, 85)'
            }}
          >
            <pre
              className="text-xs p-3 font-mono whitespace-pre-wrap"
              style={{
                color: message.streamType === 'stderr'
                  ? 'rgb(248, 113, 113)'
                  : 'rgb(203, 213, 225)',
                wordBreak: 'break-all'
              }}
            >
              {message.content || (message.isToolStreaming ? '(waiting for output...)' : '(no output)')}
            </pre>
          </div>
        ) : null}
      </div>
    );
  }

  // Regular message content with markdown rendering
  return (
    <div
      className="prose prose-invert max-w-none text-foreground"
      dangerouslySetInnerHTML={{ __html: renderedContent }}
    />
  );
}

function getDesktopApi() {
  const api = window.agentWorldDesktop;
  if (!api) {
    throw new Error('Desktop API bridge is unavailable.');
  }

  // Compatibility: older preload bridges exposed `deleteSession` but not `deleteChat`.
  if (typeof api.deleteChat !== 'function' && typeof api.deleteSession === 'function') {
    return {
      ...api,
      deleteChat: api.deleteSession
    };
  }

  return api;
}

function getStoredThemePreference() {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function safeMessage(error, fallback) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function getMessageTimestamp(message) {
  const value = message?.createdAt;
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function upsertMessageList(existingMessages, incomingMessage) {
  const incomingId = incomingMessage?.messageId || incomingMessage?.id;
  const next = [...existingMessages];

  if (!incomingId) {
    next.push(incomingMessage);
  } else {
    const existingIndex = next.findIndex((message) => (message.messageId || message.id) === incomingId);
    if (existingIndex >= 0) {
      next[existingIndex] = {
        ...next[existingIndex],
        ...incomingMessage,
        id: next[existingIndex].id || incomingMessage.id || incomingId
      };
    } else {
      next.push({
        ...incomingMessage,
        id: incomingMessage.id || incomingId
      });
    }
  }

  next.sort((left, right) => getMessageTimestamp(left) - getMessageTimestamp(right));
  return next;
}

/**
 * Convert agent memory item to message for display
 */
function createMessageFromMemory(memoryItem, agentName) {
  const sender = memoryItem.sender || agentName;
  const messageType =
    sender === 'human' || sender === 'user' ? 'user' :
      memoryItem.role === 'tool' ? 'tool' :
        memoryItem.role === 'assistant' ? 'agent' : 'agent';

  return {
    id: `msg-${Date.now()}-${Math.random()}`,
    sender,
    content: memoryItem.content || '',
    messageId: memoryItem.messageId,
    replyToMessageId: memoryItem.replyToMessageId,
    createdAt: memoryItem.createdAt || new Date(),
    type: messageType,
    fromAgentId: memoryItem.agentId,
    role: memoryItem.role,
    chatId: memoryItem.chatId
  };
}

/**
 * Deduplicate user messages across agents (multi-agent scenarios)
 * User messages appear only once, agent messages remain separate
 */
function deduplicateMessages(messages, agents = []) {
  const messageMap = new Map();
  const messagesWithoutId = [];

  for (const msg of messages) {
    const isUserMessage = msg.type === 'user' ||
      msg.sender?.toLowerCase() === 'human' ||
      msg.sender?.toLowerCase() === 'user';

    if (isUserMessage && msg.messageId) {
      if (!messageMap.has(msg.messageId)) {
        messageMap.set(msg.messageId, {
          ...msg,
          seenByAgents: msg.fromAgentId ? [msg.fromAgentId] : []
        });
      }
    } else {
      messagesWithoutId.push(msg);
    }
  }

  return [...messageMap.values(), ...messagesWithoutId]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function isHumanMessage(message) {
  const role = String(message?.role || '').toLowerCase();
  const sender = String(message?.sender || '').toLowerCase();
  return role === 'user' || HUMAN_SENDER_VALUES.has(sender);
}

function getMessageCardClassName(message) {
  const role = String(message?.role || '').toLowerCase();
  const isUser = role === 'user';
  const isTool = role === 'tool' || Boolean(message?.isToolStreaming);
  const isSystem = role === 'system' || message?.type === 'log' || Boolean(message?.logEvent);

  const roleClassName = isUser
    ? 'ml-auto w-[80%] border-l-sidebar-border bg-sidebar-accent'
    : isTool
      ? 'mr-auto w-[92%] border-l-amber-500/50'
      : isSystem
        ? 'mr-auto w-[90%] border-l-border bg-muted/40'
        : 'mr-auto w-[86%] border-l-sky-500/40';

  return `group relative rounded-lg border-l p-3 ${roleClassName}`;
}

function getReplyTarget(message, messagesById) {
  const replyToMessageId = String(message?.replyToMessageId || '').trim();
  if (!replyToMessageId) return null;

  const visited = new Set();
  let currentId = replyToMessageId;
  let closestReplyTarget = null;

  for (let depth = 0; depth < 25 && currentId; depth += 1) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const parentMessage = messagesById.get(currentId);
    if (!parentMessage) break;

    const parentTarget = isHumanMessage(parentMessage) ? 'HUMAN' : (parentMessage.sender || 'unknown');
    if (!closestReplyTarget) {
      closestReplyTarget = parentTarget;
    }
    if (parentTarget === 'HUMAN') {
      return 'HUMAN';
    }

    currentId = String(parentMessage?.replyToMessageId || '').trim();
  }

  return closestReplyTarget;
}

function inferReplyTargetFromHistory(message, messages, currentIndex) {
  const role = String(message?.role || '').toLowerCase();
  if (role !== 'assistant') return null;
  if (message?.replyToMessageId) return null;

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (isHumanMessage(candidate)) {
      return 'HUMAN';
    }
  }

  return null;
}

function getMessageSenderLabel(message, messagesById, messages, currentIndex) {
  if (isHumanMessage(message)) return 'HUMAN';
  const sender = message?.sender || 'unknown';
  const replyTarget = getReplyTarget(message, messagesById) ||
    inferReplyTargetFromHistory(message, messages, currentIndex);
  if (!replyTarget) return sender;
  return `${sender} (reply to ${replyTarget})`;
}

function getAgentDisplayName(agent, fallbackIndex) {
  const name = typeof agent?.name === 'string' ? agent.name.trim() : '';
  if (name) return name;
  const id = typeof agent?.id === 'string' ? agent.id.trim() : '';
  if (id) return id;
  return `Agent ${fallbackIndex + 1}`;
}

function getAgentInitials(displayName) {
  const segments = String(displayName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (segments.length === 0) return '?';
  if (segments.length === 1) {
    return segments[0].slice(0, 2).toUpperCase();
  }
  return `${segments[0][0] || ''}${segments[1][0] || ''}`.toUpperCase();
}

function parseOptionalNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function getSessionTimestamp(session) {
  const updatedAt = session?.updatedAt ? new Date(session.updatedAt).getTime() : Number.NaN;
  if (Number.isFinite(updatedAt)) return updatedAt;
  const createdAt = session?.createdAt ? new Date(session.createdAt).getTime() : Number.NaN;
  if (Number.isFinite(createdAt)) return createdAt;
  return 0;
}

function sortSessionsByNewest(sessions) {
  if (!Array.isArray(sessions)) return [];
  return [...sessions].sort((left, right) => getSessionTimestamp(right) - getSessionTimestamp(left));
}

function getDefaultWorldForm() {
  return {
    name: '',
    description: '',
    turnLimit: DEFAULT_TURN_LIMIT,
    chatLLMProvider: DEFAULT_WORLD_CHAT_LLM_PROVIDER,
    chatLLMModel: DEFAULT_WORLD_CHAT_LLM_MODEL,
    mcpConfig: ''
  };
}

function getWorldFormFromWorld(world) {
  if (!world) return getDefaultWorldForm();

  const turnLimitRaw = Number(world.turnLimit);
  const turnLimit = Number.isFinite(turnLimitRaw) && turnLimitRaw >= MIN_TURN_LIMIT
    ? Math.floor(turnLimitRaw)
    : DEFAULT_TURN_LIMIT;
  const chatLLMProvider = String(world.chatLLMProvider || '').trim() || DEFAULT_WORLD_CHAT_LLM_PROVIDER;
  const chatLLMModel = String(world.chatLLMModel || '').trim() || DEFAULT_WORLD_CHAT_LLM_MODEL;

  return {
    name: String(world.name || ''),
    description: String(world.description || ''),
    turnLimit,
    chatLLMProvider,
    chatLLMModel,
    mcpConfig: world.mcpConfig == null ? '' : String(world.mcpConfig)
  };
}

function validateWorldForm(worldForm) {
  const name = String(worldForm.name || '').trim();
  if (!name) return { valid: false, error: 'World name is required.' };

  const turnLimitRaw = Number(worldForm.turnLimit);
  const turnLimit = Number.isFinite(turnLimitRaw) && turnLimitRaw >= MIN_TURN_LIMIT
    ? Math.floor(turnLimitRaw)
    : DEFAULT_TURN_LIMIT;
  const chatLLMProvider = String(worldForm.chatLLMProvider || '').trim() || DEFAULT_WORLD_CHAT_LLM_PROVIDER;
  const chatLLMModel = String(worldForm.chatLLMModel || '').trim() || DEFAULT_WORLD_CHAT_LLM_MODEL;
  const mcpConfig = worldForm.mcpConfig == null ? '' : String(worldForm.mcpConfig);

  if (mcpConfig.trim()) {
    try {
      JSON.parse(mcpConfig);
    } catch {
      return { valid: false, error: 'MCP Config must be valid JSON.' };
    }
  }

  return {
    valid: true,
    data: {
      name,
      description: String(worldForm.description || '').trim(),
      turnLimit,
      chatLLMProvider,
      chatLLMModel,
      mcpConfig
    }
  };
}

function validateAgentForm(agentForm) {
  const name = String(agentForm.name || '').trim();
  if (!name) return { valid: false, error: 'Agent name is required.' };

  const model = String(agentForm.model || '').trim();
  if (!model) return { valid: false, error: 'Agent model is required.' };

  return {
    valid: true,
    data: {
      name,
      type: String(agentForm.type || 'assistant').trim() || 'assistant',
      provider: String(agentForm.provider || 'openai').trim() || 'openai',
      model,
      systemPrompt: String(agentForm.systemPrompt || ''),
      temperature: parseOptionalNumber(agentForm.temperature),
      maxTokens: parseOptionalNumber(agentForm.maxTokens)
    }
  };
}

export default function App() {
  const api = useMemo(() => getDesktopApi(), []);
  const chatSubscriptionCounter = useRef(0);
  const messageRefreshCounter = useRef(0);
  const workspaceDropdownRef = useRef(null);
  const composerTextareaRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const previousMessageCountRef = useRef(0);
  const streamingStateRef = useRef(null);
  const activityStateRef = useRef(null);

  const [workspace, setWorkspace] = useState({
    workspacePath: null,
    storagePath: null
  });
  const [loadedWorld, setLoadedWorld] = useState(null);
  const [worldLoadError, setWorldLoadError] = useState(null);
  const [loadingWorld, setLoadingWorld] = useState(false);
  const [availableWorlds, setAvailableWorlds] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionSearch, setSessionSearch] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [composer, setComposer] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState('create-world');
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [themePreference, setThemePreference] = useState(getStoredThemePreference);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [status, setStatus] = useState({ text: '', kind: 'info' });
  const [creatingWorld, setCreatingWorld] = useState(getDefaultWorldForm);
  const [editingWorld, setEditingWorld] = useState(getDefaultWorldForm);
  const [creatingAgent, setCreatingAgent] = useState(DEFAULT_AGENT_FORM);
  const [editingAgent, setEditingAgent] = useState(DEFAULT_AGENT_FORM);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [selectedProjectPath, setSelectedProjectPath] = useState(null);
  const [updatingWorld, setUpdatingWorld] = useState(false);
  const [deletingWorld, setDeletingWorld] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState(null);
  const [loading, setLoading] = useState({
    sessions: false,
    messages: false,
    send: false
  });
  // Message edit/delete state
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState(null);
  // Activity state for streaming indicators
  const [isBusy, setIsBusy] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [activeTools, setActiveTools] = useState([]);
  const [activeStreamCount, setActiveStreamCount] = useState(0);
  // Prompt editor modal state
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [promptEditorValue, setPromptEditorValue] = useState('');
  const [promptEditorTarget, setPromptEditorTarget] = useState(null); // 'create' or 'edit'
  // MCP config editor modal state
  const [mcpEditorOpen, setMcpEditorOpen] = useState(false);
  const [mcpEditorValue, setMcpEditorValue] = useState('');
  const [mcpEditorTarget, setMcpEditorTarget] = useState(null); // 'create' or 'edit'

  const setStatusText = useCallback((text, kind = 'info') => {
    setStatus({ text, kind });
  }, []);

  // Initialize streaming state manager
  useEffect(() => {
    streamingStateRef.current = createStreamingState({
      onStreamStart: (entry) => {
        setMessages((existing) => upsertMessageList(existing, {
          id: entry.messageId,
          messageId: entry.messageId,
          role: 'assistant',
          sender: entry.agentName,
          content: '',
          createdAt: entry.createdAt,
          isStreaming: true
        }));
      },
      onStreamUpdate: (messageId, content) => {
        setMessages((existing) => {
          const index = existing.findIndex((m) => String(m.messageId || m.id) === String(messageId));
          if (index < 0) return existing;
          const next = [...existing];
          next[index] = { ...next[index], content };
          return next;
        });
      },
      onStreamEnd: (messageId) => {
        setMessages((existing) => {
          const index = existing.findIndex((m) => String(m.messageId || m.id) === String(messageId));
          if (index < 0) return existing;
          const next = [...existing];
          next[index] = { ...next[index], isStreaming: false };
          return next;
        });
      },
      onStreamError: (messageId, errorMessage) => {
        setMessages((existing) => {
          const index = existing.findIndex((m) => String(m.messageId || m.id) === String(messageId));
          if (index < 0) return existing;
          const next = [...existing];
          next[index] = { ...next[index], isStreaming: false, hasError: true, errorMessage };
          return next;
        });
      },
      onToolStreamStart: (entry) => {
        setMessages((existing) => upsertMessageList(existing, {
          id: entry.messageId,
          messageId: entry.messageId,
          role: 'tool',
          sender: entry.agentName || 'shell_cmd',
          content: '',
          createdAt: entry.createdAt,
          isToolStreaming: true,
          streamType: entry.streamType
        }));
      },
      onToolStreamUpdate: (messageId, content, streamType) => {
        setMessages((existing) => {
          const index = existing.findIndex((m) => String(m.messageId || m.id) === String(messageId));
          if (index < 0) return existing;
          const next = [...existing];
          next[index] = { ...next[index], content, streamType };
          return next;
        });
      },
      onToolStreamEnd: (messageId) => {
        setMessages((existing) => {
          const index = existing.findIndex((m) => String(m.messageId || m.id) === String(messageId));
          if (index < 0) return existing;
          const next = [...existing];
          next[index] = { ...next[index], isToolStreaming: false, streamType: undefined };
          return next;
        });
      }
    });

    return () => {
      if (streamingStateRef.current) {
        streamingStateRef.current.cleanup();
      }
    };
  }, []);

  // Initialize activity state manager
  useEffect(() => {
    activityStateRef.current = createActivityState({
      onToolStart: (entry) => {
        setActiveTools((tools) => [...tools, entry]);
      },
      onToolResult: (toolUseId) => {
        setActiveTools((tools) => tools.filter((t) => t.toolUseId !== toolUseId));
      },
      onToolError: (toolUseId) => {
        setActiveTools((tools) => tools.filter((t) => t.toolUseId !== toolUseId));
      },
      onToolProgress: (toolUseId, progress) => {
        setActiveTools((tools) => tools.map((t) =>
          t.toolUseId === toolUseId ? { ...t, progress } : t
        ));
      },
      onElapsedUpdate: (ms) => {
        setElapsedMs(ms);
      },
      onBusyChange: (busy) => {
        setIsBusy(busy);
      }
    });

    return () => {
      if (activityStateRef.current) {
        activityStateRef.current.cleanup();
      }
    };
  }, []);

  const selectedWorld = useMemo(
    () => loadedWorld,
    [loadedWorld]
  );

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );
  const filteredSessions = useMemo(() => {
    const query = String(sessionSearch || '').trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) => String(session?.name || '').toLowerCase().includes(query));
  }, [sessions, sessionSearch]);

  const rawWorldAgents = useMemo(
    () => (Array.isArray(selectedWorld?.agents) ? selectedWorld.agents : []),
    [selectedWorld]
  );

  const messageCountByAgentId = useMemo(() => {
    const normalizedSelectedSessionId = String(selectedSessionId || '').trim();
    if (!normalizedSelectedSessionId) {
      return new Map();
    }

    const idToAgentId = new Map();
    const nameToAgentId = new Map();

    rawWorldAgents.forEach((agent, index) => {
      const id = String(agent?.id || `agent-${index + 1}`);
      idToAgentId.set(id, id);
      const name = getAgentDisplayName(agent, index).toLowerCase();
      if (name) {
        nameToAgentId.set(name, id);
      }
    });

    const counts = new Map();
    for (const message of messages) {
      const messageChatId = String(message?.chatId || '').trim();
      if (!messageChatId || messageChatId !== normalizedSelectedSessionId) continue;
      if (isHumanMessage(message)) continue;

      const fromAgentId = String(message?.fromAgentId || '').trim();
      let resolvedAgentId = null;

      if (fromAgentId && idToAgentId.has(fromAgentId)) {
        resolvedAgentId = fromAgentId;
      } else {
        const sender = String(message?.sender || '').trim().toLowerCase();
        if (sender && nameToAgentId.has(sender)) {
          resolvedAgentId = nameToAgentId.get(sender);
        }
      }

      if (!resolvedAgentId) continue;
      counts.set(resolvedAgentId, (counts.get(resolvedAgentId) || 0) + 1);
    }

    return counts;
  }, [messages, rawWorldAgents, selectedSessionId]);

  const worldAgents = useMemo(() => {
    return rawWorldAgents.map((agent, index) => {
      const name = getAgentDisplayName(agent, index);
      const id = String(agent?.id || `agent-${index + 1}`);
      const derivedMessageCount = messageCountByAgentId.get(id);
      return {
        id,
        name,
        initials: getAgentInitials(name),
        type: String(agent?.type || 'assistant'),
        provider: String(agent?.provider || 'openai'),
        model: String(agent?.model || 'gpt-4o-mini'),
        systemPrompt: String(agent?.systemPrompt || ''),
        temperature: Number.isFinite(Number(agent?.temperature)) ? Number(agent.temperature) : null,
        maxTokens: Number.isFinite(Number(agent?.maxTokens)) ? Number(agent.maxTokens) : null,
        llmCallCount: Number.isFinite(Number(agent?.llmCallCount)) ? Number(agent.llmCallCount) : 0,
        messageCount: Number.isFinite(derivedMessageCount)
          ? Math.max(0, Math.floor(derivedMessageCount))
          : 0
      };
    });
  }, [messageCountByAgentId, rawWorldAgents]);

  const visibleWorldAgents = useMemo(
    () => worldAgents.slice(0, MAX_HEADER_AGENT_AVATARS),
    [worldAgents]
  );

  const hiddenWorldAgentCount = Math.max(0, worldAgents.length - visibleWorldAgents.length);

  const selectedAgentForPanel = useMemo(
    () => worldAgents.find((agent) => agent.id === selectedAgentId) || null,
    [worldAgents, selectedAgentId]
  );

  const messagesById = useMemo(() => {
    const index = new Map();
    for (const message of messages) {
      const id = message?.messageId || message?.id;
      if (!id) continue;
      index.set(String(id), message);
    }
    return index;
  }, [messages]);

  const refreshSessions = useCallback(async (worldId, preferredSessionId = null) => {
    if (!worldId) {
      setSessions([]);
      setSelectedSessionId(null);
      setMessages([]);
      return;
    }

    setLoading((value) => ({ ...value, sessions: true }));
    try {
      const nextSessions = sortSessionsByNewest(await api.listSessions(worldId));
      setSessions(nextSessions);
      const nextSelected =
        preferredSessionId && nextSessions.some((session) => session.id === preferredSessionId)
          ? preferredSessionId
          : nextSessions[0]?.id || null;
      setSelectedSessionId(nextSelected);
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to load sessions.'), 'error');
    } finally {
      setLoading((value) => ({ ...value, sessions: false }));
    }
  }, [api, setStatusText]);

  const refreshMessages = useCallback(async (worldId, sessionId) => {
    const refreshId = ++messageRefreshCounter.current;
    if (!worldId || !sessionId) {
      setMessages([]);
      setLoading((value) => ({ ...value, messages: false }));
      return;
    }

    setLoading((value) => ({ ...value, messages: true }));
    try {
      const nextMessages = await api.getMessages(worldId, sessionId);
      if (refreshId !== messageRefreshCounter.current) return;
      setMessages(nextMessages);
    } catch (error) {
      if (refreshId !== messageRefreshCounter.current) return;
      setStatusText(safeMessage(error, 'Failed to load messages.'), 'error');
    } finally {
      if (refreshId !== messageRefreshCounter.current) return;
      setLoading((value) => ({ ...value, messages: false }));
    }
  }, [api, setStatusText]);

  const initialize = useCallback(async () => {
    try {
      const nextWorkspace = await api.getWorkspace();
      setWorkspace(nextWorkspace);
      if (nextWorkspace.workspacePath) {
        // Load worlds from workspace
        setLoadingWorld(true);
        try {
          const worldsState = await api.loadWorldFromFolder();
          if (worldsState.success && worldsState.worlds) {
            setAvailableWorlds(worldsState.worlds);
            // Auto-load last selected world
            const lastWorldId = await api.getLastSelectedWorld();
            if (lastWorldId && worldsState.worlds.some(w => w.id === lastWorldId)) {
              await onSelectWorld(lastWorldId);
            }
            setWorldLoadError(null);
            // User must explicitly select a world (no auto-selection)
          } else {
            setAvailableWorlds([]);
            setLoadedWorld(null);
            setWorldLoadError(worldsState.message || worldsState.error);
            setSessions([]);
          }
        } catch (error) {
          setAvailableWorlds([]);
          setLoadedWorld(null);
          setWorldLoadError(safeMessage(error, 'Failed to load worlds from folder'));
          setSessions([]);
        } finally {
          setLoadingWorld(false);
        }
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to initialize app.'), 'error');
    }
  }, [api, setStatusText]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    refreshSessions(loadedWorld?.id);
  }, [loadedWorld, refreshSessions]);

  useEffect(() => {
    refreshMessages(loadedWorld?.id, selectedSessionId);
  }, [loadedWorld, selectedSessionId, refreshMessages]);

  useEffect(() => {
    const normalizedSessionId = String(selectedSessionId || '').trim();
    if (!normalizedSessionId) return;

    const nextMessageCount = Array.isArray(messages) ? messages.length : 0;
    setSessions((existing) => {
      let changed = false;
      const next = existing.map((session) => {
        const sessionId = String(session?.id || '').trim();
        if (sessionId !== normalizedSessionId) return session;

        const currentCountRaw = Number(session?.messageCount);
        const currentCount = Number.isFinite(currentCountRaw) ? Math.max(0, Math.floor(currentCountRaw)) : 0;
        if (currentCount === nextMessageCount) return session;

        changed = true;
        return {
          ...session,
          messageCount: nextMessageCount
        };
      });

      return changed ? next : existing;
    });
  }, [messages, selectedSessionId]);

  useEffect(() => {
    if (!loadedWorld) {
      setEditingWorld(getDefaultWorldForm());
      return;
    }

    setEditingWorld(getWorldFormFromWorld(loadedWorld));
  }, [loadedWorld]);

  useEffect(() => {
    setSessionSearch('');
  }, [loadedWorld?.id]);

  useEffect(() => {
    if (!loadedWorld?.id || !selectedSessionId) {
      return undefined;
    }

    const subscriptionId = `chat-${Date.now()}-${chatSubscriptionCounter.current++}`;
    let disposed = false;
    const removeListener = api.onChatEvent((payload) => {
      if (disposed || !payload) return;
      if (payload.subscriptionId && payload.subscriptionId !== subscriptionId) return;
      if (payload.worldId && payload.worldId !== loadedWorld.id) return;

      const syncActiveStreamCount = () => {
        const streaming = streamingStateRef.current;
        if (!streaming) return;

        const count = streaming.getActiveCount();
        setActiveStreamCount(count);
        if (activityStateRef.current) {
          activityStateRef.current.setActiveStreamCount(count);
        }
      };

      const endAllToolStreams = () => {
        const streaming = streamingStateRef.current;
        if (!streaming) return;

        const endedIds = streaming.endAllToolStreams();
        if (endedIds.length > 0) {
          syncActiveStreamCount();
        }
      };

      if (payload.type === 'message') {
        const incomingMessage = payload.message;
        if (!incomingMessage) return;

        const incomingChatId = incomingMessage.chatId || payload.chatId || null;
        if (selectedSessionId && incomingChatId && incomingChatId !== selectedSessionId) return;

        setMessages((existing) => upsertMessageList(existing, {
          ...incomingMessage,
          isStreaming: false,
          isToolStreaming: false,
          streamType: undefined
        }));

        // Tool stream chunks can outlive their owning tool call in some flows.
        // Once assistant output is finalized, close any lingering tool stream state.
        if (String(incomingMessage.role || '').toLowerCase() === 'assistant') {
          endAllToolStreams();
        }
        return;
      }

      if (payload.type === 'log') {
        const logEvent = payload.logEvent;
        if (!logEvent) return;

        // Create log message for inline display
        const logMessage = {
          id: `log-${logEvent.messageId || Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          messageId: `log-${Date.now()}`,
          sender: 'system',
          content: logEvent.message,
          text: logEvent.message,
          role: 'system',
          type: 'log',
          createdAt: logEvent.timestamp || new Date().toISOString(),
          logEvent: logEvent
        };

        setMessages((existing) => [...existing, logMessage]);
        return;
      }

      if (payload.type === 'sse') {
        const streamPayload = payload.sse;
        if (!streamPayload) return;
        const streamChatId = streamPayload.chatId || payload.chatId || null;
        if (selectedSessionId && streamChatId && streamChatId !== selectedSessionId) return;

        const eventType = String(streamPayload.eventType || '').toLowerCase();
        const messageId = streamPayload.messageId;
        if (!messageId) return;

        const streaming = streamingStateRef.current;
        if (!streaming) return;

        if (eventType === 'start') {
          // A new assistant stream means previous tool execution phase is complete.
          endAllToolStreams();
          streaming.handleStart(messageId, streamPayload.agentName || 'assistant');
          syncActiveStreamCount();
        } else if (eventType === 'chunk') {
          streaming.handleChunk(messageId, streamPayload.content || '');
        } else if (eventType === 'end') {
          streaming.handleEnd(messageId);
          syncActiveStreamCount();
        } else if (eventType === 'error') {
          streaming.handleError(messageId, streamPayload.error || 'Stream error');
          syncActiveStreamCount();
        } else if (eventType === 'tool-stream') {
          // Handle tool streaming events (shell command output)
          const { content, stream } = streamPayload;

          // Check if this is the first chunk (need to start)
          if (!streaming.isActive(messageId)) {
            streaming.handleToolStreamStart(
              messageId,
              streamPayload.agentName || 'shell_cmd',
              stream || 'stdout'
            );
            syncActiveStreamCount();
          }

          streaming.handleToolStreamChunk(messageId, content || '', stream || 'stdout');
        }
      }

      // Handle tool events 
      if (payload.type === 'tool') {
        const toolPayload = payload.tool;
        if (!toolPayload) return;

        const activity = activityStateRef.current;
        if (!activity) return;

        const toolEventType = String(toolPayload.eventType || '').toLowerCase();
        const toolUseId = toolPayload.toolUseId;
        if (!toolUseId) return;

        if (toolEventType === 'tool-start') {
          activity.handleToolStart(toolUseId, toolPayload.toolName || 'unknown', toolPayload.toolInput);
        } else if (toolEventType === 'tool-result') {
          activity.handleToolResult(toolUseId, toolPayload.result || '');
          const streaming = streamingStateRef.current;
          if (streaming?.isActive(toolUseId)) {
            streaming.handleToolStreamEnd(toolUseId);
            syncActiveStreamCount();
          } else {
            endAllToolStreams();
          }
        } else if (toolEventType === 'tool-error') {
          activity.handleToolError(toolUseId, toolPayload.error || 'Tool error');
          const streaming = streamingStateRef.current;
          if (streaming?.isActive(toolUseId)) {
            streaming.handleToolStreamEnd(toolUseId);
            syncActiveStreamCount();
          } else {
            endAllToolStreams();
          }
        } else if (toolEventType === 'tool-progress') {
          activity.handleToolProgress(toolUseId, toolPayload.progress || '');
        }
      }
    });

    api.subscribeChatEvents(loadedWorld.id, selectedSessionId, subscriptionId).catch((error) => {
      if (!disposed) {
        setStatusText(safeMessage(error, 'Failed to subscribe to chat updates.'), 'error');
      }
    });

    return () => {
      disposed = true;
      removeListener();
      api.unsubscribeChatEvents(subscriptionId).catch(() => { });
      // Cleanup streaming state on session change
      if (streamingStateRef.current) {
        streamingStateRef.current.cleanup();
      }
      if (activityStateRef.current) {
        activityStateRef.current.cleanup();
      }
      setActiveStreamCount(0);
    };
  }, [api, selectedSessionId, loadedWorld, setStatusText]);

  useEffect(() => () => {
    api.unsubscribeChatEvents('default').catch(() => { });
  }, [api]);

  useEffect(() => {
    if (!workspaceMenuOpen) return undefined;

    const onDocumentPointerDown = (event) => {
      const target = event.target;
      if (workspaceDropdownRef.current && target instanceof Node && !workspaceDropdownRef.current.contains(target)) {
        setWorkspaceMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', onDocumentPointerDown);
    return () => document.removeEventListener('pointerdown', onDocumentPointerDown);
  }, [workspaceMenuOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    if (themePreference === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', themePreference);
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    }
  }, [themePreference]);

  const onOpenWorkspace = useCallback(async () => {
    try {
      const nextWorkspace = await api.openWorkspace();
      setWorkspace(nextWorkspace);
      setWorkspaceMenuOpen(false);
      setStatusText('Workspace path selected', 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to open workspace.'), 'error');
    }
  }, [api, setStatusText]);

  const onSelectWorld = useCallback(async (worldId) => {
    if (!worldId) return;

    try {
      setLoadingWorld(true);
      setWorkspaceMenuOpen(false);
      const result = await api.loadWorld(worldId);

      if (result.success) {
        const nextSessions = sortSessionsByNewest(result.sessions || []);
        setLoadedWorld(result.world);
        setSelectedAgentId(null);
        setSessions(nextSessions);
        setSelectedSessionId(nextSessions[0]?.id || null);
        setWorldLoadError(null);
        setStatusText(`World loaded: ${result.world.id}`, 'success');
        // Persist world selection
        await api.saveLastSelectedWorld(worldId);
      } else {
        setLoadedWorld(null);
        setSelectedAgentId(null);
        setSessions([]);
        setWorldLoadError(result.message || result.error);
        setStatusText(result.message || 'Failed to load world', 'error');
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to load world.'), 'error');
    } finally {
      setLoadingWorld(false);
    }
  }, [api, setStatusText]);

  const onCreateWorld = useCallback(async (event) => {
    event.preventDefault();

    const validation = validateWorldForm(creatingWorld);
    if (!validation.valid) {
      setStatusText(validation.error, 'error');
      return;
    }

    try {
      const created = await api.createWorld(validation.data);
      setCreatingWorld(getDefaultWorldForm());

      // Add to available worlds list
      setAvailableWorlds((worlds) => [...worlds, { id: created.id, name: created.name }]);

      // Load the created world and its sessions
      setLoadedWorld(created);
      setSelectedAgentId(null);
      const nextSessions = sortSessionsByNewest(await api.listSessions(created.id));
      setSessions(nextSessions);
      setSelectedSessionId(nextSessions[0]?.id || null);
      setWorldLoadError(null);
      // Persist world selection
      await api.saveLastSelectedWorld(created.id);

      setStatusText(`World created: ${created.name}`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to create world.'), 'error');
    }
  }, [api, creatingWorld, setStatusText]);

  const onOpenCreateWorldPanel = useCallback(() => {
    setPanelMode('create-world');
    setPanelOpen(true);
  }, []);

  const onOpenWorldEditPanel = useCallback(() => {
    if (!loadedWorld) return;
    setEditingWorld(getWorldFormFromWorld(loadedWorld));
    setPanelMode('edit-world');
    setPanelOpen(true);
  }, [loadedWorld]);

  const refreshWorldDetails = useCallback(async (worldId) => {
    const result = await api.loadWorld(worldId);
    if (!result?.success || !result?.world) {
      throw new Error(result?.message || result?.error || 'Failed to refresh world.');
    }
    setLoadedWorld(result.world);
    if (Array.isArray(result.sessions)) {
      const nextSessions = sortSessionsByNewest(result.sessions);
      setSessions(nextSessions);
      setSelectedSessionId((currentId) =>
        currentId && nextSessions.some((session) => session.id === currentId)
          ? currentId
          : nextSessions[0]?.id || null
      );
    }
  }, [api]);

  const onOpenCreateAgentPanel = useCallback(() => {
    if (!loadedWorld?.id) {
      setStatusText('Load a world before creating an agent.', 'error');
      return;
    }
    setSelectedAgentId(null);
    setCreatingAgent(DEFAULT_AGENT_FORM);
    setPanelMode('create-agent');
    setPanelOpen(true);
  }, [loadedWorld, setStatusText]);

  const onOpenEditAgentPanel = useCallback((agentId) => {
    const targetAgent = worldAgents.find((agent) => agent.id === agentId);
    if (!targetAgent) {
      setStatusText('Agent not found.', 'error');
      return;
    }

    setSelectedAgentId(targetAgent.id);
    setEditingAgent({
      id: targetAgent.id,
      name: targetAgent.name,
      type: targetAgent.type || 'assistant',
      provider: targetAgent.provider || 'openai',
      model: targetAgent.model || 'gpt-4o-mini',
      systemPrompt: targetAgent.systemPrompt || '',
      temperature: targetAgent.temperature ?? '',
      maxTokens: targetAgent.maxTokens ?? ''
    });
    setPanelMode('edit-agent');
    setPanelOpen(true);
  }, [worldAgents, setStatusText]);

  const onUpdateWorld = useCallback(async (event) => {
    event.preventDefault();
    if (!loadedWorld?.id) {
      setStatusText('No world loaded to update.', 'error');
      return;
    }

    const validation = validateWorldForm(editingWorld);
    if (!validation.valid) {
      setStatusText(validation.error, 'error');
      return;
    }

    setUpdatingWorld(true);
    try {
      const updated = await api.updateWorld(loadedWorld.id, validation.data);

      setLoadedWorld(updated);
      setAvailableWorlds((worlds) =>
        worlds.map((world) => (world.id === updated.id ? { id: updated.id, name: updated.name } : world))
      );
      setPanelOpen(false);
      setPanelMode('create-world');
      setStatusText(`World updated: ${updated.name}`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to update world.'), 'error');
    } finally {
      setUpdatingWorld(false);
    }
  }, [api, editingWorld, loadedWorld, setStatusText]);

  const onCreateAgent = useCallback(async (event) => {
    event.preventDefault();
    if (!loadedWorld?.id) {
      setStatusText('No world loaded for agent creation.', 'error');
      return;
    }

    const validation = validateAgentForm(creatingAgent);
    if (!validation.valid) {
      setStatusText(validation.error, 'error');
      return;
    }

    setSavingAgent(true);
    try {
      await api.createAgent(loadedWorld.id, validation.data);

      await refreshWorldDetails(loadedWorld.id);
      setCreatingAgent(DEFAULT_AGENT_FORM);
      setPanelOpen(false);
      setPanelMode('create-world');
      setStatusText(`Agent created: ${validation.data.name}`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to create agent.'), 'error');
    } finally {
      setSavingAgent(false);
    }
  }, [api, creatingAgent, loadedWorld, refreshWorldDetails, setStatusText]);

  const onUpdateAgent = useCallback(async (event) => {
    event.preventDefault();
    if (!loadedWorld?.id || !editingAgent.id) {
      setStatusText('Select an agent to update.', 'error');
      return;
    }

    const validation = validateAgentForm(editingAgent);
    if (!validation.valid) {
      setStatusText(validation.error, 'error');
      return;
    }

    setSavingAgent(true);
    try {
      await api.updateAgent(loadedWorld.id, editingAgent.id, validation.data);

      await refreshWorldDetails(loadedWorld.id);
      setPanelOpen(false);
      setPanelMode('create-world');
      setStatusText(`Agent updated: ${validation.data.name}`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to update agent.'), 'error');
    } finally {
      setSavingAgent(false);
    }
  }, [api, editingAgent, loadedWorld, refreshWorldDetails, setStatusText]);

  const onDeleteAgent = useCallback(async () => {
    if (!loadedWorld?.id || !editingAgent.id) {
      setStatusText('No agent selected to delete.', 'error');
      return;
    }

    const agentName = editingAgent.name || editingAgent.id;
    const shouldDelete = window.confirm(`Delete agent "${agentName}"? This action cannot be undone.`);
    if (!shouldDelete) return;

    setDeletingAgent(true);
    try {
      await api.deleteAgent(loadedWorld.id, editingAgent.id);

      await refreshWorldDetails(loadedWorld.id);
      setPanelOpen(false);
      setPanelMode('create-world');
      setSelectedAgentId(null);
      setStatusText(`Agent deleted: ${agentName}`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to delete agent.'), 'error');
    } finally {
      setDeletingAgent(false);
    }
  }, [api, editingAgent, loadedWorld, refreshWorldDetails, setStatusText]);

  const onDeleteWorld = useCallback(async () => {
    if (!loadedWorld?.id) {
      setStatusText('No world loaded to delete.', 'error');
      return;
    }

    const worldName = loadedWorld.name || loadedWorld.id;
    const shouldDelete = window.confirm(`Delete world "${worldName}"? This action cannot be undone.`);
    if (!shouldDelete) return;

    setDeletingWorld(true);
    try {
      await api.deleteWorld(loadedWorld.id);

      const worldsState = await api.loadWorldFromFolder();
      if (worldsState.success && Array.isArray(worldsState.worlds) && worldsState.worlds.length > 0) {
        setAvailableWorlds(worldsState.worlds);
        await onSelectWorld(worldsState.worlds[0].id);
      } else {
        setLoadedWorld(null);
        setSelectedAgentId(null);
        setAvailableWorlds([]);
        setSessions([]);
        setSelectedSessionId(null);
        setMessages([]);
        setWorldLoadError(worldsState.message || worldsState.error || 'No worlds found in this folder.');
      }

      setPanelOpen(false);
      setPanelMode('create-world');
      setStatusText(`World deleted: ${worldName}`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to delete world.'), 'error');
    } finally {
      setDeletingWorld(false);
    }
  }, [api, loadedWorld, onSelectWorld, setStatusText]);

  const onImportWorld = useCallback(async () => {
    try {
      const result = await api.importWorld();
      if (result.success) {
        // Add to available worlds list
        setAvailableWorlds((worlds) => [...worlds, { id: result.world.id, name: result.world.name }]);

        // Auto-select the imported world
        const nextSessions = sortSessionsByNewest(result.sessions || []);
        setLoadedWorld(result.world);
        setSelectedAgentId(null);
        setSessions(nextSessions);
        setSelectedSessionId(nextSessions[0]?.id || null);
        setWorldLoadError(null);

        setStatusText(`World imported: ${result.world.name}`, 'success');
        // Persist world selection
        await api.saveLastSelectedWorld(result.world.id);
      } else {
        setStatusText(result.message || result.error || 'Failed to import world', 'error');
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to import world.'), 'error');
    }
  }, [api, setStatusText]);

  const onSelectProject = useCallback(async () => {
    try {
      const result = await api.openWorkspace();
      if (!result.canceled && result.workspacePath) {
        setSelectedProjectPath(result.workspacePath);
        setStatusText(`Project selected: ${result.workspacePath}`, 'info');
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to select project folder.'), 'error');
    }
  }, [api, setStatusText]);

  const onClearProject = useCallback(() => {
    setSelectedProjectPath(null);
    setStatusText('Project cleared', 'info');
  }, [setStatusText]);

  const onCreateSession = useCallback(async () => {
    if (!loadedWorld?.id) {
      setStatusText('No world loaded. Please open a folder with a world first.', 'error');
      return;
    }

    try {
      const result = await api.createSession(loadedWorld.id);
      const nextSessions = sortSessionsByNewest(result.sessions || []);
      setSessions(nextSessions);
      const nextSessionId = result.currentChatId || nextSessions[0]?.id || null;
      setSelectedSessionId(nextSessionId);
      if (nextSessionId) {
        await api.selectSession(loadedWorld.id, nextSessionId);
      }
      setStatusText('Chat session created.', 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to create session.'), 'error');
    }
  }, [api, loadedWorld, setStatusText]);

  const onSelectSession = useCallback(async (chatId) => {
    if (!loadedWorld?.id) return;
    const previousSessionId = selectedSessionId;
    messageRefreshCounter.current += 1;
    setMessages([]);
    setSelectedSessionId(chatId);
    try {
      await api.selectSession(loadedWorld.id, chatId);
    } catch (error) {
      setSelectedSessionId(previousSessionId);
      setStatusText(safeMessage(error, 'Failed to select session.'), 'error');
    }
  }, [api, loadedWorld, selectedSessionId, setStatusText]);

  const onDeleteSession = useCallback(async (chatId, event) => {
    event.stopPropagation();

    if (!loadedWorld?.id) return;
    const session = sessions.find((item) => item.id === chatId);
    const sessionName = session?.name || 'this session';
    if (!window.confirm(`Delete chat session "${sessionName}"?`)) return;

    setDeletingSessionId(chatId);
    try {
      const result = await api.deleteChat(loadedWorld.id, chatId);
      const nextSessions = sortSessionsByNewest(result.sessions || []);
      setSessions(nextSessions);
      const nextSessionId = result.currentChatId || nextSessions[0]?.id || null;
      setSelectedSessionId(nextSessionId);
      setStatusText('Chat session deleted.', 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to delete session.'), 'error');
    } finally {
      setDeletingSessionId(null);
    }
  }, [api, loadedWorld, sessions, setStatusText]);

  const onSendMessage = useCallback(async () => {
    if (loading.send) return;
    if (!loadedWorld?.id || !selectedSessionId) {
      setStatusText('Select a session before sending messages.', 'error');
      return;
    }
    const content = composer.trim();
    if (!content) return;

    setLoading((value) => ({ ...value, send: true }));
    try {
      await api.sendMessage({
        worldId: loadedWorld.id,
        chatId: selectedSessionId,
        content,
        sender: 'human'
      });
      setComposer('');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to send message.'), 'error');
    } finally {
      setLoading((value) => ({ ...value, send: false }));
    }
  }, [api, composer, loading.send, selectedSessionId, loadedWorld, setStatusText]);

  const onSubmitMessage = useCallback((event) => {
    event.preventDefault();
    onSendMessage();
  }, [onSendMessage]);

  /**
   * Enter edit mode for a user message
   * Shows textarea with current message text and Save/Cancel buttons
   */
  const onStartEditMessage = useCallback((messageId, currentText) => {
    setEditingMessageId(messageId);
    setEditingText(currentText || '');
  }, []);

  /**
   * Cancel edit mode and discard changes
   * Returns to normal message display
   */
  const onCancelEditMessage = useCallback(() => {
    setEditingMessageId(null);
    setEditingText('');
  }, []);

  /**
   * Save edited message using two-phase approach:
   * Phase 1: DELETE - Removes edited message and all subsequent messages from agent memories
   * Phase 2: POST - Resubmits edited content, triggering new agent responses via SSE streaming
   * 
   * This approach reuses existing SSE infrastructure and maintains conversation flow integrity.
   * localStorage backup created before DELETE for recovery if POST fails.
   * 
   * Error handling:
   * - 423 Locked: World is processing, user should retry
   * - 404 Not Found: Message already deleted
   * - 400 Bad Request: Invalid message type (only user messages editable)
   * - Partial failures: Some agents succeeded, others failed (shows which agents failed)
   */
  const onSaveEditMessage = useCallback(async (message) => {
    const editedText = editingText.trim();
    if (!editedText) {
      setStatusText('Message cannot be empty', 'error');
      return;
    }

    if (!message.messageId) {
      setStatusText('Cannot edit: message not saved yet', 'error');
      return;
    }

    if (!selectedSessionId) {
      setStatusText('Cannot edit: no active chat session', 'error');
      return;
    }

    if (!loadedWorld?.id) {
      setStatusText('Cannot edit: no world loaded', 'error');
      return;
    }

    // Store backup in localStorage
    const backup = {
      messageId: message.messageId,
      chatId: selectedSessionId,
      newContent: editedText,
      timestamp: Date.now(),
      worldId: loadedWorld.id
    };
    try {
      localStorage.setItem('agent-world-desktop-edit-backup', JSON.stringify(backup));
    } catch (e) {
      console.warn('Failed to save edit backup:', e);
    }

    // Optimistic update: remove edited message and all subsequent messages
    const editedIndex = messages.findIndex(m => m.id === message.id);
    const optimisticMessages = editedIndex >= 0 ? messages.slice(0, editedIndex) : messages;
    setMessages(optimisticMessages);
    setEditingMessageId(null);
    setEditingText('');

    try {
      // Phase 1: DELETE - remove messages from backend
      const deleteResult = await api.deleteMessage(loadedWorld.id, message.messageId, selectedSessionId);

      // Check for failures
      if (!deleteResult.success) {
        const failedAgents = deleteResult.failedAgents || [];
        if (failedAgents.length > 0) {
          const errors = failedAgents.map(f => `${f.agentId}: ${f.error}`).join(', ');
          throw new Error(`Delete failed for some agents: ${errors}`);
        }
        throw new Error('Failed to delete message');
      }

      // Phase 2: POST - resubmit edited message
      try {
        await api.sendMessage({
          worldId: loadedWorld.id,
          chatId: selectedSessionId,
          content: editedText,
          sender: 'human'
        });

        // Clear backup on success
        try {
          localStorage.removeItem('agent-world-desktop-edit-backup');
        } catch (e) {
          console.warn('Failed to clear edit backup:', e);
        }

        setStatusText('Message edited successfully', 'success');
      } catch (resubmitError) {
        setStatusText(
          `Messages removed but resubmission failed: ${resubmitError.message}. Please try editing again.`,
          'error'
        );
        // Reload messages on POST error
        await refreshMessages(loadedWorld.id, selectedSessionId);
      }
    } catch (error) {
      let errorMessage = error.message || 'Failed to edit message';

      if (error.message?.includes('423')) {
        errorMessage = 'Cannot edit: world is processing. Please try again in a moment.';
      } else if (error.message?.includes('404')) {
        errorMessage = 'Message not found. It may have been already deleted.';
      } else if (error.message?.includes('400')) {
        errorMessage = 'Invalid message: only user messages can be edited.';
      }

      setStatusText(errorMessage, 'error');
      // Reload messages on error
      await refreshMessages(loadedWorld.id, selectedSessionId);
    }
  }, [api, editingText, loadedWorld, selectedSessionId, messages, setStatusText, refreshMessages]);

  /**
   * Delete user message and all subsequent messages from conversation
   * Shows confirmation dialog with message preview before deletion
   * 
   * After successful deletion:
   * 1. Reloads world data via loadWorld IPC
   * 2. Rebuilds message list from agent memories
   * 3. Applies deduplication for multi-agent scenarios
   * 
   * Handles partial failures where some agents succeed and others fail.
   */
  const onDeleteMessage = useCallback(async (message) => {
    if (!message.messageId || !selectedSessionId) return;

    const preview = (message.content || '').substring(0, 100);
    const previewText = preview.length < (message.content || '').length ? `${preview}...` : preview;
    const confirmed = window.confirm(
      `Delete this message and all responses after it?\n\n"${previewText}"`
    );
    if (!confirmed) return;

    setDeletingMessageId(message.id);
    try {
      // Call DELETE via IPC
      const deleteResult = await api.deleteMessage(loadedWorld.id, message.messageId, selectedSessionId);

      // Check for failures
      if (!deleteResult.success) {
        const failedAgents = deleteResult.failedAgents || [];
        if (failedAgents.length > 0 && failedAgents.length < deleteResult.totalAgents) {
          const errors = failedAgents.map(f => f.agentId).join(', ');
          setStatusText(`Partial failure - failed for agents: ${errors}`, 'error');
        } else {
          throw new Error(deleteResult.error || 'Failed to delete message');
        }
      }

      // Reload world via existing loadWorld IPC
      const reloadResult = await api.loadWorld(loadedWorld.id);
      if (!reloadResult.success) {
        throw new Error('Failed to reload world after delete');
      }

      // Rebuild messages from agent memory
      const world = reloadResult.world;
      const agents = world.agents || [];
      let newMessages = [];

      for (const agent of agents) {
        for (const memoryItem of agent.memory || []) {
          if (memoryItem.chatId === selectedSessionId) {
            newMessages.push(createMessageFromMemory(memoryItem, agent.name));
          }
        }
      }

      // Apply deduplication
      newMessages = deduplicateMessages(newMessages, agents);

      setMessages(newMessages);
      setLoadedWorld(world);
      setStatusText('Message deleted successfully', 'success');
    } catch (error) {
      setStatusText(error.message || 'Failed to delete message', 'error');
    } finally {
      setDeletingMessageId(null);
    }
  }, [api, loadedWorld, selectedSessionId, setStatusText]);

  const onComposerKeyDown = useCallback((event) => {
    if (event.nativeEvent?.isComposing || event.keyCode === 229) {
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (composer.trim() && !loading.send) {
        onSendMessage();
      }
    }
  }, [composer, loading.send, onSendMessage]);

  useEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const lineHeight = Number.parseInt(window.getComputedStyle(textarea).lineHeight, 10) || 20;
    const maxHeight = lineHeight * COMPOSER_MAX_ROWS;
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
  }, [composer]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const hasNewMessage = messages.length > previousMessageCountRef.current;
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: hasNewMessage ? 'smooth' : 'auto'
      });
    });
    previousMessageCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (!selectedSessionId) return;
    const composerTextarea = composerTextareaRef.current;
    if (!composerTextarea) return;
    composerTextarea.focus({ preventScroll: true });
  }, [selectedSessionId]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full">
        <aside
          className={`flex min-h-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground overflow-hidden transition-all duration-200 ${leftSidebarCollapsed ? 'w-0 border-r-0 p-0 opacity-0' : 'w-80 px-4 pb-4 pt-2 opacity-100'
            }`}
        >
          <div className="mb-3 flex h-8 shrink-0 items-start justify-end gap-2" style={DRAG_REGION_STYLE}>
            <button
              type="button"
              onClick={() => setLeftSidebarCollapsed(true)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              style={NO_DRAG_REGION_STYLE}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <polyline points="15 6 9 12 15 18" />
              </svg>
            </button>
          </div>

          <div className="mb-4 shrink-0 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="uppercase tracking-wide text-sidebar-foreground/70">
                Worlds {availableWorlds.length > 0 ? `(${availableWorlds.length})` : ''}
              </div>
              <div className="flex items-center gap-1" style={NO_DRAG_REGION_STYLE}>
                <button
                  type="button"
                  onClick={onOpenCreateWorldPanel}
                  className="rounded p-1 text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                  title="Create new world"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={onImportWorld}
                  className="rounded p-1 text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                  title="Import world from folder"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
                    <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="relative" ref={workspaceDropdownRef} style={NO_DRAG_REGION_STYLE}>
              <button
                type="button"
                onClick={() => setWorkspaceMenuOpen((value) => !value)}
                className="flex w-full items-center justify-between rounded-md border border-sidebar-border bg-sidebar px-2 py-2 text-left text-sidebar-foreground hover:bg-sidebar-accent"
              >
                <span className="truncate">
                  {loadedWorld?.name || (availableWorlds.length > 0 ? 'Select a world' : 'No worlds available')}
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`ml-2 h-4 w-4 shrink-0 transition-transform ${workspaceMenuOpen ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {workspaceMenuOpen ? (
                <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-auto rounded-md border border-sidebar-border bg-sidebar p-1 shadow-lg">
                  {availableWorlds.length === 0 ? (
                    <div className="px-2 py-1.5 text-sidebar-foreground/70">No worlds available</div>
                  ) : (
                    availableWorlds.map((world) => (
                      <button
                        key={world.id}
                        type="button"
                        onClick={() => onSelectWorld(world.id)}
                        className={`flex w-full items-center rounded px-2 py-1.5 text-left text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${loadedWorld?.id === world.id ? 'bg-sidebar-accent' : ''
                          }`}
                        title={world.id}
                      >
                        <span className="truncate">{world.name}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>
          {/* World Info Section */}
          {loadingWorld ? (
            <div className="mb-4 shrink-0 rounded-md border border-sidebar-border bg-sidebar-accent p-4 text-xs">
              <div className="flex items-center gap-2 text-sidebar-foreground">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Loading world from folder...</span>
              </div>
            </div>
          ) : worldLoadError ? (
            <div className="mb-4 shrink-0 rounded-md border border-sidebar-border bg-sidebar-accent p-4 text-xs">
              <div className="mb-2 text-sidebar-foreground">
                {worldLoadError}
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={onOpenCreateWorldPanel}
                  className="w-full rounded border border-sidebar-border px-2 py-1.5 text-sidebar-foreground hover:bg-sidebar hover:border-sidebar-primary"
                >
                  Create a World
                </button>
              </div>
            </div>
          ) : availableWorlds.length === 0 && !worldLoadError ? (
            <div className="mb-4 shrink-0 rounded-md border border-sidebar-border bg-sidebar-accent p-4 text-xs">
              <div className="mb-2 font-medium text-sidebar-foreground">
                No worlds available
              </div>
              <div className="mb-2 text-sidebar-foreground/70">
                Create your first world or import an existing one
              </div>
              <div className="text-[10px] text-sidebar-foreground/60">
                Tip: Use the + button above to create a new world
              </div>
            </div>
          ) : loadedWorld ? (
            <div className="mb-4 shrink-0 space-y-2 text-xs">
              <div className="uppercase tracking-wide text-sidebar-foreground/70">World Info</div>
              <div className="rounded-md border border-sidebar-border bg-sidebar-accent p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-sidebar-foreground truncate" title={loadedWorld.name}>
                    {loadedWorld.name}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={onOpenWorldEditPanel}
                      disabled={updatingWorld || deletingWorld}
                      className="rounded p-1 text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      title="Edit world"
                      aria-label="Edit world"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={onDeleteWorld}
                      disabled={deletingWorld || updatingWorld}
                      className="rounded p-1 text-sidebar-foreground transition-colors hover:bg-destructive/20 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                      title="Delete world"
                      aria-label="Delete world"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                {loadedWorld.description ? (
                  <div className="mb-2 text-sidebar-foreground/80">
                    {loadedWorld.description}
                  </div>
                ) : null}
                <div className="space-y-1 text-sidebar-foreground/80">
                  <div>
                    Agents: {loadedWorld.totalAgents} | Turn Limit: {loadedWorld.turnLimit} | Messages: {loadedWorld.totalMessages}
                  </div>
                </div>
              </div>
            </div>
          ) : availableWorlds.length > 0 ? (
            <div className="mb-4 shrink-0 rounded-md border border-dashed border-sidebar-border p-3 text-xs text-sidebar-foreground/70">
              Select a world from the dropdown above
            </div>
          ) : null}
          <div className="mb-2 flex shrink-0 items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-sidebar-foreground/70">Chat Sessions</div>
            <button
              type="button"
              onClick={onCreateSession}
              disabled={!loadedWorld}
              className="flex h-7 w-7 items-center justify-center rounded text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground disabled:cursor-not-allowed disabled:opacity-50"
              title={!loadedWorld ? 'Load a world first' : 'Create new session'}
              aria-label={!loadedWorld ? 'Load a world first' : 'Create new session'}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>

          <div className="mb-2 shrink-0">
            <input
              type="text"
              value={sessionSearch}
              onChange={(event) => setSessionSearch(event.target.value)}
              placeholder="Search sessions..."
              className="w-full rounded-md border border-sidebar-border bg-sidebar px-2 py-1 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/60 focus:border-sidebar-ring"
              aria-label="Search chat sessions"
            />
          </div>

          <div className="flex-1 min-h-0 space-y-1 overflow-auto pr-1">
            {sessions.length === 0 ? (
              <div className="rounded-md border border-dashed border-sidebar-border p-3 text-xs text-sidebar-foreground/70">
                {loadedWorld ? 'No sessions yet.' : 'No world loaded.'}
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="rounded-md border border-dashed border-sidebar-border p-3 text-xs text-sidebar-foreground/70">
                No matching sessions.
              </div>
            ) : (
              filteredSessions.map((session) => (
                <div
                  key={session.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectSession(session.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectSession(session.id);
                    }
                  }}
                  className={`group w-full rounded-md pl-2 pr-0 py-1 text-left text-xs ${selectedSessionId === session.id
                    ? 'bg-sidebar-session-selected text-sidebar-foreground'
                    : 'bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground'
                    }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="min-w-0 flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${selectedSessionId === session.id
                          ? 'bg-sidebar-foreground/75'
                          : 'bg-sidebar-foreground/35 group-hover:bg-sidebar-foreground/55'
                          }`}
                        aria-hidden="true"
                      />
                      <div className="truncate text-[11px] font-medium leading-[1.05]">{session.name}</div>
                    </div>
                    <div className="relative h-5 w-7 shrink-0 -mr-1">
                      <span
                        className={`absolute inset-0 inline-flex items-center justify-center rounded-full border border-sidebar-border bg-sidebar-accent px-1.5 text-[10px] font-medium leading-none text-sidebar-foreground/80 transition-opacity ${deletingSessionId === session.id
                          ? 'opacity-0'
                          : 'opacity-100 group-hover:opacity-0 group-focus-within:opacity-0'
                          }`}
                        aria-hidden="true"
                      >
                        {session.messageCount}
                      </span>
                      <button
                        type="button"
                        onClick={(event) => onDeleteSession(session.id, event)}
                        disabled={deletingSessionId === session.id}
                        className={`absolute inset-0 flex items-center justify-center rounded text-sidebar-foreground/70 transition-all hover:bg-destructive/20 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50 ${deletingSessionId === session.id
                          ? 'opacity-100'
                          : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                          }`}
                        title="Delete session"
                        aria-label={`Delete session ${session.name}`}
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col bg-background">
          <header
            className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b border-border pb-3 pt-2 ${leftSidebarCollapsed ? 'pl-24 pr-5' : 'px-5'
              }`}
            style={DRAG_REGION_STYLE}
          >
            <div className="flex min-w-0 items-center gap-3">
              {leftSidebarCollapsed ? (
                <button
                  type="button"
                  onClick={() => setLeftSidebarCollapsed(false)}
                  className="flex h-6 w-6 self-start items-center justify-center rounded-md bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  title="Show sidebar"
                  aria-label="Show sidebar"
                  style={NO_DRAG_REGION_STYLE}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </button>
              ) : null}
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {selectedWorld ? selectedWorld.name : 'No world selected'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedSession ? `${selectedSession.name}` : 'Select a session to start chatting'}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center" style={NO_DRAG_REGION_STYLE}>
              {selectedWorld ? (
                <div className="inline-flex items-center gap-2 rounded-md bg-card/70 px-2 py-1">
                  {visibleWorldAgents.map((agent, index) => (
                    <button
                      key={`${agent.id}-${index}`}
                      type="button"
                      onClick={() => onOpenEditAgentPanel(agent.id)}
                      className="relative flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80"
                      title={`${agent.name} • ${agent.messageCount} message${agent.messageCount === 1 ? '' : 's'}`}
                      aria-label={`Edit agent ${agent.name}`}
                    >
                      {agent.initials}
                      <span className="pointer-events-none absolute -top-1 -right-1 min-w-4 rounded-full border border-border/70 bg-card px-1 text-[9px] font-medium leading-4 text-foreground/80">
                        {agent.messageCount}
                      </span>
                    </button>
                  ))}
                  {hiddenWorldAgentCount > 0 ? (
                    <div
                      className="flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-medium text-muted-foreground"
                      title={`${hiddenWorldAgentCount} more agent${hiddenWorldAgentCount > 1 ? 's' : ''}`}
                      aria-label={`${hiddenWorldAgentCount} more agents`}
                    >
                      +{hiddenWorldAgentCount}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={onOpenCreateAgentPanel}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/80"
                    title="Add new agent"
                    aria-label="Add new agent"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2" style={NO_DRAG_REGION_STYLE}>
              <div className="inline-flex items-center rounded-md border border-input bg-card p-0.5">
                {['system', 'light', 'dark'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setThemePreference(mode)}
                    className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${themePreference === mode
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                    title={`Use ${mode} theme`}
                    aria-label={`Use ${mode} theme`}
                  >
                    {mode === 'system' ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                      >
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                      </svg>
                    ) : mode === 'light' ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                      >
                        <circle cx="12" cy="12" r="4" />
                        <line x1="12" y1="2" x2="12" y2="4" />
                        <line x1="12" y1="20" x2="12" y2="22" />
                        <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
                        <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
                        <line x1="2" y1="12" x2="4" y2="12" />
                        <line x1="20" y1="12" x2="22" y2="12" />
                        <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
                        <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                      >
                        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
                      </svg>
                    )}
                    <span className="sr-only capitalize">{mode}</span>
                  </button>
                ))}
              </div>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <section className="flex min-w-0 flex-1 flex-col">
              <div ref={messagesContainerRef} className="flex-1 overflow-auto p-5">
                <div className="mx-auto w-full max-w-[750px] space-y-3">
                  {messages.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                      {selectedSession
                        ? 'No message yet. Send your first message.'
                        : 'Select a session from the left column.'}
                    </div>
                  ) : (
                    messages.map((message, messageIndex) => {
                      const senderLabel = getMessageSenderLabel(message, messagesById, messages, messageIndex);
                      const messageKey = message.messageId || message.id;
                      return (
                        <article
                          key={messageKey}
                          className={getMessageCardClassName(message)}
                        >
                          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{senderLabel}</span>
                            <span>{formatTime(message.createdAt)}</span>
                          </div>

                          {editingMessageId === message.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                className="w-full rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-sidebar-foreground outline-none focus:border-sidebar-ring focus:ring-2 focus:ring-sidebar-ring/20 resize-none transition-all"
                                rows={3}
                                autoFocus
                                placeholder="Edit your message..."
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    onCancelEditMessage();
                                  }
                                }}
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => onSaveEditMessage(message)}
                                  disabled={!editingText.trim()}
                                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={onCancelEditMessage}
                                  className="rounded-md border border-sidebar-border bg-sidebar px-3 py-1.5 text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent focus:outline-none focus:ring-2 focus:ring-sidebar-ring/50 transition-all"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <MessageContent message={message} />
                          )}

                          {message.isStreaming ? (
                            <ThinkingIndicator className="mt-2" />
                          ) : null}

                          {/* Action buttons - show on hover in lower right */}
                          {isHumanMessage(message) && message.messageId && editingMessageId !== message.id ? (
                            <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => onStartEditMessage(message.id, message.content)}
                                disabled={!message.messageId}
                                className="rounded p-1 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-foreground/10 focus:outline-none focus:ring-2 focus:ring-sidebar-ring disabled:opacity-30 disabled:cursor-not-allowed transition-all bg-background/80 backdrop-blur-sm"
                                title="Edit message"
                                aria-label="Edit message"
                              >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteMessage(message)}
                                disabled={deletingMessageId === message.id}
                                className="rounded p-1 text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-destructive/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all bg-background/80 backdrop-blur-sm"
                                title="Delete message"
                                aria-label="Delete message"
                              >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ) : null}
                        </article>
                      );
                    })
                  )}
                  {/* Activity indicators at bottom of messages */}
                  {isBusy ? (
                    <div className="mt-4 space-y-3 rounded-lg border border-border/50 bg-card/50 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <ActivityPulse isActive={isBusy} />
                          <span className="text-xs font-medium text-foreground">Processing...</span>
                          <AgentQueueDisplay count={activeStreamCount} />
                        </div>
                        <ElapsedTimeCounter elapsedMs={elapsedMs} />
                      </div>
                      {activeTools.length > 0 ? (
                        <ToolExecutionStatus tools={activeTools} />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <form onSubmit={onSubmitMessage} className="p-4">
                <div className="mx-auto flex w-full max-w-[750px] flex-col gap-2 rounded-lg border border-input bg-card p-3">
                  <textarea
                    ref={composerTextareaRef}
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={onComposerKeyDown}
                    rows={1}
                    placeholder="Send a message..."
                    className="w-full resize-none bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    aria-label="Message input"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Attach file"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-5 w-5"
                        >
                          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={onSelectProject}
                        className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Select project folder"
                        title="Select project folder for context"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                        >
                          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                        </svg>
                        <span>Project</span>
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={loading.send || !composer.trim()}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Send message"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5"
                      >
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                    </button>
                  </div>
                  {selectedProjectPath ? (
                    <div className="flex items-center justify-between border-t border-border pt-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-3.5 w-3.5 shrink-0"
                        >
                          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                        </svg>
                        <span className="truncate" title={selectedProjectPath}>
                          Project: {selectedProjectPath}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={onClearProject}
                        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Clear project"
                        title="Clear project"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-3.5 w-3.5"
                        >
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : null}
                </div>
              </form>
            </section>

            <aside
              className={`border-l border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 ${panelOpen ? 'w-80 p-4 opacity-100' : 'w-0 p-0 opacity-0'
                }`}
            >
              {panelOpen ? (
                <div className="flex h-full flex-col">
                  <h2 className="mb-3 text-xs uppercase tracking-wide text-sidebar-foreground/70">
                    {panelMode === 'edit-world'
                      ? 'Edit World'
                      : panelMode === 'create-agent'
                        ? 'Create Agent'
                        : panelMode === 'edit-agent'
                          ? 'Edit Agent'
                          : 'Create World'}
                  </h2>

                  <div className="min-h-0 flex flex-1 flex-col overflow-y-auto">
                    {panelMode === 'edit-world' && loadedWorld ? (
                      <>
                        <form onSubmit={onUpdateWorld} className="flex min-h-0 flex-1 flex-col">
                          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                            <div className="rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-xs text-sidebar-foreground/80">
                              Name: {editingWorld.name}
                            </div>
                            <textarea
                              value={editingWorld.description}
                              onChange={(event) => setEditingWorld((value) => ({ ...value, description: event.target.value }))}
                              placeholder="Description (optional)"
                              className="h-20 w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                              disabled={updatingWorld || deletingWorld}
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <select
                                value={editingWorld.chatLLMProvider}
                                onChange={(event) => setEditingWorld((value) => ({ ...value, chatLLMProvider: event.target.value }))}
                                className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none focus:border-sidebar-ring"
                                disabled={updatingWorld || deletingWorld}
                              >
                                <option value="">Select provider</option>
                                {WORLD_PROVIDER_OPTIONS.map((provider) => (
                                  <option key={provider.value} value={provider.value}>
                                    {provider.label}
                                  </option>
                                ))}
                              </select>
                              <input
                                value={editingWorld.chatLLMModel}
                                onChange={(event) => setEditingWorld((value) => ({ ...value, chatLLMModel: event.target.value }))}
                                placeholder="Chat LLM model"
                                className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                                disabled={updatingWorld || deletingWorld}
                              />
                            </div>
                            <input
                              type="number"
                              min={MIN_TURN_LIMIT}
                              max="50"
                              value={editingWorld.turnLimit}
                              onChange={(event) => setEditingWorld((value) => ({ ...value, turnLimit: Number(event.target.value) || MIN_TURN_LIMIT }))}
                              className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                              disabled={updatingWorld || deletingWorld}
                            />
                            <div className="relative flex-1 flex flex-col">
                              <textarea
                                value={editingWorld.mcpConfig}
                                onChange={(event) => setEditingWorld((value) => ({ ...value, mcpConfig: event.target.value }))}
                                placeholder="Enter MCP servers configuration as JSON..."
                                className="min-h-24 w-full flex-1 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 font-mono text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                                disabled={updatingWorld || deletingWorld}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setMcpEditorValue(editingWorld.mcpConfig);
                                  setMcpEditorTarget('edit');
                                  setMcpEditorOpen(true);
                                }}
                                className="absolute right-2 top-2 rounded p-1 text-sidebar-foreground/50 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                                title="Expand editor"
                              >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div className="mt-auto flex justify-end gap-2 border-t border-sidebar-border bg-sidebar pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                setPanelMode('create-world');
                                setPanelOpen(false);
                              }}
                              disabled={updatingWorld || deletingWorld}
                              className="rounded-xl border border-sidebar-border px-3 py-1 text-xs text-sidebar-foreground hover:bg-sidebar-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={updatingWorld || deletingWorld}
                              className="rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Save
                            </button>
                          </div>
                        </form>
                      </>
                    ) : panelMode === 'create-agent' && loadedWorld ? (
                      <>
                        <form onSubmit={onCreateAgent} className="flex min-h-0 flex-1 flex-col">
                          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                            <input
                              value={creatingAgent.name}
                              onChange={(event) => setCreatingAgent((value) => ({ ...value, name: event.target.value }))}
                              placeholder="Agent name"
                              className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                              disabled={savingAgent}
                            />
                            <input
                              value={creatingAgent.type}
                              onChange={(event) => setCreatingAgent((value) => ({ ...value, type: event.target.value }))}
                              placeholder="Agent type"
                              className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                              disabled={savingAgent}
                            />
                            <select
                              value={creatingAgent.provider}
                              onChange={(event) => setCreatingAgent((value) => ({ ...value, provider: event.target.value }))}
                              className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none focus:border-sidebar-ring"
                              disabled={savingAgent}
                            >
                              {AGENT_PROVIDER_OPTIONS.map((provider) => (
                                <option key={provider} value={provider}>
                                  {provider}
                                </option>
                              ))}
                            </select>
                            <input
                              value={creatingAgent.model}
                              onChange={(event) => setCreatingAgent((value) => ({ ...value, model: event.target.value }))}
                              placeholder="Model (for example: gpt-4o-mini)"
                              className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                              disabled={savingAgent}
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="number"
                                step="0.1"
                                value={creatingAgent.temperature}
                                onChange={(event) => setCreatingAgent((value) => ({ ...value, temperature: event.target.value }))}
                                placeholder="Temperature"
                                className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                                disabled={savingAgent}
                              />
                              <input
                                type="number"
                                min="1"
                                value={creatingAgent.maxTokens}
                                onChange={(event) => setCreatingAgent((value) => ({ ...value, maxTokens: event.target.value }))}
                                placeholder="Max tokens"
                                className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                                disabled={savingAgent}
                              />
                            </div>
                            <div className="relative flex-1 flex flex-col">
                              <textarea
                                value={creatingAgent.systemPrompt}
                                onChange={(event) => setCreatingAgent((value) => ({ ...value, systemPrompt: event.target.value }))}
                                placeholder="System prompt (optional)"
                                className="min-h-24 w-full flex-1 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                                disabled={savingAgent}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setPromptEditorValue(creatingAgent.systemPrompt);
                                  setPromptEditorTarget('create');
                                  setPromptEditorOpen(true);
                                }}
                                className="absolute right-2 top-2 rounded p-1 text-sidebar-foreground/50 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                                title="Expand editor"
                              >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div className="mt-auto flex justify-end gap-2 border-t border-sidebar-border bg-sidebar pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                setPanelOpen(false);
                                setPanelMode('create-world');
                              }}
                              disabled={savingAgent}
                              className="rounded-xl border border-sidebar-border px-3 py-1 text-xs text-sidebar-foreground hover:bg-sidebar-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={savingAgent}
                              className="rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingAgent ? 'Creating...' : 'Create'}
                            </button>
                          </div>
                        </form>
                      </>
                    ) : panelMode === 'edit-agent' && loadedWorld && selectedAgentForPanel ? (
                      <>
                        <form onSubmit={onUpdateAgent} className="flex min-h-0 flex-1 flex-col">
                          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                            <div className="flex items-center gap-2">
                              <input
                                value={editingAgent.name}
                                onChange={(event) => setEditingAgent((value) => ({ ...value, name: event.target.value }))}
                                placeholder="Agent name"
                                className="flex-1 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                                disabled={savingAgent || deletingAgent}
                              />
                              <button
                                type="button"
                                onClick={onDeleteAgent}
                                disabled={savingAgent || deletingAgent}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-destructive/20 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                                title="Delete agent"
                                aria-label="Delete agent"
                              >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                            <input
                              value={editingAgent.type}
                              onChange={(event) => setEditingAgent((value) => ({ ...value, type: event.target.value }))}
                              placeholder="Agent type"
                              className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                              disabled={savingAgent || deletingAgent}
                            />
                            <select
                              value={editingAgent.provider}
                              onChange={(event) => setEditingAgent((value) => ({ ...value, provider: event.target.value }))}
                              className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none focus:border-sidebar-ring"
                              disabled={savingAgent || deletingAgent}
                            >
                              {AGENT_PROVIDER_OPTIONS.map((provider) => (
                                <option key={provider} value={provider}>
                                  {provider}
                                </option>
                              ))}
                            </select>
                            <input
                              value={editingAgent.model}
                              onChange={(event) => setEditingAgent((value) => ({ ...value, model: event.target.value }))}
                              placeholder="Model (for example: gpt-4o-mini)"
                              className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                              disabled={savingAgent || deletingAgent}
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="number"
                                step="0.1"
                                value={editingAgent.temperature}
                                onChange={(event) => setEditingAgent((value) => ({ ...value, temperature: event.target.value }))}
                                placeholder="Temperature"
                                className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                                disabled={savingAgent || deletingAgent}
                              />
                              <input
                                type="number"
                                min="1"
                                value={editingAgent.maxTokens}
                                onChange={(event) => setEditingAgent((value) => ({ ...value, maxTokens: event.target.value }))}
                                placeholder="Max tokens"
                                className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                                disabled={savingAgent || deletingAgent}
                              />
                            </div>
                            <div className="relative flex-1 flex flex-col">
                              <textarea
                                value={editingAgent.systemPrompt}
                                onChange={(event) => setEditingAgent((value) => ({ ...value, systemPrompt: event.target.value }))}
                                placeholder="System prompt (optional)"
                                className="min-h-24 w-full flex-1 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                                disabled={savingAgent || deletingAgent}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setPromptEditorValue(editingAgent.systemPrompt);
                                  setPromptEditorTarget('edit');
                                  setPromptEditorOpen(true);
                                }}
                                className="absolute right-2 top-2 rounded p-1 text-sidebar-foreground/50 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                                title="Expand editor"
                              >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div className="mt-auto flex justify-end gap-2 border-t border-sidebar-border bg-sidebar pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                setPanelOpen(false);
                                setPanelMode('create-world');
                                setSelectedAgentId(null);
                              }}
                              disabled={savingAgent || deletingAgent}
                              className="rounded-xl border border-sidebar-border px-3 py-1 text-xs text-sidebar-foreground hover:bg-sidebar-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={savingAgent || deletingAgent}
                              className="rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingAgent ? 'Saving...' : deletingAgent ? 'Deleting...' : 'Save'}
                            </button>
                          </div>
                        </form>
                      </>
                    ) : (
                      <>
                        <form onSubmit={onCreateWorld} className="flex min-h-0 flex-1 flex-col">
                          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                            <input
                              value={creatingWorld.name}
                              onChange={(event) => setCreatingWorld((value) => ({ ...value, name: event.target.value }))}
                              placeholder="World name"
                              className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                            />
                            <textarea
                              value={creatingWorld.description}
                              onChange={(event) => setCreatingWorld((value) => ({ ...value, description: event.target.value }))}
                              placeholder="Description (optional)"
                              className="h-20 w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <select
                                value={creatingWorld.chatLLMProvider}
                                onChange={(event) => setCreatingWorld((value) => ({ ...value, chatLLMProvider: event.target.value }))}
                                className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none focus:border-sidebar-ring"
                              >
                                <option value="">Select provider</option>
                                {WORLD_PROVIDER_OPTIONS.map((provider) => (
                                  <option key={provider.value} value={provider.value}>
                                    {provider.label}
                                  </option>
                                ))}
                              </select>
                              <input
                                value={creatingWorld.chatLLMModel}
                                onChange={(event) => setCreatingWorld((value) => ({ ...value, chatLLMModel: event.target.value }))}
                                placeholder="Chat LLM model"
                                className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                              />
                            </div>
                            <input
                              type="number"
                              min={MIN_TURN_LIMIT}
                              max="50"
                              value={creatingWorld.turnLimit}
                              onChange={(event) => setCreatingWorld((value) => ({ ...value, turnLimit: Number(event.target.value) || MIN_TURN_LIMIT }))}
                              className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                            />
                            <div className="relative flex-1 flex flex-col">
                              <textarea
                                value={creatingWorld.mcpConfig}
                                onChange={(event) => setCreatingWorld((value) => ({ ...value, mcpConfig: event.target.value }))}
                                placeholder="Enter MCP servers configuration as JSON..."
                                className="min-h-24 w-full flex-1 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 font-mono text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setMcpEditorValue(creatingWorld.mcpConfig);
                                  setMcpEditorTarget('create');
                                  setMcpEditorOpen(true);
                                }}
                                className="absolute right-2 top-2 rounded p-1 text-sidebar-foreground/50 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                                title="Expand editor"
                              >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div className="mt-auto flex justify-end gap-2 border-t border-sidebar-border bg-sidebar pt-2">
                            <button
                              type="button"
                              onClick={() => setPanelOpen(false)}
                              className="rounded-xl border border-sidebar-border px-3 py-1 text-xs text-sidebar-foreground hover:bg-sidebar-accent"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
                            >
                              Create
                            </button>
                          </div>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>

          {status.text ? (
            <div
              className={`border-t px-5 py-2 text-xs ${status.kind === 'error'
                ? 'border-destructive/40 bg-destructive/15 text-destructive'
                : status.kind === 'success'
                  ? 'border-secondary/40 bg-secondary/20 text-secondary-foreground'
                  : 'border-border bg-card text-muted-foreground'
                }`}
            >
              {status.text}
            </div>
          ) : null}
        </main>
      </div>

      {/* Prompt Editor Modal */}
      {promptEditorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="flex h-[80vh] w-[80vw] max-w-4xl flex-col rounded-lg border border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-medium text-foreground">Edit System Prompt</h3>
              <button
                type="button"
                onClick={() => setPromptEditorOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div className="flex-1 p-4">
              <textarea
                value={promptEditorValue}
                onChange={(event) => setPromptEditorValue(event.target.value)}
                placeholder="Enter system prompt..."
                className="h-full w-full resize-none rounded-md border border-input bg-card p-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setPromptEditorOpen(false)}
                className="rounded-md border border-input px-4 py-2 text-sm text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (promptEditorTarget === 'create') {
                    setCreatingAgent((value) => ({ ...value, systemPrompt: promptEditorValue }));
                  } else if (promptEditorTarget === 'edit') {
                    setEditingAgent((value) => ({ ...value, systemPrompt: promptEditorValue }));
                  }
                  setPromptEditorOpen(false);
                }}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* MCP Config Editor Modal */}
      {mcpEditorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="flex h-[80vh] w-[80vw] max-w-4xl flex-col rounded-lg border border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-medium text-foreground">Edit MCP Configuration</h3>
              <button
                type="button"
                onClick={() => setMcpEditorOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div className="flex-1 p-4">
              <textarea
                value={mcpEditorValue}
                onChange={(event) => setMcpEditorValue(event.target.value)}
                placeholder="Enter MCP servers configuration as JSON..."
                className="h-full w-full resize-none rounded-md border border-input bg-card p-4 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setMcpEditorOpen(false)}
                className="rounded-md border border-input px-4 py-2 text-sm text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mcpEditorTarget === 'create') {
                    setCreatingWorld((value) => ({ ...value, mcpConfig: mcpEditorValue }));
                  } else if (mcpEditorTarget === 'edit') {
                    setEditingWorld((value) => ({ ...value, mcpConfig: mcpEditorValue }));
                  }
                  setMcpEditorOpen(false);
                }}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
