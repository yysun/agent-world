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
 * - Message edit delegates to core-managed delete+resubmit flow via `message:edit` IPC
 * - Edit creates localStorage backup before mutation for recovery
 * - Message deduplication handles multi-agent scenarios (user messages shown once)
 *
 * Recent Changes:
 * - 2026-02-15: Suppressed reply-target sender labels when the replying agent has `autoReply` disabled; chat rows now show plain sender names in that mode.
 * - 2026-02-15: Updated welcome-card visibility to depend on user/assistant conversation messages only, so tool/system/error-only event rows do not hide onboarding content.
 * - 2026-02-15: Stabilized desktop chat layout by constraining horizontal overflow, top-aligning empty-session welcome content, and adding a bounded scroll area for long skill lists.
 * - 2026-02-15: Hardened message edit/delete chat targeting to require message-bound chat IDs and removed selected-session fallback for mutation requests.
 * - 2026-02-15: Fixed chat-id drift by preserving selected session during refresh and binding message/edit/delete actions to stable target chat IDs.
 * - 2026-02-14: Fixed inline `<agent> is working...` visibility to hide immediately when agent activity completes (no longer held open by residual stream-count state).
 * - 2026-02-14: Refined inline chat working indicator with borderless text row, flashing dot, active-work-only visibility, and stronger agent-name fallback resolution.
 * - 2026-02-14: Added inline chat activity indicator (`<agent> is working...`) under the message list to match web waiting UX.
 * - 2026-02-14: Reduced welcome skill-list vertical footprint (denser two-column cards + compact descriptions) so the new-chat welcome view avoids unnecessary vertical scrolling.
 * - 2026-02-14: Removed outer welcome-card borders and switched skills to a full single-column list so all skills remain visible without hidden overflow rows.
 * - 2026-02-14: Refreshed the new-chat welcome empty state with a cleaner minimal layout and compact skill cards.
 * - 2026-02-14: Added robust skill-registry loading states (loading/error/retry) and automatic refresh when workspace/world context changes.
 * - 2026-02-14: Added generic HITL option prompt modal flow driven by system events (`hitl-option-request`) with renderer response submission.
 * - 2026-02-14: Made the new-chat welcome card more compact/simple and added a scrollable skill list for large registries.
 * - 2026-02-14: Simplified new-chat welcome layout by removing nested border layers for a cleaner single-surface design.
 * - 2026-02-14: Refined welcome empty-state copy by removing session-name greeting and shortening helper text.
 * - 2026-02-14: Replaced empty-session placeholder with a centered welcome screen that lists skill-registry entries (name + description) in a muted, onboarding-style layout.
 * - 2026-02-14: Fixed world-info fallback parsing so null/blank totals no longer coerce to zero and now correctly use derived stats/default turn limit.
 * - 2026-02-14: Restored accessible switch labeling by wiring agent Auto Reply text to the switch control via aria-labelledby in extracted form fields.
 * - 2026-02-14: Broke renderer monolith into reusable components (`WorldInfoCard`, `ComposerBar`, `AgentFormFields`, `PromptEditorModal`, `WorldConfigEditorModal`) to simplify App.jsx.
 * - 2026-02-14: Fixed left-sidebar World Info stats to always show numeric agent/message counts using derived fallbacks when backend totals are absent.
 * - 2026-02-14: Updated composer toolbar visuals by switching the attachment icon to `+` and reducing attachment/project control sizing.
 * - 2026-02-14: Removed left padding from Auto Reply rows in agent create/edit forms.
 * - 2026-02-14: Updated agent Auto Reply rows to borderless styling and lighter switch tracks.
 * - 2026-02-14: Made form labels bold and standardized provider/model labels to `LLM Provider` and `LLM model` in world/agent create-edit forms.
 * - 2026-02-14: Darkened form label contrast to `text-sidebar-foreground/90`.
 * - 2026-02-14: Aligned agent Auto Reply label and switch on one row and removed explicit enabled/disabled text.
 * - 2026-02-14: Reduced agent Auto Reply switch size and made agent System Prompt editors consume available vertical form space.
 * - 2026-02-14: Switched world/agent form labels to non-capitalized medium-contrast styling (`text-sidebar-foreground/75`) for clearer readability.
 * - 2026-02-14: Updated agent create/edit forms with sidebar-style labels, switch-based Auto Reply control, and provider/model on a single row.
 * - 2026-02-14: Lightened world-form label color for better visual hierarchy in create/edit side panel.
 * - 2026-02-14: Styled world-form field labels to match left-sidebar caps/gray label treatment.
 * - 2026-02-14: Added explicit field labels to world create/edit forms (except Variables/MCP config rows) and moved Main Agent above Variables/MCP in edit mode.
 * - 2026-02-14: Updated world create/edit panel behavior: hide Variables/MCP on create; show label + popup expand editors on edit; moved Main Agent to the last field.
 * - 2026-02-14: Removed renderer-local `working_directory=./` fallback; missing values now rely on core default working-directory behavior.
 * - 2026-02-14: Removed monospace font override from desktop log/system lines so tool error text matches agent message typography.
 * - 2026-02-13: Unified desktop log-line typography so category and detailed error text render with a single consistent font style.
 * - 2026-02-13: Expanded desktop log-message rendering to include structured error details (error/message/toolCallId) instead of generic "Tool execution error" text.
 * - 2026-02-13: Removed agent `type` from desktop create/edit forms and unsaved-change checks.
 * - 2026-02-13: Message edit flow now uses core-driven `message:edit` IPC so delete+resubmit+title-reset policy is shared across clients.
 * - 2026-02-13: Refreshes session list on realtime `chat-title-updated` system events so edited New Chat sessions immediately reflect generated titles.
 * - 2026-02-13: Reused the existing bottom status bar for live thinking/activity state (working/pending agents) without adding extra status rows.
 * - 2026-02-13: Tightened send/stop mode to session-scoped pending state so concurrent sessions remain independent while stop is active.
 * - 2026-02-13: Added session-scoped stop-message control and send/stop composer toggle behavior.
 * - 2026-02-12: Extracted renderer orchestration concerns into domain modules.
 *   - Desktop bridge access + error normalization moved to `domain/desktop-api.js`.
 *   - Message upsert/log conversion moved to `domain/message-updates.js`.
 *   - Realtime log/chat event routing moved to `domain/chat-event-handlers.js`.
 * - 2026-02-12: Extended chat avatars to tool-call and system/log message cards.
 *   - Non-human message avatars now resolve for assistant, tool, and system/log roles.
 *   - Tool/system entries use role-aware fallback labels when no agent mapping is available.
 * - 2026-02-12: Added per-message agent avatars on the left of assistant message cards.
 *   - Assistant messages now resolve sender metadata via `fromAgentId` first, then sender-name matching.
 *   - Chat rows now support avatar + bubble layout for assistant messages.
 * - 2026-02-12: Removed renderer-side message ID fallback for chat messages.
 *   - Chat message merge/render/edit/delete paths now rely on backend-provided `messageId` only.
 *   - Delete flow now refreshes messages from canonical `chat:getMessages` payloads after removal.
 * - 2026-02-12: Fixed edit-message flow to use stable message identity (`messageId` first) so edit always removes the edited user message and all following messages before resubmission.
 * - 2026-02-11: Surface world subscription refresh/rebind warnings in the status bar for world/session mutations.
 * - 2026-02-11: Log errors now render even without an active chat subscription by using a global log listener with status-bar fallback.
 * - 2026-02-11: Message list rendering now keys by unique `id` first to prevent duplicate-key collisions when loading session history.
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
  ActivityPulse,
  ElapsedTimeCounter,
  WorldInfoCard,
  ComposerBar,
  AgentFormFields,
  PromptEditorModal,
  WorldConfigEditorModal
} from './components/index.js';
import { renderMarkdown } from './utils/markdown';
import { getDesktopApi, safeMessage } from './domain/desktop-api.js';
import {
  getStatusBarStatus,
  publishStatusBarStatus,
  subscribeStatusBarStatus
} from './domain/status-bar.js';
import { upsertMessageList } from './domain/message-updates.js';
import {
  createGlobalLogEventHandler,
  createChatSubscriptionEventHandler
} from './domain/chat-event-handlers.js';
import { resolveSelectedSessionId } from './domain/session-selection.js';

const THEME_STORAGE_KEY = 'agent-world-desktop-theme';
const COMPOSER_MAX_ROWS = 5;
const DEFAULT_TURN_LIMIT = 5;
const MIN_TURN_LIMIT = 1;
const MAX_HEADER_AGENT_AVATARS = 8;
const DEFAULT_WORLD_CHAT_LLM_PROVIDER = 'ollama';
const DEFAULT_WORLD_CHAT_LLM_MODEL = 'llama3.2:3b';
const MAX_STATUS_AGENT_ITEMS = 6;
const DEFAULT_AGENT_FORM = {
  id: '',
  name: '',
  autoReply: true,
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

function formatLogMessage(logEvent) {
  const baseMessage = String(logEvent?.message || '');
  const data = logEvent?.data && typeof logEvent.data === 'object' ? logEvent.data : null;
  if (!data) return baseMessage;

  const detailParts = [];
  const detailText = data.error || data.errorMessage || data.message;
  if (detailText) {
    detailParts.push(String(detailText));
  }
  if (data.toolCallId) {
    detailParts.push(`toolCallId=${String(data.toolCallId)}`);
  }
  if (data.agentId) {
    detailParts.push(`agent=${String(data.agentId)}`);
  }

  if (detailParts.length === 0) return baseMessage;
  return `${baseMessage}: ${detailParts.join(' | ')}`;
}

/**
 * Message Content Renderer Component
 * Renders message content with markdown support for regular messages
 * Preserves special formatting for tool output and log messages
 */
function MessageContent({ message }) {
  const role = String(message?.role || '').toLowerCase();
  const isToolMessage = role === 'tool' || message.isToolStreaming;
  const [isToolCollapsed, setIsToolCollapsed] = useState(true);
  const MAX_TOOL_OUTPUT_LENGTH = 50000;

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
    const logLineText = `${message.logEvent.category} - ${formatLogMessage(message.logEvent)}`;
    return (
      <div className="flex items-start gap-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
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
        <div className="flex-1 break-words" style={{ color: 'hsl(var(--foreground))' }}>
          {logLineText}
        </div>
      </div>
    );
  }

  // Tool output with stdout/stderr distinction
  if (isToolMessage) {
    const toolContent = String(message.content || '');
    const isTruncated = toolContent.length > MAX_TOOL_OUTPUT_LENGTH;
    const visibleContent = isTruncated ? toolContent.slice(0, MAX_TOOL_OUTPUT_LENGTH) : toolContent;

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
              {visibleContent || (message.isToolStreaming ? '(waiting for output...)' : '(no output)')}
            </pre>
            {isTruncated ? (
              <div className="border-t border-border/40 px-3 py-2 text-[11px] text-amber-400">
                ⚠️ Output truncated (exceeded 50,000 characters)
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  // Regular message content with markdown rendering
  return (
    <div
      className="prose prose-invert max-w-none break-words text-foreground"
      dangerouslySetInnerHTML={{ __html: renderedContent }}
    />
  );
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

function getRefreshWarning(result) {
  const warning = result?.refreshWarning;
  if (typeof warning !== 'string') return '';
  const trimmed = warning.trim();
  return trimmed.length > 0 ? trimmed : '';
}

function isHumanMessage(message) {
  const role = String(message?.role || '').toLowerCase();
  const sender = String(message?.sender || '').toLowerCase();
  if (HUMAN_SENDER_VALUES.has(sender)) {
    return true;
  }
  return role === 'user' && !sender;
}

function getMessageIdentity(message) {
  return String(message?.messageId || '').trim();
}

function isCrossAgentAssistantMessage(message, messagesById, messages, currentIndex) {
  const role = String(message?.role || '').toLowerCase();
  if (role !== 'assistant') return false;

  const sender = String(message?.sender || '').trim().toLowerCase();
  if (!sender) return false;

  const replyToMessageId = String(message?.replyToMessageId || '').trim();
  if (replyToMessageId) {
    const parentMessage = messagesById.get(replyToMessageId);
    if (!parentMessage || isHumanMessage(parentMessage)) return false;
    const parentSender = String(parentMessage?.sender || '').trim().toLowerCase();
    return Boolean(parentSender) && parentSender !== sender;
  }

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (!candidate || isHumanMessage(candidate)) continue;
    const candidateSender = String(candidate?.sender || '').trim().toLowerCase();
    if (!candidateSender) continue;
    return candidateSender !== sender;
  }

  return false;
}

function getMessageCardClassName(message, messagesById, messages, currentIndex) {
  const role = String(message?.role || '').toLowerCase();
  const isUser = isHumanMessage(message);
  const isTool = role === 'tool' || Boolean(message?.isToolStreaming);
  const isSystem = role === 'system' || message?.type === 'log' || Boolean(message?.logEvent);
  const isCrossAgent = isCrossAgentAssistantMessage(message, messagesById, messages, currentIndex);

  const roleClassName = isUser
    ? 'ml-auto w-[80%] border-l-sidebar-border bg-sidebar-accent'
    : isTool
      ? 'mr-auto w-[92%] border-l-amber-500/50'
      : isCrossAgent
        ? 'mr-auto w-[86%] border-l-violet-500/50'
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

function isSenderAutoReplyDisabled(message, agentsById, agentsByName) {
  const fromAgentId = String(message?.fromAgentId || '').trim();
  if (fromAgentId && agentsById?.has(fromAgentId)) {
    return agentsById.get(fromAgentId)?.autoReply === false;
  }

  const sender = String(message?.sender || '').trim().toLowerCase();
  if (sender && agentsByName?.has(sender)) {
    return agentsByName.get(sender)?.autoReply === false;
  }

  return false;
}

function getMessageSenderLabel(message, messagesById, messages, currentIndex, agentsById, agentsByName) {
  if (isHumanMessage(message)) return 'HUMAN';
  const sender = message?.sender || 'unknown';
  if (isSenderAutoReplyDisabled(message, agentsById, agentsByName)) {
    return sender;
  }
  if (isCrossAgentAssistantMessage(message, messagesById, messages, currentIndex)) {
    const replyToMessageId = String(message?.replyToMessageId || '').trim();
    const parentMessage = replyToMessageId ? messagesById.get(replyToMessageId) : null;
    const parentSender = String(parentMessage?.sender || '').trim();
    const fromAgentId = String(message?.fromAgentId || '').trim();
    const source = parentSender || fromAgentId || 'Agent';
    return `${sender} (reply to ${source})`;
  }
  const replyTarget = getReplyTarget(message, messagesById) ||
    inferReplyTargetFromHistory(message, messages, currentIndex);
  if (!replyTarget) return sender;
  return `${sender} (reply to ${replyTarget})`;
}

function resolveMessageAvatar(message, agentsById, agentsByName) {
  if (isHumanMessage(message)) return null;

  const role = String(message?.role || '').toLowerCase();
  const isSystem = role === 'system' || message?.type === 'log' || Boolean(message?.logEvent);
  const isTool = role === 'tool' || Boolean(message?.isToolStreaming);

  const fromAgentId = String(message?.fromAgentId || '').trim();
  if (fromAgentId && agentsById.has(fromAgentId)) {
    const byIdAgent = agentsById.get(fromAgentId);
    return {
      name: byIdAgent.name,
      initials: byIdAgent.initials
    };
  }

  const sender = String(message?.sender || '').trim();
  const normalizedSender = sender.toLowerCase();
  if (normalizedSender && agentsByName.has(normalizedSender)) {
    const byNameAgent = agentsByName.get(normalizedSender);
    return {
      name: byNameAgent.name,
      initials: byNameAgent.initials
    };
  }

  const logCategory = String(message?.logEvent?.category || '').trim();
  const fallbackName = isSystem
    ? (logCategory || sender || 'System')
    : isTool
      ? (sender || 'Tool')
      : (sender || 'Assistant');

  return {
    name: fallbackName,
    initials: getAgentInitials(fallbackName)
  };
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

function parseOptionalInteger(value, min = 0) {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.floor(parsed));
}

function getSessionTimestamp(session) {
  const updatedAt = session?.updatedAt ? new Date(session.updatedAt).getTime() : Number.NaN;
  if (Number.isFinite(updatedAt)) return updatedAt;
  const createdAt = session?.createdAt ? new Date(session.createdAt).getTime() : Number.NaN;
  if (Number.isFinite(createdAt)) return createdAt;
  return 0;
}

function normalizeActivitySourceLabel(source) {
  const raw = String(source || '').trim();
  if (!raw) return '';
  return raw.startsWith('agent:') ? raw.slice('agent:'.length) : raw;
}

function getEnvValueFromText(variablesText, key) {
  if (!key) return undefined;
  const lines = String(variablesText).split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const envKey = line.slice(0, eqIndex).trim();
    if (envKey !== key) continue;
    return line.slice(eqIndex + 1).trim();
  }
  return undefined;
}

function upsertEnvVariable(variablesText, key, value) {
  const lines = String(variablesText || '').split(/\r?\n/);
  const updatedLines = [];
  let replaced = false;

  for (const rawLine of lines) {
    const line = String(rawLine);
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      updatedLines.push(line);
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) {
      updatedLines.push(line);
      continue;
    }

    const envKey = line.slice(0, eqIndex).trim();
    if (envKey === key) {
      if (!replaced) {
        updatedLines.push(`${key}=${value}`);
        replaced = true;
      }
      continue;
    }

    updatedLines.push(line);
  }

  if (!replaced) {
    if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1].trim() !== '') {
      updatedLines.push('');
    }
    updatedLines.push(`${key}=${value}`);
  }

  return updatedLines.join('\n');
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
    mainAgent: '',
    chatLLMProvider: DEFAULT_WORLD_CHAT_LLM_PROVIDER,
    chatLLMModel: DEFAULT_WORLD_CHAT_LLM_MODEL,
    mcpConfig: '',
    variables: ''
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
  const mainAgent = String(world.mainAgent || '').trim();

  return {
    name: String(world.name || ''),
    description: String(world.description || ''),
    turnLimit,
    mainAgent,
    chatLLMProvider,
    chatLLMModel,
    mcpConfig: world.mcpConfig == null ? '' : String(world.mcpConfig),
    variables: world.variables == null ? '' : String(world.variables)
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
  const mainAgent = String(worldForm.mainAgent || '').trim();
  const mcpConfig = worldForm.mcpConfig == null ? '' : String(worldForm.mcpConfig);
  const variables = worldForm.variables == null ? '' : String(worldForm.variables);

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
      mainAgent,
      chatLLMProvider,
      chatLLMModel,
      mcpConfig,
      variables
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
      autoReply: agentForm.autoReply !== false,
      provider: String(agentForm.provider || 'openai').trim() || 'openai',
      model,
      systemPrompt: String(agentForm.systemPrompt || ''),
      temperature: parseOptionalNumber(agentForm.temperature),
      maxTokens: parseOptionalNumber(agentForm.maxTokens)
    }
  };
}

function normalizeSkillSummaryEntries(rawEntries) {
  if (!Array.isArray(rawEntries)) return [];

  const normalized = rawEntries
    .map((entry) => {
      const skillId = String(entry?.skill_id || entry?.name || '').trim();
      if (!skillId) return null;
      const description = String(entry?.description || '').trim();
      return { skillId, description };
    })
    .filter(Boolean);

  normalized.sort((left, right) => left.skillId.localeCompare(right.skillId));
  return normalized;
}

function compactSkillDescription(description) {
  const normalized = String(description || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'No description provided.';
  if (normalized.length <= 96) return normalized;
  return `${normalized.slice(0, 93)}...`;
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
  const [skillRegistryEntries, setSkillRegistryEntries] = useState([]);
  const [loadingSkillRegistry, setLoadingSkillRegistry] = useState(false);
  const [skillRegistryError, setSkillRegistryError] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [composer, setComposer] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState('create-world');
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [themePreference, setThemePreference] = useState(getStoredThemePreference);
  const [systemSettings, setSystemSettings] = useState({ storageType: '', dataPath: '', sqliteDatabase: '' });
  const savedSystemSettingsRef = useRef({ storageType: '', dataPath: '', sqliteDatabase: '' });
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [status, setStatus] = useState(() => getStatusBarStatus());
  const [creatingWorld, setCreatingWorld] = useState(getDefaultWorldForm);
  const [editingWorld, setEditingWorld] = useState(getDefaultWorldForm);
  const [creatingAgent, setCreatingAgent] = useState(DEFAULT_AGENT_FORM);
  const [editingAgent, setEditingAgent] = useState(DEFAULT_AGENT_FORM);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [selectedProjectPath, setSelectedProjectPath] = useState(null);
  const [updatingWorld, setUpdatingWorld] = useState(false);
  const [deletingWorld, setDeletingWorld] = useState(false);
  const [refreshingWorldInfo, setRefreshingWorldInfo] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState(null);
  const [loading, setLoading] = useState({
    sessions: false,
    messages: false,
    send: false
  });
  // Per-session send state for concurrent chat support
  // Tracks which sessions are currently sending messages (allows sending to multiple sessions simultaneously)
  const [sendingSessionIds, setSendingSessionIds] = useState(new Set());
  // Per-session stop state to prevent duplicate stop requests
  const [stoppingSessionIds, setStoppingSessionIds] = useState(new Set());
  // Tracks sessions with in-flight response work for send/stop button mode
  const [pendingResponseSessionIds, setPendingResponseSessionIds] = useState(new Set());
  // Message edit/delete state
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState(null);
  // Activity state for streaming indicators
  const [isBusy, setIsBusy] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [activeTools, setActiveTools] = useState([]);
  const [activeStreamCount, setActiveStreamCount] = useState(0);
  const [sessionActivity, setSessionActivity] = useState({
    eventType: 'idle',
    pendingOperations: 0,
    activityId: 0,
    source: null,
    activeSources: []
  });
  // Prompt editor modal state
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [promptEditorValue, setPromptEditorValue] = useState('');
  const [promptEditorTarget, setPromptEditorTarget] = useState(null); // 'create' or 'edit'
  // World config editor modal state (edit-world only: variables | mcpConfig)
  const [worldConfigEditorOpen, setWorldConfigEditorOpen] = useState(false);
  const [worldConfigEditorValue, setWorldConfigEditorValue] = useState('');
  const [worldConfigEditorField, setWorldConfigEditorField] = useState('mcpConfig');
  const [worldConfigEditorTarget, setWorldConfigEditorTarget] = useState(null); // 'edit'
  // HITL option prompt queue (generic world option requests)
  const [hitlPromptQueue, setHitlPromptQueue] = useState([]);
  const [submittingHitlRequestId, setSubmittingHitlRequestId] = useState(null);

  const setStatusText = useCallback((text, kind = 'info') => {
    publishStatusBarStatus(text, kind);
  }, []);

  useEffect(() => {
    return subscribeStatusBarStatus(setStatus);
  }, []);

  const respondToHitlPrompt = useCallback(async (prompt, optionId) => {
    if (!prompt || !optionId) return;
    const worldId = String(loadedWorld?.id || '').trim();
    if (!worldId) {
      setStatusText('No world loaded to respond to approval request.', 'error');
      return;
    }

    const requestId = String(prompt.requestId || '').trim();
    if (!requestId) {
      setStatusText('Invalid approval request.', 'error');
      return;
    }

    setSubmittingHitlRequestId(requestId);
    try {
      await api.respondHitlOption(worldId, requestId, optionId, prompt.chatId || null);
      setHitlPromptQueue((existing) => existing.filter((entry) => entry.requestId !== requestId));
      if (optionId === 'no') {
        setStatusText('Skill execution was declined.', 'info');
      } else {
        setStatusText('Skill execution approved.', 'success');
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to submit approval response.'), 'error');
    } finally {
      setSubmittingHitlRequestId((current) => (current === requestId ? null : current));
    }
  }, [api, loadedWorld?.id, setStatusText]);

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
          const index = existing.findIndex((m) => String(m.messageId || '') === String(messageId));
          if (index < 0) return existing;
          const next = [...existing];
          next[index] = { ...next[index], content };
          return next;
        });
      },
      onStreamEnd: (messageId) => {
        setMessages((existing) => {
          const index = existing.findIndex((m) => String(m.messageId || '') === String(messageId));
          if (index < 0) return existing;
          const next = [...existing];
          next[index] = { ...next[index], isStreaming: false };
          return next;
        });
      },
      onStreamError: (messageId, errorMessage) => {
        setMessages((existing) => {
          const index = existing.findIndex((m) => String(m.messageId || '') === String(messageId));
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
          const index = existing.findIndex((m) => String(m.messageId || '') === String(messageId));
          if (index < 0) return existing;
          const next = [...existing];
          next[index] = { ...next[index], content, streamType };
          return next;
        });
      },
      onToolStreamEnd: (messageId) => {
        setMessages((existing) => {
          const index = existing.findIndex((m) => String(m.messageId || '') === String(messageId));
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

  const worldInfoStats = useMemo(() => {
    const totalAgentsParsed = parseOptionalInteger(loadedWorld?.totalAgents, 0);
    const totalMessagesParsed = parseOptionalInteger(loadedWorld?.totalMessages, 0);
    const turnLimitParsed = parseOptionalInteger(loadedWorld?.turnLimit, MIN_TURN_LIMIT);

    const fallbackTotalAgents = Array.isArray(loadedWorld?.agents) ? loadedWorld.agents.length : 0;
    const fallbackTotalMessages = sessions.reduce((sum, session) => {
      const next = Number(session?.messageCount);
      return sum + (Number.isFinite(next) ? Math.max(0, Math.floor(next)) : 0);
    }, 0);

    return {
      totalAgents: totalAgentsParsed ?? fallbackTotalAgents,
      totalMessages: totalMessagesParsed ?? fallbackTotalMessages,
      turnLimit: turnLimitParsed ?? DEFAULT_TURN_LIMIT
    };
  }, [loadedWorld, sessions]);

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
        autoReply: agent?.autoReply !== false,
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

  const worldAgentsById = useMemo(() => {
    const next = new Map();
    for (const agent of worldAgents) {
      next.set(agent.id, agent);
    }
    return next;
  }, [worldAgents]);

  const worldAgentsByName = useMemo(() => {
    const next = new Map();
    for (const agent of worldAgents) {
      const normalizedName = String(agent?.name || '').trim().toLowerCase();
      if (!normalizedName) continue;
      next.set(normalizedName, agent);
    }
    return next;
  }, [worldAgents]);

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
      const id = message?.messageId;
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
      setSelectedSessionId((currentSelectedSessionId) =>
        resolveSelectedSessionId({
          sessions: nextSessions,
          backendCurrentChatId: preferredSessionId,
          currentSelectedSessionId
        })
      );
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

  const refreshSkillRegistry = useCallback(async () => {
    if (typeof api?.listSkills !== 'function') {
      setSkillRegistryEntries([]);
      setSkillRegistryError('Skills are not available in this desktop build.');
      return;
    }

    setLoadingSkillRegistry(true);
    setSkillRegistryError('');
    try {
      const rawEntries = await api.listSkills();
      setSkillRegistryEntries(normalizeSkillSummaryEntries(rawEntries));
    } catch (error) {
      setSkillRegistryEntries([]);
      setSkillRegistryError(safeMessage(error, 'Failed to load skill registry.'));
    } finally {
      setLoadingSkillRegistry(false);
    }
  }, [api]);

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
    refreshSkillRegistry();
  }, [refreshSkillRegistry, workspace.workspacePath, loadedWorld?.id]);

  useEffect(() => {
    refreshSessions(loadedWorld?.id, loadedWorld?.currentChatId || null);
  }, [loadedWorld?.id, loadedWorld?.currentChatId, refreshSessions]);

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
    const workingDirectory = getEnvValueFromText(loadedWorld?.variables, 'working_directory');
    setSelectedProjectPath(workingDirectory || null);
  }, [loadedWorld?.id, loadedWorld?.variables]);

  useEffect(() => {
    if (loadedWorld?.id) return;
    setSendingSessionIds(new Set());
    setStoppingSessionIds(new Set());
    setPendingResponseSessionIds(new Set());
    setHitlPromptQueue([]);
    setSubmittingHitlRequestId(null);
    setSessionActivity({
      eventType: 'idle',
      pendingOperations: 0,
      activityId: 0,
      source: null,
      activeSources: []
    });
  }, [loadedWorld?.id]);

  useEffect(() => {
    setSessionSearch('');
  }, [loadedWorld?.id]);

  // Global log listener (independent of chat session subscription)
  useEffect(() => {
    const removeListener = api.onChatEvent(createGlobalLogEventHandler({
      loadedWorldId: loadedWorld?.id,
      selectedSessionId,
      setMessages
    }));

    return () => {
      removeListener();
    };
  }, [api, loadedWorld?.id, selectedSessionId]);

  useEffect(() => {
    if (!loadedWorld?.id || !selectedSessionId) {
      return undefined;
    }

    const subscriptionId = `chat-${Date.now()}-${chatSubscriptionCounter.current++}`;
    let disposed = false;
    const removeListener = api.onChatEvent(createChatSubscriptionEventHandler({
      subscriptionId,
      loadedWorldId: loadedWorld.id,
      selectedSessionId,
      streamingStateRef,
      activityStateRef,
      setMessages,
      setActiveStreamCount,
      onSessionResponseStateChange: (chatId, isActive) => {
        if (!chatId) return;
        setPendingResponseSessionIds((existing) => {
          const next = new Set(existing);
          if (isActive) {
            next.add(chatId);
          } else {
            next.delete(chatId);
          }
          return next;
        });
      },
      onSessionActivityUpdate: (activity) => {
        setSessionActivity(activity);
      },
      onSessionSystemEvent: (systemEvent) => {
        if (!loadedWorld?.id) return;
        const eventType = String(systemEvent?.eventType || '').trim();
        if (eventType === 'chat-title-updated') {
          const targetChatId = String(systemEvent?.chatId || selectedSessionId || '').trim() || null;
          refreshSessions(loadedWorld.id, targetChatId).catch(() => { });
          return;
        }
        if (eventType !== 'hitl-option-request') {
          return;
        }

        const content = systemEvent?.content && typeof systemEvent.content === 'object'
          ? systemEvent.content
          : null;
        const requestId = String(content?.requestId || '').trim();
        if (!requestId) {
          return;
        }

        const options = Array.isArray(content?.options)
          ? content.options
            .map((option) => ({
              id: String(option?.id || '').trim(),
              label: String(option?.label || '').trim(),
              description: option?.description ? String(option.description) : ''
            }))
            .filter((option) => option.id && option.label)
          : [];
        if (options.length === 0) {
          return;
        }

        setHitlPromptQueue((existing) => {
          if (existing.some((entry) => entry.requestId === requestId)) {
            return existing;
          }
          return [
            ...existing,
            {
              requestId,
              chatId: systemEvent?.chatId || selectedSessionId || null,
              title: String(content?.title || 'Approval required').trim() || 'Approval required',
              message: String(content?.message || '').trim(),
              options
            }
          ];
        });
      }
    }));

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
      setSessionActivity({
        eventType: 'idle',
        pendingOperations: 0,
        activityId: 0,
        source: null,
        activeSources: []
      });
    };
  }, [api, selectedSessionId, loadedWorld, setStatusText, refreshSessions]);

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

  useEffect(() => {
    if (!api.getSettings) return;
    api.getSettings().then((s) => {
      if (s && typeof s === 'object') {
        setSystemSettings({
          storageType: s.storageType || '',
          dataPath: s.dataPath || '',
          sqliteDatabase: s.sqliteDatabase || '',
        });
      }
    }).catch(() => { });
  }, []);

  const onOpenWorkspace = useCallback(async () => {
    try {
      const picked = await api.pickDirectory();
      if (picked?.canceled || !picked?.directoryPath) {
        return;
      }
      const nextWorkspace = await api.openWorkspace(String(picked.directoryPath));
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
        const backendCurrentChatId = String(result.world?.currentChatId || '').trim();
        setLoadedWorld(result.world);
        setSelectedAgentId(null);
        setSessions(nextSessions);
        setSelectedSessionId(
          resolveSelectedSessionId({
            sessions: nextSessions,
            backendCurrentChatId,
            currentSelectedSessionId: null
          })
        );
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
      const backendCurrentChatId = String(created?.currentChatId || '').trim();
      setSessions(nextSessions);
      setSelectedSessionId(
        resolveSelectedSessionId({
          sessions: nextSessions,
          backendCurrentChatId,
          currentSelectedSessionId: null
        })
      );
      setWorldLoadError(null);
      // Persist world selection
      await api.saveLastSelectedWorld(created.id);

      setPanelOpen(false);
      setPanelMode('create-world');
      setStatusText(`World created: ${created.name}`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to create world.'), 'error');
    }
  }, [api, creatingWorld, setStatusText]);

  const hasUnsavedWorldChanges = useCallback(() => {
    if (panelMode === 'create-world') {
      const defaultForm = getDefaultWorldForm();
      return creatingWorld.name !== defaultForm.name ||
        creatingWorld.description !== defaultForm.description ||
        creatingWorld.turnLimit !== defaultForm.turnLimit ||
        creatingWorld.mainAgent !== defaultForm.mainAgent ||
        creatingWorld.chatLLMProvider !== defaultForm.chatLLMProvider ||
        creatingWorld.chatLLMModel !== defaultForm.chatLLMModel ||
        creatingWorld.mcpConfig !== defaultForm.mcpConfig ||
        creatingWorld.variables !== defaultForm.variables;
    }
    if (panelMode === 'edit-world' && loadedWorld) {
      const originalForm = getWorldFormFromWorld(loadedWorld);
      return editingWorld.name !== originalForm.name ||
        editingWorld.description !== originalForm.description ||
        editingWorld.turnLimit !== originalForm.turnLimit ||
        editingWorld.mainAgent !== originalForm.mainAgent ||
        editingWorld.chatLLMProvider !== originalForm.chatLLMProvider ||
        editingWorld.chatLLMModel !== originalForm.chatLLMModel ||
        editingWorld.mcpConfig !== originalForm.mcpConfig ||
        editingWorld.variables !== originalForm.variables;
    }
    return false;
  }, [panelMode, creatingWorld, editingWorld, loadedWorld]);

  const hasUnsavedAgentChanges = useCallback(() => {
    if (panelMode === 'create-agent') {
      return creatingAgent.name !== DEFAULT_AGENT_FORM.name ||
        creatingAgent.autoReply !== DEFAULT_AGENT_FORM.autoReply ||
        creatingAgent.provider !== DEFAULT_AGENT_FORM.provider ||
        creatingAgent.model !== DEFAULT_AGENT_FORM.model ||
        creatingAgent.systemPrompt !== DEFAULT_AGENT_FORM.systemPrompt ||
        creatingAgent.temperature !== DEFAULT_AGENT_FORM.temperature ||
        creatingAgent.maxTokens !== DEFAULT_AGENT_FORM.maxTokens;
    }
    if (panelMode === 'edit-agent' && selectedAgentForPanel) {
      return editingAgent.name !== selectedAgentForPanel.name ||
        editingAgent.autoReply !== (selectedAgentForPanel.autoReply !== false) ||
        editingAgent.provider !== selectedAgentForPanel.provider ||
        editingAgent.model !== selectedAgentForPanel.model ||
        editingAgent.systemPrompt !== selectedAgentForPanel.systemPrompt ||
        String(editingAgent.temperature ?? '') !== String(selectedAgentForPanel.temperature ?? '') ||
        String(editingAgent.maxTokens ?? '') !== String(selectedAgentForPanel.maxTokens ?? '');
    }
    return false;
  }, [panelMode, creatingAgent, editingAgent, selectedAgentForPanel]);

  const closePanel = useCallback(() => {
    const hasWorldChanges = hasUnsavedWorldChanges();
    const hasAgentChanges = hasUnsavedAgentChanges();

    if (hasWorldChanges || hasAgentChanges) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to close this panel?');
      if (!confirmed) return;
    }

    setPanelOpen(false);
    setPanelMode('create-world');
    setSelectedAgentId(null);
  }, [hasUnsavedWorldChanges, hasUnsavedAgentChanges]);

  const onOpenSettingsPanel = useCallback(async () => {
    setPanelMode('settings');
    setPanelOpen(true);
    if (!api.getSettings) return;
    try {
      const s = await api.getSettings();
      if (s && typeof s === 'object') {
        const loaded = {
          storageType: s.storageType || '',
          dataPath: s.dataPath || '',
          sqliteDatabase: s.sqliteDatabase || '',
        };
        setSystemSettings(loaded);
        savedSystemSettingsRef.current = loaded;
      }
    } catch { }
  }, [api]);

  const settingsNeedRestart = useMemo(() => {
    const saved = savedSystemSettingsRef.current;
    return (
      systemSettings.storageType !== saved.storageType ||
      systemSettings.dataPath !== saved.dataPath ||
      systemSettings.sqliteDatabase !== saved.sqliteDatabase
    );
  }, [systemSettings]);

  const onCancelSettings = useCallback(() => {
    setSystemSettings(savedSystemSettingsRef.current);
  }, []);

  const onSaveSettings = useCallback(async () => {
    if (!api.saveSettings) return;
    const needsRestart = settingsNeedRestart;
    if (needsRestart) {
      const confirmed = window.confirm('Changes require a restart to take effect. Continue?');
      if (!confirmed) return;
    }
    try {
      await api.saveSettings({ ...systemSettings, restart: needsRestart });
      if (!needsRestart) {
        savedSystemSettingsRef.current = { ...systemSettings };
        setStatusText('Settings saved.', 'success');
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to save settings.'), 'error');
    }
  }, [systemSettings, settingsNeedRestart]);

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
      const backendCurrentChatId = String(result.world?.currentChatId || '').trim();
      setSelectedSessionId((currentId) =>
        resolveSelectedSessionId({
          sessions: nextSessions,
          backendCurrentChatId,
          currentSelectedSessionId: currentId
        })
      );
    }
    return result.world;
  }, [api]);

  const onRefreshWorldInfo = useCallback(async () => {
    if (!loadedWorld?.id) {
      return;
    }

    setRefreshingWorldInfo(true);
    try {
      const refreshedWorld = await refreshWorldDetails(loadedWorld.id);
      setAvailableWorlds((worlds) =>
        worlds.map((world) =>
          world.id === refreshedWorld.id
            ? { id: refreshedWorld.id, name: refreshedWorld.name }
            : world
        )
      );
      setStatusText('World info refreshed.', 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to refresh world info.'), 'error');
    } finally {
      setRefreshingWorldInfo(false);
    }
  }, [loadedWorld?.id, refreshWorldDetails, setStatusText]);

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
      autoReply: targetAgent.autoReply !== false,
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
      const warning = getRefreshWarning(updated);
      const updatedWorld = { ...updated };
      delete updatedWorld.refreshWarning;

      setLoadedWorld(updatedWorld);
      setAvailableWorlds((worlds) =>
        worlds.map((world) => (world.id === updatedWorld.id ? { id: updatedWorld.id, name: updatedWorld.name } : world))
      );
      setPanelOpen(false);
      setPanelMode('create-world');
      setStatusText(
        warning ? `World updated: ${updatedWorld.name}. ${warning}` : `World updated: ${updatedWorld.name}`,
        warning ? 'error' : 'success'
      );
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
        const backendCurrentChatId = String(result.world?.currentChatId || '').trim();
        setLoadedWorld(result.world);
        setSelectedAgentId(null);
        setSessions(nextSessions);
        setSelectedSessionId(
          resolveSelectedSessionId({
            sessions: nextSessions,
            backendCurrentChatId,
            currentSelectedSessionId: null
          })
        );
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
    if (!loadedWorld?.id) {
      setStatusText('Load a world before selecting a project folder.', 'error');
      return;
    }

    try {
      const result = await api.openWorkspace();
      if (!result.canceled && result.workspacePath) {
        const selectedPath = String(result.workspacePath).trim();
        const nextVariables = upsertEnvVariable(loadedWorld.variables || '', 'working_directory', selectedPath);
        const updated = await api.updateWorld(loadedWorld.id, { variables: nextVariables });
        const warning = getRefreshWarning(updated);
        const updatedWorld = { ...updated };
        delete updatedWorld.refreshWarning;

        setLoadedWorld(updatedWorld);
        setSelectedProjectPath(selectedPath);
        setStatusText(
          warning ? `Project selected: ${selectedPath}. ${warning}` : `Project selected: ${selectedPath}`,
          warning ? 'error' : 'info'
        );
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to select project folder.'), 'error');
    }
  }, [api, loadedWorld, setStatusText]);

  const onCreateSession = useCallback(async () => {
    if (!loadedWorld?.id) {
      setStatusText('No world loaded. Please open a folder with a world first.', 'error');
      return;
    }

    try {
      const result = await api.createSession(loadedWorld.id);
      const createWarning = getRefreshWarning(result);
      const nextSessions = sortSessionsByNewest(result.sessions || []);
      setSessions(nextSessions);
      const nextSessionId = result.currentChatId || nextSessions[0]?.id || null;
      setSelectedSessionId(nextSessionId);
      let selectWarning = '';
      if (nextSessionId) {
        const selectResult = await api.selectSession(loadedWorld.id, nextSessionId);
        selectWarning = getRefreshWarning(selectResult);
      }
      const warning = [...new Set([createWarning, selectWarning].filter(Boolean))].join(' ');
      setStatusText(
        warning ? `Chat session created. ${warning}` : 'Chat session created.',
        warning ? 'error' : 'success'
      );
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
      const result = await api.selectSession(loadedWorld.id, chatId);
      const warning = getRefreshWarning(result);
      if (warning) {
        setStatusText(`Session selected. ${warning}`, 'error');
      }
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
      const warning = getRefreshWarning(result);
      const nextSessions = sortSessionsByNewest(result.sessions || []);
      setSessions(nextSessions);
      const nextSessionId = result.currentChatId || nextSessions[0]?.id || null;
      setSelectedSessionId(nextSessionId);
      setStatusText(
        warning ? `Chat session deleted. ${warning}` : 'Chat session deleted.',
        warning ? 'error' : 'success'
      );
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to delete session.'), 'error');
    } finally {
      setDeletingSessionId(null);
    }
  }, [api, loadedWorld, sessions, setStatusText]);

  const onSendMessage = useCallback(async () => {
    const activeSessionId = String(selectedSessionId || '').trim() || null;
    // Check if this specific session is already sending (per-session concurrency support)
    if (activeSessionId && sendingSessionIds.has(activeSessionId)) return;
    if (!loadedWorld?.id || !activeSessionId) {
      setStatusText('Select a session before sending messages.', 'error');
      return;
    }
    const content = composer.trim();
    if (!content) return;

    // Mark this session as awaiting response so composer can switch to stop mode.
    setPendingResponseSessionIds((prev) => new Set([...prev, activeSessionId]));
    // Mark this session as sending (allows concurrent sends to different sessions)
    setSendingSessionIds((prev) => new Set([...prev, activeSessionId]));
    try {
      await api.sendMessage({
        worldId: loadedWorld.id,
        chatId: activeSessionId,
        content,
        sender: 'human'
      });
      setComposer('');
    } catch (error) {
      setPendingResponseSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(activeSessionId);
        return next;
      });
      setStatusText(safeMessage(error, 'Failed to send message.'), 'error');
    } finally {
      // Remove this session from sending state
      setSendingSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(activeSessionId);
        return next;
      });
    }
  }, [api, composer, selectedSessionId, loadedWorld, setStatusText, sendingSessionIds]);

  const onStopMessage = useCallback(async () => {
    if (!loadedWorld?.id || !selectedSessionId) {
      setStatusText('Select a session before stopping messages.', 'error');
      return;
    }
    if (stoppingSessionIds.has(selectedSessionId)) return;

    setStoppingSessionIds((prev) => new Set([...prev, selectedSessionId]));
    try {
      const result = await api.stopMessage(loadedWorld.id, selectedSessionId);
      const stopped = Boolean(result?.stopped);
      const reason = String(result?.reason || '').trim();

      setPendingResponseSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(selectedSessionId);
        return next;
      });

      if (stopped) {
        if (streamingStateRef.current) {
          streamingStateRef.current.cleanup();
        }
        if (activityStateRef.current) {
          activityStateRef.current.cleanup();
        }
        setActiveStreamCount(0);
        setActiveTools([]);
        setIsBusy(false);
        setSessionActivity({
          eventType: 'idle',
          pendingOperations: 0,
          activityId: 0,
          source: null,
          activeSources: []
        });
      }

      if (stopped) {
        setStatusText('Stopped message processing.', 'success');
      } else if (reason === 'no-active-process') {
        setStatusText('No active message process to stop.', 'info');
      } else {
        setStatusText('Stop request completed.', 'info');
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to stop message processing.'), 'error');
    } finally {
      setStoppingSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(selectedSessionId);
        return next;
      });
    }
  }, [api, loadedWorld, selectedSessionId, setStatusText, stoppingSessionIds]);

  const onSubmitMessage = useCallback((event) => {
    event.preventDefault();
    const isCurrentSessionSending = selectedSessionId && sendingSessionIds.has(selectedSessionId);
    const isCurrentSessionStopping = selectedSessionId && stoppingSessionIds.has(selectedSessionId);
    const isCurrentSessionPendingResponse = selectedSessionId && pendingResponseSessionIds.has(selectedSessionId);
    const canStopCurrentSession = Boolean(selectedSessionId) && !isCurrentSessionSending && !isCurrentSessionStopping && Boolean(isCurrentSessionPendingResponse);

    if (canStopCurrentSession) {
      onStopMessage();
      return;
    }
    onSendMessage();
  }, [
    onSendMessage,
    onStopMessage,
    selectedSessionId,
    sendingSessionIds,
    stoppingSessionIds,
    pendingResponseSessionIds
  ]);

  /**
   * Enter edit mode for a user message
   * Shows textarea with current message text and Save/Cancel buttons
   */
  const onStartEditMessage = useCallback((message) => {
    const messageIdentity = getMessageIdentity(message);
    if (!messageIdentity) return;
    setEditingMessageId(messageIdentity);
    setEditingText(message?.content || '');
  }, []);

  const resolveMessageTargetChatId = useCallback((message) => {
    const directChatId = String(message?.chatId || '').trim();
    if (directChatId) {
      return directChatId;
    }

    const messageId = String(message?.messageId || '').trim();
    if (!messageId) {
      return null;
    }

    const indexedMessage = messagesById.get(messageId);
    const indexedChatId = String(indexedMessage?.chatId || '').trim();
    return indexedChatId || null;
  }, [messagesById]);

  /**
   * Cancel edit mode and discard changes
   * Returns to normal message display
   */
  const onCancelEditMessage = useCallback(() => {
    setEditingMessageId(null);
    setEditingText('');
  }, []);

  /**
   * Save edited message using core-managed edit flow:
   * - Removes edited message and subsequent messages from agent memories
   * - Resubmits edited content from core to restart downstream responses
   *
   * localStorage backup created before mutation for recovery if edit fails.
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

    const targetChatId = resolveMessageTargetChatId(message);
    if (!targetChatId) {
      setStatusText('Cannot edit: message is not bound to a chat session', 'error');
      return;
    }

    if (!loadedWorld?.id) {
      setStatusText('Cannot edit: no world loaded', 'error');
      return;
    }

    // Store backup in localStorage
    const backup = {
      messageId: message.messageId,
      chatId: targetChatId,
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
    const targetIdentity = getMessageIdentity(message);
    const editedIndex = messages.findIndex(m => getMessageIdentity(m) === targetIdentity);
    const optimisticMessages = editedIndex >= 0 ? messages.slice(0, editedIndex) : messages;
    setMessages(optimisticMessages);
    setEditingMessageId(null);
    setEditingText('');

    try {
      // Core-managed edit path: delete + resubmission + title policy
      const editResult = await api.editMessage(loadedWorld.id, message.messageId, editedText, targetChatId);

      // Check for removal failures
      if (!editResult.success) {
        const failedAgents = editResult.failedAgents || [];
        if (failedAgents.length > 0) {
          const errors = failedAgents.map(f => `${f.agentId}: ${f.error}`).join(', ');
          throw new Error(`Edit failed for some agents: ${errors}`);
        }
        throw new Error('Failed to edit message');
      }

      if (editResult.resubmissionStatus !== 'success') {
        const details = String(editResult.resubmissionError || editResult.resubmissionStatus || 'unknown');
        setStatusText(
          `Messages removed but resubmission failed: ${details}. Please try editing again.`,
          'error'
        );
        await refreshMessages(loadedWorld.id, targetChatId);
        return;
      }

      // Clear backup on success
      try {
        localStorage.removeItem('agent-world-desktop-edit-backup');
      } catch (e) {
        console.warn('Failed to clear edit backup:', e);
      }

      setStatusText('Message edited successfully', 'success');
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
      await refreshMessages(loadedWorld.id, targetChatId);
    }
  }, [api, editingText, loadedWorld, messages, setStatusText, refreshMessages, resolveMessageTargetChatId]);

  /**
   * Delete user message and all subsequent messages from conversation
   * Shows confirmation dialog with message preview before deletion
   * 
   * After successful deletion:
   * 1. Calls DELETE to remove message chain from backend memory
   * 2. Refreshes message list from canonical chat:getMessages IPC
   * 
   * Handles partial failures where some agents succeed and others fail.
   */
  const onDeleteMessage = useCallback(async (message) => {
    const targetChatId = resolveMessageTargetChatId(message);
    if (!message.messageId || !targetChatId) return;

    const preview = (message.content || '').substring(0, 100);
    const previewText = preview.length < (message.content || '').length ? `${preview}...` : preview;
    const confirmed = window.confirm(
      `Delete this message and all responses after it?\n\n"${previewText}"`
    );
    if (!confirmed) return;

    const targetIdentity = getMessageIdentity(message);
    setDeletingMessageId(targetIdentity);
    try {
      // Call DELETE via IPC
      const deleteResult = await api.deleteMessage(loadedWorld.id, message.messageId, targetChatId);

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

      await refreshMessages(loadedWorld.id, targetChatId);
      setStatusText('Message deleted successfully', 'success');
    } catch (error) {
      setStatusText(error.message || 'Failed to delete message', 'error');
    } finally {
      setDeletingMessageId(null);
    }
  }, [api, loadedWorld, setStatusText, refreshMessages, resolveMessageTargetChatId]);

  const onComposerKeyDown = useCallback((event) => {
    if (event.nativeEvent?.isComposing || event.keyCode === 229) {
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      // Check per-session sending state for concurrency support
      const isCurrentSessionSending = selectedSessionId && sendingSessionIds.has(selectedSessionId);
      const isCurrentSessionStopping = selectedSessionId && stoppingSessionIds.has(selectedSessionId);
      const isCurrentSessionPendingResponse = selectedSessionId && pendingResponseSessionIds.has(selectedSessionId);
      const canStopCurrentSession = Boolean(selectedSessionId) && !isCurrentSessionSending && !isCurrentSessionStopping && Boolean(isCurrentSessionPendingResponse);

      if (canStopCurrentSession) {
        return;
      }
      if (composer.trim() && !isCurrentSessionSending) {
        onSendMessage();
      }
    }
  }, [
    composer,
    selectedSessionId,
    sendingSessionIds,
    stoppingSessionIds,
    pendingResponseSessionIds,
    onSendMessage
  ]);

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

  const isCurrentSessionSending = Boolean(selectedSessionId && sendingSessionIds.has(selectedSessionId));
  const isCurrentSessionStopping = Boolean(selectedSessionId && stoppingSessionIds.has(selectedSessionId));
  const isCurrentSessionPendingResponse = Boolean(selectedSessionId && pendingResponseSessionIds.has(selectedSessionId));
  const canStopCurrentSession = Boolean(selectedSessionId) && !isCurrentSessionSending && !isCurrentSessionStopping && isCurrentSessionPendingResponse;
  const activeAgentSources = useMemo(() => {
    if (!Array.isArray(sessionActivity.activeSources)) return [];

    const unique = new Set();
    for (const source of sessionActivity.activeSources) {
      const normalized = normalizeActivitySourceLabel(source);
      if (normalized) unique.add(normalized);
    }

    return Array.from(unique);
  }, [sessionActivity.activeSources]);
  const workingAgentCount = activeAgentSources.length;
  const pendingAgentCount = Math.max(0, Number(sessionActivity.pendingOperations || 0) - workingAgentCount);
  const isAgentWorkInProgress = workingAgentCount > 0;
  const agentStatusText = useMemo(() => {
    if (!Array.isArray(worldAgents) || worldAgents.length === 0) {
      return isAgentWorkInProgress
        ? `${workingAgentCount} working · ${pendingAgentCount} pending`
        : 'done';
    }

    const activeSourceSet = new Set(activeAgentSources.map((source) => String(source).toLowerCase()));
    const statuses = worldAgents.map((agent, index) => {
      const label = String(agent?.name || '').trim() || `Agent ${index + 1}`;
      const normalizedId = String(agent?.id || '').trim().toLowerCase();
      const normalizedName = String(agent?.name || '').trim().toLowerCase();
      const isWorking =
        (normalizedId && activeSourceSet.has(normalizedId)) ||
        (normalizedName && activeSourceSet.has(normalizedName));
      return `${label} ${isWorking ? 'working' : 'done'}`;
    });

    if (statuses.length <= MAX_STATUS_AGENT_ITEMS) {
      return statuses.join(', ');
    }

    const remaining = statuses.length - MAX_STATUS_AGENT_ITEMS;
    return `${statuses.slice(0, MAX_STATUS_AGENT_ITEMS).join(', ')}, +${remaining} more`;
  }, [
    worldAgents,
    activeAgentSources,
    isAgentWorkInProgress,
    pendingAgentCount,
    workingAgentCount
  ]);
  const hasComposerActivity =
    isCurrentSessionPendingResponse ||
    Number(sessionActivity.pendingOperations || 0) > 0 ||
    activeTools.length > 0 ||
    activeStreamCount > 0 ||
    isBusy;
  const showInlineWorkingIndicator =
    Boolean(selectedSessionId) && isAgentWorkInProgress;
  const inlineWorkingAgentLabel = useMemo(() => {
    const resolveAgentName = (source) => {
      const rawSource = String(source || '').trim();
      if (!rawSource) return '';

      const normalizedSource = normalizeActivitySourceLabel(rawSource).toLowerCase();
      if (!normalizedSource) return '';
      if (!Array.isArray(worldAgents) || worldAgents.length === 0) return rawSource;

      const matchedAgent = worldAgents.find((agent) => {
        const normalizedId = String(agent?.id || '').trim().toLowerCase();
        const normalizedName = String(agent?.name || '').trim().toLowerCase();
        return normalizedSource === normalizedId || normalizedSource === normalizedName;
      });

      return String(matchedAgent?.name || rawSource);
    };

    if (Array.isArray(activeAgentSources) && activeAgentSources.length > 0) {
      const firstResolved = resolveAgentName(activeAgentSources[0]);
      if (firstResolved) return firstResolved;
    }

    const mainAgentResolved = resolveAgentName(loadedWorld?.mainAgent);
    if (mainAgentResolved) return mainAgentResolved;

    if (Array.isArray(worldAgents) && worldAgents.length > 0) {
      const firstAgentName = String(worldAgents[0]?.name || '').trim();
      if (firstAgentName) return firstAgentName;
    }

    return 'Agent';
  }, [activeAgentSources, worldAgents, loadedWorld?.mainAgent]);
  const activeHitlPrompt = hitlPromptQueue.length > 0 ? hitlPromptQueue[0] : null;
  const hasConversationMessages = useMemo(() => {
    return messages.some((message) => {
      const role = String(message?.role || '').toLowerCase();
      return role === 'user' || role === 'assistant';
    });
  }, [messages]);

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
            <WorldInfoCard
              loadedWorld={loadedWorld}
              worldInfoStats={worldInfoStats}
              refreshingWorldInfo={refreshingWorldInfo}
              updatingWorld={updatingWorld}
              deletingWorld={deletingWorld}
              onRefreshWorldInfo={onRefreshWorldInfo}
              onOpenWorldEditPanel={onOpenWorldEditPanel}
              onDeleteWorld={onDeleteWorld}
            />
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
              <button
                type="button"
                onClick={onOpenSettingsPanel}
                className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${panelMode === 'settings' && panelOpen
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                title="Settings"
                aria-label="Settings"
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
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <section className="flex min-w-0 flex-1 flex-col">
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden p-5">
                <div
                  className={
                    !hasConversationMessages && selectedSession
                      ? 'mx-auto flex min-h-full w-full max-w-[920px] items-start justify-center py-4'
                      : 'mx-auto w-full max-w-[750px] space-y-3'
                  }
                >
                  {!hasConversationMessages ? (
                    selectedSession ? (
                      <section className="w-full max-w-[680px] rounded-xl bg-card/60 px-6 py-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h2 className="text-lg font-semibold text-foreground">Welcome</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Start chatting below. Available skills are listed here.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={refreshSkillRegistry}
                            disabled={loadingSkillRegistry}
                            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                            title="Refresh skills"
                          >
                            {loadingSkillRegistry ? 'Refreshing...' : 'Refresh'}
                          </button>
                        </div>

                        <div className="mt-4 pt-2">
                          <div className="mb-2 flex items-center justify-between">
                            <h3 className="text-sm font-medium text-foreground/90">Skills</h3>
                            <span className="text-xs text-muted-foreground">
                              {skillRegistryEntries.length}
                            </span>
                          </div>

                          {loadingSkillRegistry ? (
                            <p className="text-sm text-muted-foreground">Loading skills...</p>
                          ) : skillRegistryEntries.length > 0 ? (
                            <div className="max-h-[48vh] overflow-y-auto pr-1">
                              <ul className="grid gap-1.5 sm:grid-cols-2">
                                {skillRegistryEntries.map((entry) => (
                                  <li
                                    key={entry.skillId}
                                    className="rounded-md bg-muted/20 px-2.5 py-2"
                                  >
                                    <p className="text-[13px] font-medium leading-4 text-foreground">{entry.skillId}</p>
                                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                                      {compactSkillDescription(entry.description)}
                                    </p>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : skillRegistryError ? (
                            <p className="text-sm text-muted-foreground">{skillRegistryError}</p>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              No skills discovered yet.
                            </p>
                          )}
                        </div>
                      </section>
                    ) : (
                      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                        Select a session from the left column.
                      </div>
                    )
                  ) : (
                    messages.map((message, messageIndex) => {
                      if (!message?.messageId) return null;
                      const senderLabel = getMessageSenderLabel(
                        message,
                        messagesById,
                        messages,
                        messageIndex,
                        worldAgentsById,
                        worldAgentsByName
                      );
                      const messageKey = message.messageId;
                      const messageAvatar = resolveMessageAvatar(message, worldAgentsById, worldAgentsByName);
                      const isHuman = isHumanMessage(message);
                      return (
                        <div
                          key={messageKey}
                          className={`flex min-w-0 w-full items-start gap-2 ${isHuman ? 'justify-end' : 'justify-start'}`}
                        >
                          {messageAvatar ? (
                            <div
                              className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-[10px] font-semibold text-secondary-foreground"
                              title={messageAvatar.name}
                              aria-label={`${messageAvatar.name} avatar`}
                            >
                              {messageAvatar.initials}
                            </div>
                          ) : null}

                          <article className={`min-w-0 ${getMessageCardClassName(message, messagesById, messages, messageIndex)}`}>
                            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                              <span>{senderLabel}</span>
                              <span>{formatTime(message.createdAt)}</span>
                            </div>

                            {editingMessageId === getMessageIdentity(message) ? (
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

                            {/* Action buttons - show on hover in lower right */}
                            {isHumanMessage(message) && message.messageId && editingMessageId !== getMessageIdentity(message) ? (
                              <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={() => onStartEditMessage(message)}
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
                                  disabled={deletingMessageId === getMessageIdentity(message)}
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
                        </div>
                      );
                    })
                  )}

                  {showInlineWorkingIndicator ? (
                    <div className="flex w-full items-start gap-2 justify-start">
                      <div className="flex items-center gap-2 px-1 py-1 text-[13px] text-muted-foreground">
                        <span className="inline-block h-2 w-2 rounded-full bg-foreground/70 animate-pulse" aria-hidden="true"></span>
                        <div className="text-[13px]">
                          {inlineWorkingAgentLabel} is working...
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <ComposerBar
                onSubmitMessage={onSubmitMessage}
                composerTextareaRef={composerTextareaRef}
                composer={composer}
                onComposerChange={setComposer}
                onComposerKeyDown={onComposerKeyDown}
                onSelectProject={onSelectProject}
                selectedProjectPath={selectedProjectPath}
                canStopCurrentSession={canStopCurrentSession}
                isCurrentSessionStopping={isCurrentSessionStopping}
                isCurrentSessionSending={isCurrentSessionSending}
              />
            </section>

            <aside
              className={`border-l border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 ${panelOpen ? 'w-80 p-4 opacity-100' : 'w-0 p-0 opacity-0'
                }`}
            >
              {panelOpen ? (
                <div className="flex h-full flex-col">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xs uppercase tracking-wide text-sidebar-foreground/70">
                      {panelMode === 'settings'
                        ? 'System Settings'
                        : panelMode === 'edit-world'
                          ? 'Edit World'
                          : panelMode === 'create-agent'
                            ? 'Create Agent'
                            : panelMode === 'edit-agent'
                              ? 'Edit Agent'
                              : 'Create World'}
                    </h2>
                    <button
                      type="button"
                      onClick={closePanel}
                      className="flex h-6 w-6 items-center justify-center rounded text-sidebar-foreground/70 transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                      title="Close panel"
                      aria-label="Close panel"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="min-h-0 flex flex-1 flex-col overflow-y-auto">
                    {panelMode === 'settings' ? (
                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="flex-1 space-y-4 overflow-y-auto">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-sidebar-foreground/90">Theme</label>
                            <div className="inline-flex items-center rounded-md border border-sidebar-border bg-sidebar-accent p-0.5">
                              {['system', 'light', 'dark'].map((mode) => (
                                <button
                                  key={mode}
                                  type="button"
                                  onClick={() => setThemePreference(mode)}
                                  className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${themePreference === mode
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-sidebar-foreground/70 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground'
                                    }`}
                                  title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} theme`}
                                >
                                  {mode === 'system' ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                                      <line x1="8" y1="21" x2="16" y2="21" />
                                      <line x1="12" y1="17" x2="12" y2="21" />
                                    </svg>
                                  ) : mode === 'light' ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
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
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                                      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
                                    </svg>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="border-t border-sidebar-border pt-4">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-sidebar-foreground/90">Storage Type</label>
                                <div className="flex gap-3">
                                  {['file', 'sqlite'].map((type) => (
                                    <label key={type} className="flex items-center gap-1.5 cursor-pointer">
                                      <input
                                        type="radio"
                                        name="storageType"
                                        value={type}
                                        checked={(systemSettings.storageType || 'sqlite') === type}
                                        onChange={() => setSystemSettings((s) => ({ ...s, storageType: type }))}
                                        className="accent-primary"
                                      />
                                      <span className="text-xs text-sidebar-foreground">{type === 'file' ? 'File' : 'SQLite'}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>

                              {(systemSettings.storageType || 'sqlite') === 'file' ? (
                                <div className="mt-4 flex flex-col gap-1">
                                  <label className="text-xs font-bold text-sidebar-foreground/90">Data File Path</label>
                                  <div className="flex gap-1">
                                    <input
                                      value={systemSettings.dataPath}
                                      onChange={(e) => setSystemSettings((s) => ({ ...s, dataPath: e.target.value }))}
                                      placeholder={workspace.workspacePath || 'Select folder...'}
                                      className="min-w-0 flex-1 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/40 focus:border-sidebar-ring"
                                    />
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const result = typeof api.pickDirectory === 'function'
                                          ? await api.pickDirectory()
                                          : await api.openWorkspace();
                                        const directoryPath = result?.directoryPath ?? result?.workspacePath;
                                        if (!result.canceled && directoryPath) {
                                          setSystemSettings((s) => ({ ...s, dataPath: String(directoryPath) }));
                                        }
                                      }}
                                      className="flex h-auto shrink-0 items-center justify-center rounded-md border border-sidebar-border px-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                                      title="Browse folder..."
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                      </svg>
                                    </button>
                                  </div>
                                  <span className="text-[10px] text-sidebar-foreground/50">AGENT_WORLD_DATA_PATH</span>
                                </div>
                              ) : (
                                <div className="mt-4 flex flex-col gap-1">
                                  <label className="text-xs font-bold text-sidebar-foreground/90">Database File</label>
                                  <div className="flex gap-1">
                                    <input
                                      value={systemSettings.sqliteDatabase}
                                      onChange={(e) => setSystemSettings((s) => ({ ...s, sqliteDatabase: e.target.value }))}
                                      placeholder={workspace.workspacePath ? `${workspace.workspacePath}/database.db` : 'Select file...'}
                                      className="min-w-0 flex-1 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/40 focus:border-sidebar-ring"
                                    />
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const result = await api.pickFile();
                                        if (!result.canceled && result.filePath) {
                                          setSystemSettings((s) => ({ ...s, sqliteDatabase: String(result.filePath) }));
                                        }
                                      }}
                                      className="flex h-auto shrink-0 items-center justify-center rounded-md border border-sidebar-border px-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                                      title="Browse file..."
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                      </svg>
                                    </button>
                                  </div>
                                  <span className="text-[10px] text-sidebar-foreground/50">AGENT_WORLD_SQLITE_DATABASE</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-auto flex justify-end gap-2 border-t border-sidebar-border bg-sidebar pt-2">
                          <button
                            type="button"
                            onClick={onCancelSettings}
                            className="rounded-xl border border-sidebar-border px-3 py-1 text-xs text-sidebar-foreground hover:bg-sidebar-accent"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={onSaveSettings}
                            className="rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
                          >
                            {settingsNeedRestart ? 'Save & Restart' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : panelMode === 'edit-world' && loadedWorld ? (
                      <>
                        <form onSubmit={onUpdateWorld} className="flex min-h-0 flex-1 flex-col">
                          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-bold text-sidebar-foreground/90">World Name</label>
                              <div className="rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-xs text-sidebar-foreground/80">
                                {editingWorld.name}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-bold text-sidebar-foreground/90">Description</label>
                              <textarea
                                value={editingWorld.description}
                                onChange={(event) => setEditingWorld((value) => ({ ...value, description: event.target.value }))}
                                placeholder="Description (optional)"
                                className="h-20 w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                                disabled={updatingWorld || deletingWorld}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-sidebar-foreground/90">LLM Provider</label>
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
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-sidebar-foreground/90">LLM model</label>
                                <input
                                  value={editingWorld.chatLLMModel}
                                  onChange={(event) => setEditingWorld((value) => ({ ...value, chatLLMModel: event.target.value }))}
                                  placeholder="Chat LLM model"
                                  className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                                  disabled={updatingWorld || deletingWorld}
                                />
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-bold text-sidebar-foreground/90">Turn Limit</label>
                              <input
                                type="number"
                                min={MIN_TURN_LIMIT}
                                max="50"
                                value={editingWorld.turnLimit}
                                onChange={(event) => setEditingWorld((value) => ({ ...value, turnLimit: Number(event.target.value) || MIN_TURN_LIMIT }))}
                                className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                                disabled={updatingWorld || deletingWorld}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-bold text-sidebar-foreground/90">Main Agent</label>
                              <input
                                value={editingWorld.mainAgent}
                                onChange={(event) => setEditingWorld((value) => ({ ...value, mainAgent: event.target.value }))}
                                placeholder="Main agent (optional)"
                                className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                                disabled={updatingWorld || deletingWorld}
                              />
                            </div>
                            <div className="flex items-center justify-between rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground">
                              <span>Variables (.env): {String(editingWorld.variables || '').trim() ? 'Configured' : 'Not configured'}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setWorldConfigEditorField('variables');
                                  setWorldConfigEditorValue(editingWorld.variables || '');
                                  setWorldConfigEditorTarget('edit');
                                  setWorldConfigEditorOpen(true);
                                }}
                                className="rounded p-1 text-sidebar-foreground/50 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                                title="Expand variables editor"
                                disabled={updatingWorld || deletingWorld}
                              >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            </div>
                            <div className="flex items-center justify-between rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground">
                              <span>MCP Config: {String(editingWorld.mcpConfig || '').trim() ? 'Configured' : 'Not configured'}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setWorldConfigEditorField('mcpConfig');
                                  setWorldConfigEditorValue(editingWorld.mcpConfig || '');
                                  setWorldConfigEditorTarget('edit');
                                  setWorldConfigEditorOpen(true);
                                }}
                                className="rounded p-1 text-sidebar-foreground/50 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                                title="Expand MCP editor"
                                disabled={updatingWorld || deletingWorld}
                              >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div className="mt-auto flex justify-between gap-2 border-t border-sidebar-border bg-sidebar pt-2">
                            <button
                              type="button"
                              onClick={onDeleteWorld}
                              disabled={deletingWorld || updatingWorld}
                              className="rounded-xl border border-destructive/40 px-3 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Delete
                            </button>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={closePanel}
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
                          </div>
                        </form>
                      </>
                    ) : panelMode === 'create-agent' && loadedWorld ? (
                      <>
                        <form onSubmit={onCreateAgent} className="flex min-h-0 flex-1 flex-col">
                          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                            <AgentFormFields
                              agent={creatingAgent}
                              setAgent={setCreatingAgent}
                              disabled={savingAgent}
                              providerOptions={AGENT_PROVIDER_OPTIONS}
                              onExpandPrompt={() => {
                                setPromptEditorValue(creatingAgent.systemPrompt);
                                setPromptEditorTarget('create');
                                setPromptEditorOpen(true);
                              }}
                            />
                          </div>
                          <div className="mt-auto flex justify-between gap-2 border-t border-sidebar-border bg-sidebar pt-2">
                            <div></div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={closePanel}
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
                          </div>
                        </form>
                      </>
                    ) : panelMode === 'edit-agent' && loadedWorld && selectedAgentForPanel ? (
                      <>
                        <form onSubmit={onUpdateAgent} className="flex min-h-0 flex-1 flex-col">
                          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                            <AgentFormFields
                              agent={editingAgent}
                              setAgent={setEditingAgent}
                              disabled={savingAgent || deletingAgent}
                              providerOptions={AGENT_PROVIDER_OPTIONS}
                              onExpandPrompt={() => {
                                setPromptEditorValue(editingAgent.systemPrompt);
                                setPromptEditorTarget('edit');
                                setPromptEditorOpen(true);
                              }}
                            />
                          </div>
                          <div className="mt-auto flex justify-between gap-2 border-t border-sidebar-border bg-sidebar pt-2">
                            <button
                              type="button"
                              onClick={onDeleteAgent}
                              disabled={savingAgent || deletingAgent}
                              className="rounded-xl border border-destructive/40 px-3 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Delete
                            </button>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={closePanel}
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
                          </div>
                        </form>
                      </>
                    ) : (
                      <>
                        <form onSubmit={onCreateWorld} className="flex min-h-0 flex-1 flex-col">
                          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-bold text-sidebar-foreground/90">World Name</label>
                              <input
                                value={creatingWorld.name}
                                onChange={(event) => setCreatingWorld((value) => ({ ...value, name: event.target.value }))}
                                placeholder="World name"
                                className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-bold text-sidebar-foreground/90">Description</label>
                              <textarea
                                value={creatingWorld.description}
                                onChange={(event) => setCreatingWorld((value) => ({ ...value, description: event.target.value }))}
                                placeholder="Description (optional)"
                                className="h-20 w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-sidebar-foreground/90">LLM Provider</label>
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
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-sidebar-foreground/90">LLM model</label>
                                <input
                                  value={creatingWorld.chatLLMModel}
                                  onChange={(event) => setCreatingWorld((value) => ({ ...value, chatLLMModel: event.target.value }))}
                                  placeholder="Chat LLM model"
                                  className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                                />
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-bold text-sidebar-foreground/90">Turn Limit</label>
                              <input
                                type="number"
                                min={MIN_TURN_LIMIT}
                                max="50"
                                value={creatingWorld.turnLimit}
                                onChange={(event) => setCreatingWorld((value) => ({ ...value, turnLimit: Number(event.target.value) || MIN_TURN_LIMIT }))}
                                className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-bold text-sidebar-foreground/90">Main Agent</label>
                              <input
                                value={creatingWorld.mainAgent}
                                onChange={(event) => setCreatingWorld((value) => ({ ...value, mainAgent: event.target.value }))}
                                placeholder="Main agent (optional)"
                                className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                              />
                            </div>
                          </div>
                          <div className="mt-auto flex justify-between gap-2 border-t border-sidebar-border bg-sidebar pt-2">
                            <div></div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={closePanel}
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
                          </div>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>

          {(status.text || hasComposerActivity) ? (
            <div
              className={`px-5 pt-1 pb-2 text-xs ${hasComposerActivity
                ? 'bg-card text-muted-foreground'
                : status.kind === 'error'
                  ? 'bg-destructive/15 text-destructive'
                  : status.kind === 'success'
                    ? 'bg-secondary/20 text-secondary-foreground'
                    : 'bg-card text-muted-foreground'
                }`}
            >
              <div className="mx-auto w-full max-w-[750px]">
                {hasComposerActivity ? (
                  <div className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-card/40 px-3 py-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <ActivityPulse isActive={isAgentWorkInProgress} />
                      {activeTools.length > 0 ? (
                        <span className="shrink-0 text-muted-foreground/80">
                          · {activeTools.length} tool{activeTools.length === 1 ? '' : 's'}
                        </span>
                      ) : null}
                      {status.text ? (
                        <span
                          className={`truncate ${status.kind === 'error'
                            ? 'text-destructive'
                            : status.kind === 'success'
                              ? 'text-secondary-foreground'
                              : 'text-muted-foreground'}`}
                        >
                          · {status.text}
                        </span>
                      ) : null}
                    </div>
                    <ElapsedTimeCounter elapsedMs={elapsedMs} />
                  </div>
                ) : (
                  <div className="rounded-md bg-background/30 px-3 py-1.5">
                    {status.text}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </main>
      </div>

      {activeHitlPrompt ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-foreground">
              {activeHitlPrompt.title || 'Approval required'}
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
              {(activeHitlPrompt.message || 'Please choose an option to continue.').replace(/\n\s*\n+/g, '\n')}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {activeHitlPrompt.options.map((option) => {
                const isSubmitting = submittingHitlRequestId === activeHitlPrompt.requestId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => respondToHitlPrompt(activeHitlPrompt, option.id)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-left text-xs hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="font-medium text-foreground">{option.label}</div>
                    {option.description ? (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{option.description}</div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <PromptEditorModal
        open={promptEditorOpen}
        value={promptEditorValue}
        onChange={setPromptEditorValue}
        onClose={() => setPromptEditorOpen(false)}
        onApply={() => {
          if (promptEditorTarget === 'create') {
            setCreatingAgent((value) => ({ ...value, systemPrompt: promptEditorValue }));
          } else if (promptEditorTarget === 'edit') {
            setEditingAgent((value) => ({ ...value, systemPrompt: promptEditorValue }));
          }
          setPromptEditorOpen(false);
        }}
      />

      <WorldConfigEditorModal
        open={worldConfigEditorOpen}
        field={worldConfigEditorField}
        value={worldConfigEditorValue}
        onChange={setWorldConfigEditorValue}
        onClose={() => setWorldConfigEditorOpen(false)}
        onApply={() => {
          if (worldConfigEditorTarget === 'edit') {
            setEditingWorld((value) => ({
              ...value,
              [worldConfigEditorField]: worldConfigEditorValue
            }));
          }
          setWorldConfigEditorOpen(false);
        }}
      />
    </div>
  );
}
