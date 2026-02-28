/**
 * Message List Panel Component
 * Purpose:
 * - Render the chat message area, including welcome state, message cards, and inline working indicator.
 *
 * Key Features:
 * - Welcome/skills empty state for new sessions.
 * - Message card rendering with edit/delete/branch actions.
 * - Inline `<agent> is working...` indicator under the message list.
 *
 * Implementation Notes:
 * - Preserves existing App renderer behavior by reusing current utility helpers and action callbacks.
 * - Receives state/actions via props from App orchestration.
 *
 * Recent Changes:
 * - 2026-02-28: Backfilled tool-result rows with matching assistant tool-request metadata so combined tool cards can show request args with results.
 * - 2026-02-28: Added tool-name backfill for persisted tool-result rows (via linked assistant `tool_calls`) so status labels render `tool - <name> - <status>`.
 * - 2026-02-27: Added `showToolMessages` prop-driven filtering so tool-related rows can be hidden from the main transcript.
 * - 2026-02-27: Added collapse/expand toggles for assistant message cards (tool-parity interaction).
 * - 2026-02-27: Reintroduced assistant-card user prompt preview above the `<model> ......` wait row for pre-chunk context.
 * - 2026-02-27: Limited tool request/result merge to tool-styled rows only so assistant cards and tool cards can both remain visible.
 * - 2026-02-27: Restored user message header label as `You` in blue user cards.
 * - 2026-02-27: Removed embedded input-preview handoff so user context stays in the original blue user message card.
 * - 2026-02-27: Hidden `HUMAN` title text in user message headers while preserving timestamp/actions.
 * - 2026-02-27: Streaming placeholder now passes model label to message content so pre-chunk wait text renders as `<model> ......`.
 * - 2026-02-27: Hidden branch/copy actions for non-finalized assistant messages (`isStreaming`/`isToolStreaming`) to avoid controls on in-progress cards.
 * - 2026-02-27: Tool cards now show `sender + tool-status` in the top metadata row and suppress duplicate in-body tool header text.
 * - 2026-02-27: Combined tool-request and matching tool-result rows into a single rendered card by merging matched tool outputs into the request card.
 * - 2026-02-27: Tool-request card animation now auto-stops once matching tool_call_id results are observed.
 * - 2026-02-27: Added active tool-call card animation for `calling tool` and live tool-stream rows.
 * - 2026-02-27: Added animated streaming-message card class hook so active assistant bubbles show a clear in-place working effect.
 * - 2026-02-24: Tool-related cards now default to collapsed with explicit per-message collapse overrides so users can reliably expand/re-collapse items.
 * - 2026-02-21: Added assistant-message action button to copy raw markdown beside branch action.
 * - 2026-02-20: Added inline message-flow HITL prompt card rendering for option prompts, replacing overlay-only HITL UX.
 * - 2026-02-20: Added message-loading guard so session switches render loading state instead of welcome-card flicker.
 * - 2026-02-20: Aligned renderable message filtering with App welcome-state logic to prevent empty-state flicker.
 * - 2026-02-20: Suppressed edit/delete actions for pending optimistic user messages until backend confirmation.
 * - 2026-02-19: Inline indicator now supports primary single-agent status text (`inlineStatusText`) separate from full status-bar state.
 * - 2026-02-19: Added support for preformatted inline activity status text (per-agent phase strings).
 * - 2026-02-19: Replaced single-agent inline working label with richer activity details and elapsed time.
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 4 component extraction.
 */

import { useState } from 'react';
import MessageContent, { getToolStatusLabel } from './MessageContent';
import ElapsedTimeCounter from './ElapsedTimeCounter';
import { compactSkillDescription, formatTime } from '../utils/formatting';
import {
  getMessageCardClassName,
  getMessageIdentity,
  getMessageSenderLabel,
  findToolRequestMessageForToolResult,
  isRenderableMessageEntry,
  isHumanMessage,
  isToolRelatedMessage,
  isTrueAgentResponseMessage,
  resolveMessageAvatar,
} from '../utils/message-utils';

function collectToolCallIds(message) {
  if (!Array.isArray(message?.tool_calls)) {
    return [];
  }
  return message.tool_calls
    .map((toolCall) => String(toolCall?.id || '').trim())
    .filter(Boolean);
}

function isToolRequestMessage(message) {
  if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
    return true;
  }
  return /calling tool\s*:/i.test(String(message?.content || ''));
}

function extractToolNameFromToolCalls(message, preferredToolCallId = '') {
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  if (toolCalls.length === 0) {
    return '';
  }

  const normalizedPreferredToolCallId = String(preferredToolCallId || '').trim();
  if (normalizedPreferredToolCallId) {
    const exactMatch = toolCalls.find((toolCall) => String(toolCall?.id || '').trim() === normalizedPreferredToolCallId);
    const exactToolName = String(exactMatch?.function?.name || exactMatch?.name || '').trim();
    if (exactToolName) {
      return exactToolName;
    }
  }

  const firstToolName = String(toolCalls[0]?.function?.name || toolCalls[0]?.name || '').trim();
  return firstToolName;
}

function resolveToolNameForMessage(message, messagesById, messages, currentIndex) {
  const directToolName = String(message?.toolName || message?.tool_name || message?.toolExecution?.toolName || '').trim();
  if (directToolName && directToolName.toLowerCase() !== 'unknown') {
    return directToolName;
  }

  const toolCallId = String(message?.tool_call_id || message?.toolCallId || '').trim();
  const replyToMessageId = String(message?.replyToMessageId || '').trim();
  if (replyToMessageId) {
    const parent = messagesById.get(replyToMessageId);
    const parentToolName = extractToolNameFromToolCalls(parent, toolCallId);
    if (parentToolName) {
      return parentToolName;
    }
  }

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    const role = String(candidate?.role || '').trim().toLowerCase();
    if (role !== 'assistant') {
      continue;
    }
    const candidateToolName = extractToolNameFromToolCalls(candidate, toolCallId);
    if (candidateToolName) {
      return candidateToolName;
    }
  }

  return directToolName;
}

function hasPendingToolCalls(message, messages, currentIndex) {
  const requestedCallIds = collectToolCallIds(message);
  if (requestedCallIds.length === 0) {
    return false;
  }

  const pendingCallIds = new Set(requestedCallIds);
  const toolCallStatus = message?.toolCallStatus && typeof message.toolCallStatus === 'object'
    ? message.toolCallStatus
    : null;

  if (toolCallStatus) {
    for (const callId of requestedCallIds) {
      const statusEntry = toolCallStatus[callId];
      if (statusEntry?.complete === true) {
        pendingCallIds.delete(callId);
      }
    }
  }

  if (pendingCallIds.size === 0) {
    return false;
  }

  const combinedToolResults = Array.isArray(message?.combinedToolResults) ? message.combinedToolResults : [];
  for (const result of combinedToolResults) {
    const completionKey = String(result?.tool_call_id || result?.messageId || '').trim();
    if (!completionKey) {
      continue;
    }
    pendingCallIds.delete(completionKey);
  }

  if (pendingCallIds.size === 0) {
    return false;
  }

  for (let index = currentIndex + 1; index < messages.length; index += 1) {
    const candidate = messages[index];
    const candidateRole = String(candidate?.role || '').trim().toLowerCase();
    if (candidateRole !== 'tool') {
      continue;
    }
    const completionKey = String(candidate?.tool_call_id || candidate?.messageId || '').trim();
    if (!completionKey) {
      continue;
    }
    pendingCallIds.delete(completionKey);
    if (pendingCallIds.size === 0) {
      return false;
    }
  }

  return true;
}

function buildCombinedRenderableMessages(messages) {
  const toolResultsByKey = new Map<string, Array<any>>();

  for (const message of messages) {
    const role = String(message?.role || '').trim().toLowerCase();
    if (role !== 'tool') {
      continue;
    }
    const completionKey = String(message?.tool_call_id || message?.messageId || '').trim();
    if (!completionKey) {
      continue;
    }
    const existing = toolResultsByKey.get(completionKey) || [];
    existing.push(message);
    toolResultsByKey.set(completionKey, existing);
  }

  const consumedToolResultIds = new Set<string>();

  return messages
    .map((message) => {
      if (!isToolRelatedMessage(message) || !isToolRequestMessage(message)) {
        return message;
      }

      const requestedCallIds = collectToolCallIds(message);
      if (requestedCallIds.length === 0) {
        return message;
      }

      const combinedToolResults: Array<any> = [];
      for (const callId of requestedCallIds) {
        const matches = toolResultsByKey.get(callId) || [];
        for (const match of matches) {
          const matchMessageId = String(match?.messageId || '').trim();
          if (matchMessageId) {
            consumedToolResultIds.add(matchMessageId);
          }
          combinedToolResults.push(match);
        }
      }

      if (combinedToolResults.length === 0) {
        return message;
      }

      return {
        ...message,
        combinedToolResults,
      };
    })
    .filter((message) => {
      const role = String(message?.role || '').trim().toLowerCase();
      if (role !== 'tool') {
        return true;
      }
      const messageId = String(message?.messageId || '').trim();
      if (!messageId) {
        return true;
      }
      return !consumedToolResultIds.has(messageId);
    });
}

function resolveMessageModelLabel(message, worldAgentsById, worldAgentsByName) {
  const fromAgentId = String(message?.fromAgentId || '').trim();
  if (fromAgentId && worldAgentsById?.has(fromAgentId)) {
    const fromAgent = worldAgentsById.get(fromAgentId);
    const modelById = String(fromAgent?.model || '').trim();
    if (modelById) return modelById;
  }

  const sender = String(message?.sender || '').trim().toLowerCase();
  if (sender && worldAgentsByName?.has(sender)) {
    const fromName = worldAgentsByName.get(sender);
    const modelByName = String(fromName?.model || '').trim();
    if (modelByName) return modelByName;
  }

  return 'model';
}

function extractStreamingInputPreview(message, messagesById, messages, messageIndex) {
  const replyToMessageId = String(message?.replyToMessageId || '').trim();
  if (replyToMessageId) {
    const parent = messagesById.get(replyToMessageId);
    if (isHumanMessage(parent)) {
      const text = String(parent?.content || '').trim();
      if (text) {
        return text;
      }
    }
  }

  for (let index = messageIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (!isHumanMessage(candidate)) {
      continue;
    }
    const text = String(candidate?.content || '').trim();
    if (text) {
      return text;
    }
  }

  return '';
}

export default function MessageListPanel({
  messagesContainerRef,
  messagesLoading,
  hasConversationMessages,
  selectedSession,
  refreshSkillRegistry,
  loadingSkillRegistry,
  visibleSkillRegistryEntries,
  skillRegistryError,
  showToolMessages = true,
  messages,
  messagesById,
  worldAgentsById,
  worldAgentsByName,
  editingText,
  setEditingText,
  editingMessageId,
  deletingMessageId,
  onCancelEditMessage,
  onSaveEditMessage,
  onStartEditMessage,
  onDeleteMessage,
  onBranchFromMessage,
  onCopyRawMarkdownFromMessage,
  showInlineWorkingIndicator,
  inlineWorkingIndicatorState,
  activeHitlPrompt,
  submittingHitlRequestId,
  onRespondHitlOption,
}) {
  const inlinePrimaryText = String(inlineWorkingIndicatorState?.primaryText || 'Agent');
  const inlineStatusText = String(
    inlineWorkingIndicatorState?.inlineStatusText
    || inlineWorkingIndicatorState?.statusText
    || ''
  ).trim();
  const inlineDetailText = String(inlineWorkingIndicatorState?.detailText || '').trim();
  const inlineElapsedMs = Number(inlineWorkingIndicatorState?.elapsedMs || 0);
  const renderableMessages = buildCombinedRenderableMessages(
    messages
      .filter(isRenderableMessageEntry)
      .filter((message) => showToolMessages || !isToolRelatedMessage(message))
  );
  const shouldShowLoading = messagesLoading && renderableMessages.length === 0;
  const [messageCollapseOverrides, setMessageCollapseOverrides] = useState<Record<string, boolean>>({});
  const toggleMessageCollapsed = (messageId: string, currentCollapsed: boolean) => {
    setMessageCollapseOverrides((prev) => ({
      ...prev,
      [messageId]: !currentCollapsed,
    }));
  };

  const isMessageCollapsed = (message, messageKey: string | null, isCollapsible: boolean) => {
    if (!isCollapsible || !messageKey) return false;
    if (Object.prototype.hasOwnProperty.call(messageCollapseOverrides, messageKey)) {
      return Boolean(messageCollapseOverrides[messageKey]);
    }
    return isToolRelatedMessage(message);
  };
  const shouldShowWelcome = !messagesLoading && !hasConversationMessages;

  return (
    <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden p-5">
      <div
        className={
          shouldShowWelcome && selectedSession
            ? 'mx-auto flex min-h-full w-full max-w-[920px] items-start justify-center py-4'
            : 'mx-auto w-full max-w-[750px] space-y-3'
        }
      >
        {shouldShowLoading ? (
          selectedSession ? (
            <section className="w-full max-w-[680px] rounded-xl bg-card/40 px-6 py-5">
              <p className="text-sm text-muted-foreground">Loading messages...</p>
            </section>
          ) : (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              Select a session from the left column.
            </div>
          )
        ) : shouldShowWelcome ? (
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
                    {visibleSkillRegistryEntries.length}
                  </span>
                </div>

                {loadingSkillRegistry ? (
                  <p className="text-sm text-muted-foreground">Loading skills...</p>
                ) : visibleSkillRegistryEntries.length > 0 ? (
                  <div className="max-h-[48vh] overflow-y-auto pr-1">
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {visibleSkillRegistryEntries.map((entry) => (
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
          renderableMessages.map((message, messageIndex) => {
            const senderLabel = getMessageSenderLabel(
              message,
              messagesById,
              renderableMessages,
              messageIndex,
              worldAgentsById,
              worldAgentsByName
            );
            const messageKey = message.messageId;
            const messageAvatar = resolveMessageAvatar(message, worldAgentsById, worldAgentsByName);
            const isHuman = isHumanMessage(message);
            const isPendingOptimisticUserMessage = isHuman && message?.optimisticUserPending === true;
            const messageRole = String(message?.role || '').toLowerCase();
            const isToolMessage = isToolRelatedMessage(message);
            const resolvedToolName = isToolMessage
              ? resolveToolNameForMessage(message, messagesById, renderableMessages, messageIndex)
              : '';
            const messageModelLabel = resolveMessageModelLabel(message, worldAgentsById, worldAgentsByName);
            const streamingInputPreview = extractStreamingInputPreview(message, messagesById, renderableMessages, messageIndex);
            const shouldRightAlignMessage = isHuman || isToolMessage || messageRole === 'assistant';
            const hasToolCalls = Array.isArray(message?.tool_calls) && message.tool_calls.length > 0;
            const isToolCallRequestMessage = isToolRequestMessage(message);
            const isPendingToolCallRequest = isToolCallRequestMessage && hasPendingToolCalls(message, renderableMessages, messageIndex);
            const toolStatusLabel = isToolMessage ? getToolStatusLabel(message, isPendingToolCallRequest, resolvedToolName) : '';
            const linkedToolRequestMessage = isToolMessage
              ? findToolRequestMessageForToolResult(message, messagesById, renderableMessages, messageIndex)
              : null;
            const isStreamingAssistantMessage = Boolean(message?.isStreaming) && messageRole === 'assistant' && !isToolMessage;
            const isFinalizedAssistantMessage = message?.isStreaming !== true && message?.isToolStreaming !== true;
            const isActiveToolMessage = isToolMessage && (Boolean(message?.isToolStreaming) || isPendingToolCallRequest);
            const isBranchableAgentMessage = !isHuman
              && isFinalizedAssistantMessage
              && isTrueAgentResponseMessage(message)
              && Boolean(message.messageId);
            const isAssistantMessage = messageRole === 'assistant' && !isToolMessage;
            const isCollapsible = isToolMessage || (isAssistantMessage && Boolean(messageKey));
            const isCollapsed = isMessageCollapsed(message, messageKey, isCollapsible);
            const normalizedEditedText = editingText.trim();
            const normalizedOriginalText = String(message?.content || '').trim();
            const isEditChanged = Boolean(normalizedEditedText) && normalizedEditedText !== normalizedOriginalText;
            return (
              <div
                key={messageKey}
                className={`flex min-w-0 w-full items-start gap-2 ${shouldRightAlignMessage ? 'justify-end' : 'justify-start'}`}
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

                <article className={`min-w-0 ${getMessageCardClassName(message, messagesById, renderableMessages, messageIndex)} ${isStreamingAssistantMessage ? 'agent-streaming-card' : ''} ${isActiveToolMessage ? 'agent-tool-active-card' : ''}`}>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    {isToolMessage ? (
                      <span className="flex items-center gap-2">
                        <span>{senderLabel}</span>
                        <span className="font-medium text-foreground/80">{toolStatusLabel}</span>
                      </span>
                    ) : (
                      <span>{isHuman ? 'You' : senderLabel}</span>
                    )}
                    <div className="flex items-center gap-1">
                      <span>{formatTime(message.createdAt)}</span>
                      {isCollapsible && messageKey ? (
                        <button
                          type="button"
                          onClick={() => toggleMessageCollapsed(messageKey, isCollapsed)}
                          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                          title={isCollapsed ? 'Expand' : 'Collapse'}
                          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                        >
                          {isCollapsed ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                              <path d="m18 15-6-6-6 6" />
                            </svg>
                          )}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {editingMessageId === getMessageIdentity(message) ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingText}
                        onChange={(event) => setEditingText(event.target.value)}
                        className="w-full rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-sidebar-foreground outline-none focus:border-sidebar-ring focus:ring-2 focus:ring-sidebar-ring/20 resize-none transition-all"
                        rows={3}
                        autoFocus
                        placeholder="Edit your message..."
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            onCancelEditMessage();
                          }
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={onCancelEditMessage}
                          className="rounded-md border border-sidebar-border bg-sidebar px-3 py-1.5 text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent focus:outline-none focus:ring-2 focus:ring-sidebar-ring/50 transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => onSaveEditMessage(message)}
                          disabled={!isEditChanged}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <MessageContent
                      message={(() => {
                        let nextMessage = message;
                        if (resolvedToolName && !String(message?.toolName || '').trim()) {
                          nextMessage = { ...nextMessage, toolName: resolvedToolName };
                        }
                        if (linkedToolRequestMessage && !(Array.isArray(message?.tool_calls) && message.tool_calls.length > 0)) {
                          nextMessage = { ...nextMessage, linkedToolRequest: linkedToolRequestMessage };
                        }
                        return nextMessage;
                      })()}
                      collapsed={isCollapsed}
                      isToolCallPending={isPendingToolCallRequest}
                      showToolHeader={!isToolMessage}
                      streamingDotsLabel={messageModelLabel}
                      streamingInputPreview={streamingInputPreview}
                    />
                  )}

                  {isHumanMessage(message) && message.messageId && !isPendingOptimisticUserMessage && editingMessageId !== getMessageIdentity(message) ? (
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

                  {isBranchableAgentMessage && editingMessageId !== getMessageIdentity(message) ? (
                    <div className="mt-2 flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => onBranchFromMessage(message)}
                        className="rounded p-1 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-foreground/10 focus:outline-none focus:ring-2 focus:ring-sidebar-ring transition-all bg-background/80 backdrop-blur-sm"
                        title="Branch chat from this message"
                        aria-label="Branch chat from this message"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 3v12" />
                          <circle cx="18" cy="6" r="3" />
                          <circle cx="6" cy="18" r="3" />
                          <path d="M9 18h6a3 3 0 0 0 3-3V9" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => onCopyRawMarkdownFromMessage(message)}
                        className="rounded p-1 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-foreground/10 focus:outline-none focus:ring-2 focus:ring-sidebar-ring transition-all bg-background/80 backdrop-blur-sm"
                        title="Copy raw markdown"
                        aria-label="Copy raw markdown"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
                    </div>
                  ) : null}
                </article>
              </div>
            );
          })
        )}

        {activeHitlPrompt ? (
          <div className="flex min-w-0 w-full items-start gap-2 justify-start">
            <article className="min-w-0 w-full rounded-lg border border-dashed border-border bg-card/70 px-3 py-3">
              <div className="mb-1 text-xs font-semibold text-foreground">
                {activeHitlPrompt.title || 'Human input required'}
              </div>
              <div className="whitespace-pre-wrap text-xs text-muted-foreground">
                {(activeHitlPrompt.message || 'Please choose an option to continue.').replace(/\n\s*\n+/g, '\n')}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {activeHitlPrompt.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    disabled={submittingHitlRequestId === activeHitlPrompt.requestId}
                    onClick={() => onRespondHitlOption(activeHitlPrompt, option.id)}
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
                    title={option.description || option.label}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </article>
          </div>
        ) : null}

        {showInlineWorkingIndicator ? (
          <div className="flex w-full items-start gap-2 justify-start">
            <div className="flex flex-wrap items-center gap-2 px-1 py-1 text-[13px] text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-foreground/70 animate-pulse" aria-hidden="true"></span>
              <div className="text-[13px]">
                {inlineStatusText || `${inlinePrimaryText} working...`}
              </div>
              {inlineDetailText ? (
                <div className="text-[12px] text-muted-foreground/85">
                  · {inlineDetailText}
                </div>
              ) : null}
              <ElapsedTimeCounter elapsedMs={inlineElapsedMs} showIcon={false} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
