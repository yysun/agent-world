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
 * - 2026-03-22: Prefer terminal tool result rows over transient `-stdout` shell stream rows when both map to the same tool call, preventing duplicate result blocks inside merged Electron tool cards.
 * - 2026-03-21: Restored web-parity collapse defaults for merged Electron tool rows and keyed tool collapse state by tool-call id when assistant request rows have no message id.
 * - 2026-03-21: Restored collapse-toggle controls for completed merged Electron tool request rows so request/result transcript rows match the web tool affordance.
 * - 2026-03-21: Re-consumed placeholder-linked tool result rows after structured preview work so merged Electron tool cards do not duplicate standalone tool transcript entries.
 * - 2026-03-15: Merged live shell stdout rows keyed as `toolUseId-stdout` into their calling-tool request cards so streaming tool output no longer renders as a duplicate transcript row.
 * - 2026-03-13: Keep completed assistant reasoning in a separate collapsed panel so reasoning stays available after stream completion without expanding the whole card by default.
 * - 2026-03-13: Removed chat-era left offsets from non-chat message cards so hidden avatars do not leave unused gutter space in Electron world views.
 * - 2026-03-13: Preserved narrated assistant tool-call status metadata before `showToolMessages=false` filtering so hidden tool rows do not remove success/failure border state from assistant cards.
 * - 2026-03-13: Reserved avatar-column spacing for tool transcript rows so compact tool summaries align with normal message left edges.
 * - 2026-03-13: Suppressed agent avatar chips for tool transcript rows so compact tool status lines do not inherit assistant-avatar chrome.
 * - 2026-03-13: Flattened tool transcript rows into compact dot-status lines and defaulted tool details to collapsed.
 * - 2026-03-10: Keep edit/delete action chrome visible on the latest failed user turn when only diagnostic error rows follow it.
 * - 2026-03-04: Board agent lanes now stretch to full available height with per-lane internal scrolling.
 * - 2026-03-04: Board view now renders per-agent vertical lanes in a horizontal lane strip.
 * - 2026-03-04: Hid non-chat section title labels (`Latest User Message`, `Board`, `Grid`, `Canvas`) per updated UI requirements.
 * - 2026-03-04: Added floating-composer bottom inset spacing for bottom panes so board/grid/canvas content remains visible above overlay controls.
 * - 2026-03-04: Made non-chat layouts use static top row + flexing bottom row so the lower pane consumes available height.
 * - 2026-03-04: Non-chat world views now render as two rows (top latest user message, bottom board/grid/canvas) using full-width layout.
 * - 2026-03-04: Hide per-message avatar chips and left border accents outside `Chat View`.
 * - 2026-03-04: Added `Chat/Board/Grid/Canvas` view-mode rendering with agent lanes/cells/shared-canvas layouts and grid choice support.
 * - 2026-03-01: Changed collapsible message cards (assistant/tool) to default expanded state; per-message toggle overrides still apply.
 * - 2026-03-01: Kept narrated assistant tool-call messages as assistant cards; only placeholder `Calling tool:` rows are merged into tool cards.
 * - 2026-03-01: Fixed stale `tool: <name> - running` cards by treating reply-linked tool result rows as completion signals when `tool_call_id` metadata is absent.
 * - 2026-02-28: Switched tool-name resolution to shared message-utils helper so assistant tool-request rows prefer their own `tool_calls` metadata.
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
import MessageContent, {
  getInitialReasoningCollapsedState,
  getToolStatusLabel,
  getToolStatusTone
} from './MessageContent';
import ElapsedTimeCounter from './ElapsedTimeCounter';
import { compactSkillDescription, formatTime } from '../utils/formatting';
import {
  getGridContainerClassName,
  getGridLaneClassName,
  normalizeWorldGridLayoutChoiceId,
  normalizeWorldViewMode,
  partitionWorldViewMessages,
  sortAgentLanesForGrid,
} from '../domain/world-view';
import {
  getMessageCardClassName,
  getMessageIdentity,
  getMessageSenderLabel,
  findToolRequestMessageForToolResult,
  isRenderableMessageEntry,
  isHumanMessage,
  isToolRelatedMessage,
  isTrueAgentResponseMessage,
  resolveToolNameForMessage,
  resolveMessageAvatar,
} from '../utils/message-utils';

export function shouldShowMessageChrome(worldViewMode: unknown): boolean {
  return normalizeWorldViewMode(worldViewMode) === 'chat';
}

export function shouldShowMessageAvatar(showChatMessageChrome: boolean, hasMessageAvatar: boolean, isToolMessage: boolean): boolean {
  return showChatMessageChrome && hasMessageAvatar && !isToolMessage;
}

export function shouldReserveToolAvatarSpace(showChatMessageChrome: boolean, isToolMessage: boolean): boolean {
  return showChatMessageChrome && isToolMessage;
}

export function shouldRenderNonChatSectionLabels(): boolean {
  return false;
}

export function getBoardLaneContainerClassName(): string {
  return 'flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto pb-1';
}

export function getBoardLaneClassName(): string {
  return 'min-w-[260px] flex-1 min-h-0 rounded-lg border border-border/70 bg-card/40 p-3 flex flex-col';
}

export function getBoardBottomSectionClassName(): string {
  return 'min-h-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card/25 p-3 pb-[var(--floating-composer-height,8.5rem)] flex flex-col gap-3';
}

export function getLatestUserMessageEntry(userMessages: Array<{ message: any; index: number }>): { message: any; index: number } | null {
  if (!Array.isArray(userMessages) || userMessages.length === 0) {
    return null;
  }
  return userMessages[userMessages.length - 1] || null;
}

function isDiagnosticErrorMessage(message: any): boolean {
  const logLevel = String(message?.logEvent?.level || '').trim().toLowerCase();
  if (logLevel === 'error') {
    return true;
  }

  const systemKind = String(message?.systemEvent?.kind || '').trim().toLowerCase();
  if (systemKind === 'error') {
    return true;
  }

  const messageType = String(message?.type || '').trim().toLowerCase();
  if (message?.hasError === true || messageType === 'error') {
    return true;
  }

  return false;
}

export function shouldForceHumanMessageActionsVisible(messages: any[], messageIndex: number): boolean {
  if (!Array.isArray(messages) || messageIndex < 0 || messageIndex >= messages.length) {
    return false;
  }

  const currentMessage = messages[messageIndex];
  if (!isHumanMessage(currentMessage)) {
    return false;
  }

  const laterMessages = messages.slice(messageIndex + 1).filter((message) => {
    return isRenderableMessageEntry(message);
  });
  if (laterMessages.length === 0) {
    return false;
  }

  let sawDiagnosticError = false;
  for (const message of laterMessages) {
    if (isDiagnosticErrorMessage(message)) {
      sawDiagnosticError = true;
      continue;
    }
    return false;
  }

  return sawDiagnosticError;
}

function collectToolCallIds(message) {
  if (!Array.isArray(message?.tool_calls)) {
    return [];
  }
  return message.tool_calls
    .map((toolCall) => String(toolCall?.id || '').trim())
    .filter(Boolean);
}

function normalizeToolResultLookupKey(value) {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) {
    return '';
  }

  if (normalizedValue.endsWith('-stdout')) {
    return normalizedValue.slice(0, -'-stdout'.length);
  }

  return normalizedValue;
}

function collectToolResultLookupKeys(message) {
  const lookupKeys = new Set<string>();
  const toolCallId = String(message?.tool_call_id || message?.toolCallId || '').trim();
  const messageId = String(message?.messageId || '').trim();

  for (const candidateKey of [toolCallId, messageId]) {
    if (!candidateKey) {
      continue;
    }
    lookupKeys.add(candidateKey);
    const normalizedKey = normalizeToolResultLookupKey(candidateKey);
    if (normalizedKey) {
      lookupKeys.add(normalizedKey);
    }
  }

  return Array.from(lookupKeys);
}

function resolveCombinedToolResultIdentity(message: any): string {
  const toolCallId = String(message?.tool_call_id || message?.toolCallId || '').trim();
  if (toolCallId) {
    return normalizeToolResultLookupKey(toolCallId);
  }

  const messageId = String(message?.messageId || '').trim();
  if (messageId) {
    return normalizeToolResultLookupKey(messageId);
  }

  return '';
}

function filterSupersededStreamingToolRows(results: any[]): any[] {
  if (!Array.isArray(results) || results.length <= 1) {
    return Array.isArray(results) ? results : [];
  }

  const terminalKeys = new Set<string>();
  for (const result of results) {
    if (result?.isToolStreaming === true) {
      continue;
    }

    const identity = resolveCombinedToolResultIdentity(result);
    if (identity) {
      terminalKeys.add(identity);
    }
  }

  if (terminalKeys.size === 0) {
    return results;
  }

  return results.filter((result) => {
    if (result?.isToolStreaming !== true) {
      return true;
    }

    const identity = resolveCombinedToolResultIdentity(result);
    return !identity || !terminalKeys.has(identity);
  });
}

function isToolRequestMessage(message) {
  if (isNarratedAssistantToolCallMessage(message)) {
    return false;
  }

  if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
    return true;
  }
  return /calling tool\s*:/i.test(String(message?.content || ''));
}

export function isNarratedAssistantToolCallMessage(message) {
  const role = String(message?.role || '').trim().toLowerCase();
  if (role !== 'assistant') {
    return false;
  }

  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  if (toolCalls.length === 0) {
    return false;
  }

  const content = String(message?.content || '').trim();
  if (!content) {
    return false;
  }

  return !/^calling tool\s*:/i.test(content);
}

function consumePendingToolCallFromResult(
  pendingCallIds,
  requestedToolCalls,
  requestMessageId,
  resultMessage,
) {
  const completionKey = String(resultMessage?.tool_call_id || resultMessage?.messageId || '').trim();
  if (completionKey) {
    if (pendingCallIds.has(completionKey)) {
      pendingCallIds.delete(completionKey);
      return;
    }
  }

  const replyToMessageId = String(resultMessage?.replyToMessageId || '').trim();
  if (!requestMessageId || !replyToMessageId || replyToMessageId !== requestMessageId) {
    return;
  }

  const resultToolName = String(resultMessage?.toolName || '').trim().toLowerCase();
  if (resultToolName) {
    for (const requested of requestedToolCalls) {
      const callId = String(requested?.id || '').trim();
      const callName = String(requested?.function?.name || requested?.name || '').trim().toLowerCase();
      if (!callId || !callName) {
        continue;
      }
      if (callName === resultToolName) {
        pendingCallIds.delete(callId);
        return;
      }
    }
  }

  // If this request has exactly one pending tool call left, a reply-linked tool row
  // is sufficient to mark it complete even when tool_call_id metadata is unavailable.
  if (pendingCallIds.size === 1) {
    pendingCallIds.clear();
  }
}

export function hasPendingToolCallsForMessage(message, messages, currentIndex) {
  const requestedCallIds = collectToolCallIds(message);
  if (requestedCallIds.length === 0) {
    return false;
  }

  const requestedToolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const requestMessageId = String(message?.messageId || '').trim();
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
    consumePendingToolCallFromResult(pendingCallIds, requestedToolCalls, requestMessageId, result);
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
    consumePendingToolCallFromResult(pendingCallIds, requestedToolCalls, requestMessageId, candidate);
    if (pendingCallIds.size === 0) {
      return false;
    }
  }

  return true;
}

function hasPendingToolCalls(message, messages, currentIndex) {
  return hasPendingToolCallsForMessage(message, messages, currentIndex);
}

export function getInitialMessageCollapsedState(message: any, isCollapsible: boolean): boolean {
  if (!isCollapsible) {
    return false;
  }

  const isToolRow = isToolRelatedMessage(message) && !isNarratedAssistantToolCallMessage(message);
  if (isToolRow) {
    return true;
  }

  // Assistant cards remain expanded by default; explicit user toggles are tracked in messageCollapseOverrides.
  return false;
}

export function getMessageCollapseKey(message: any): string | null {
  const messageId = String(message?.messageId || '').trim();
  if (messageId) {
    return messageId;
  }

  const toolCallId = String(message?.tool_call_id || message?.toolCallId || '').trim();
  if (toolCallId) {
    return toolCallId;
  }

  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const firstToolCallId = String(toolCalls[0]?.id || '').trim();
  if (firstToolCallId) {
    return firstToolCallId;
  }

  return null;
}

export function getMessageCollapseToggleLabel(isCollapsed: boolean): 'Open' | 'Collapse' {
  return isCollapsed ? 'Open' : 'Collapse';
}

function hasMergedToolTranscriptContent(message: any): boolean {
  const combinedToolResults = Array.isArray(message?.combinedToolResults) ? message.combinedToolResults : [];
  if (combinedToolResults.length > 0) {
    return true;
  }

  const combinedToolStreams = Array.isArray(message?.combinedToolStreams) ? message.combinedToolStreams : [];
  return combinedToolStreams.length > 0;
}

function getSyntheticToolResultCallId(message: any): string {
  return String(message?.syntheticToolResult?.toolCallId || '').trim();
}

function getSyntheticToolResultSourceMessageId(message: any): string {
  return String(message?.syntheticToolResult?.sourceMessageId || '').trim();
}

function getToolSummaryDotClassName(statusTone: string): string {
  if (statusTone === 'failed') {
    return 'bg-red-400';
  }
  if (statusTone === 'done') {
    return 'bg-emerald-400';
  }
  return 'bg-amber-400 animate-pulse';
}

export function buildCombinedRenderableMessages(messages) {
  const toolResultsByKey = new Map<string, Array<any>>();
  const syntheticResultsByToolCallId = new Map<string, Array<any>>();
  const syntheticResultsBySourceMessageId = new Map<string, Array<any>>();

  const collectLinkedToolResults = (message) => {
    if (!isNarratedAssistantToolCallMessage(message)) {
      return [];
    }

    const requestedCallIds = collectToolCallIds(message);
    if (requestedCallIds.length === 0) {
      return [];
    }
    const requestedCallIdSet = new Set(requestedCallIds);

    const requestMessageId = String(message?.messageId || '').trim();
    const linkedResults: Array<any> = [];
    const seenMessageIds = new Set<string>();

    for (const candidate of messages) {
      const candidateRole = String(candidate?.role || '').trim().toLowerCase();
      if (candidateRole !== 'tool') {
        continue;
      }

      const replyToMessageId = String(candidate?.replyToMessageId || '').trim();
      const candidateLookupKeys = collectToolResultLookupKeys(candidate);
      const isLinkedByCallId = candidateLookupKeys.some((lookupKey) => requestedCallIdSet.has(lookupKey));
      const isLinkedByReply = requestMessageId && replyToMessageId === requestMessageId;
      if (!isLinkedByCallId && !isLinkedByReply) {
        continue;
      }

      const candidateMessageId = String(candidate?.messageId || '').trim();
      if (candidateMessageId) {
        if (seenMessageIds.has(candidateMessageId)) {
          continue;
        }
        seenMessageIds.add(candidateMessageId);
      }

      linkedResults.push(candidate);
    }

    return linkedResults;
  };

  for (const message of messages) {
    const syntheticToolCallId = getSyntheticToolResultCallId(message);
    if (syntheticToolCallId) {
      const existingSyntheticRows = syntheticResultsByToolCallId.get(syntheticToolCallId) || [];
      existingSyntheticRows.push(message);
      syntheticResultsByToolCallId.set(syntheticToolCallId, existingSyntheticRows);
    }

    const syntheticSourceMessageId = getSyntheticToolResultSourceMessageId(message);
    if (syntheticSourceMessageId) {
      const existingSyntheticRows = syntheticResultsBySourceMessageId.get(syntheticSourceMessageId) || [];
      existingSyntheticRows.push(message);
      syntheticResultsBySourceMessageId.set(syntheticSourceMessageId, existingSyntheticRows);
    }

    const role = String(message?.role || '').trim().toLowerCase();
    if (role !== 'tool') {
      continue;
    }
    const completionKeys = collectToolResultLookupKeys(message);
    if (completionKeys.length === 0) {
      continue;
    }
    for (const completionKey of completionKeys) {
      const existing = toolResultsByKey.get(completionKey) || [];
      existing.push(message);
      toolResultsByKey.set(completionKey, existing);
    }
  }

  const consumedToolRowIds = new Set<string>();

  return messages
    .map((message) => {
      if (isNarratedAssistantToolCallMessage(message)) {
        const narratedToolCallResults = collectLinkedToolResults(message);
        if (narratedToolCallResults.length === 0) {
          return message;
        }

        return {
          ...message,
          narratedToolCallResults,
          syntheticToolResultMessages: collectToolCallIds(message)
            .flatMap((callId) => syntheticResultsByToolCallId.get(callId) || []),
        };
      }

      if (!isToolRelatedMessage(message) || !isToolRequestMessage(message)) {
        const toolLookupKey = String(message?.tool_call_id || message?.toolCallId || message?.messageId || '').trim();
        const linkedSyntheticToolResultMessages = [
          ...(toolLookupKey ? (syntheticResultsByToolCallId.get(toolLookupKey) || []) : []),
          ...(String(message?.messageId || '').trim()
            ? (syntheticResultsBySourceMessageId.get(String(message?.messageId || '').trim()) || [])
            : []),
        ];
        return linkedSyntheticToolResultMessages.length > 0
          ? { ...message, syntheticToolResultMessages: linkedSyntheticToolResultMessages }
          : message;
      }

      const requestedCallIds = collectToolCallIds(message);
      if (requestedCallIds.length === 0) {
        return message;
      }

      const combinedToolResults: Array<any> = [];
      const syntheticToolResultMessages: Array<any> = [];
      const requestMessageId = String(message?.messageId || '').trim();
      const combinedMessageIds = new Set<string>();
      for (const callId of requestedCallIds) {
        for (const syntheticMessage of syntheticResultsByToolCallId.get(callId) || []) {
          syntheticToolResultMessages.push(syntheticMessage);
        }
        const matches = toolResultsByKey.get(callId) || [];
        for (const match of matches) {
          const matchMessageId = String(match?.messageId || '').trim();
          if (matchMessageId) {
            consumedToolRowIds.add(matchMessageId);
            combinedMessageIds.add(matchMessageId);
          }
          combinedToolResults.push(match);
        }
      }

      if (requestMessageId) {
        for (const candidate of messages) {
          const candidateRole = String(candidate?.role || '').trim().toLowerCase();
          if (candidateRole !== 'tool') {
            continue;
          }
          const replyToMessageId = String(candidate?.replyToMessageId || '').trim();
          if (!replyToMessageId || replyToMessageId !== requestMessageId) {
            continue;
          }

          const candidateMessageId = String(candidate?.messageId || '').trim();
          if (candidateMessageId && combinedMessageIds.has(candidateMessageId)) {
            continue;
          }

          if (candidateMessageId) {
            consumedToolRowIds.add(candidateMessageId);
            combinedMessageIds.add(candidateMessageId);
            for (const syntheticMessage of syntheticResultsBySourceMessageId.get(candidateMessageId) || []) {
              syntheticToolResultMessages.push(syntheticMessage);
            }
          }
          combinedToolResults.push(candidate);
        }
      }

      if (combinedToolResults.length === 0) {
        return message;
      }

      const filteredCombinedToolResults = filterSupersededStreamingToolRows(combinedToolResults);

      return {
        ...message,
        combinedToolResults: filteredCombinedToolResults,
        ...(syntheticToolResultMessages.length > 0 ? { syntheticToolResultMessages } : {}),
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

      return !consumedToolRowIds.has(messageId);
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
  worldViewMode = 'chat',
  worldGridLayoutChoiceId = '1+2',
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
  const normalizedWorldViewMode = normalizeWorldViewMode(worldViewMode);
  const showChatMessageChrome = shouldShowMessageChrome(normalizedWorldViewMode);
  const showNonChatSectionLabels = shouldRenderNonChatSectionLabels();
  const normalizedGridChoiceId = normalizeWorldGridLayoutChoiceId(worldGridLayoutChoiceId);
  const inlinePrimaryText = String(inlineWorkingIndicatorState?.primaryText || 'Agent');
  const inlineStatusText = String(
    inlineWorkingIndicatorState?.inlineStatusText
    || inlineWorkingIndicatorState?.statusText
    || ''
  ).trim();
  const inlineDetailText = String(inlineWorkingIndicatorState?.detailText || '').trim();
  const inlineElapsedMs = Number(inlineWorkingIndicatorState?.elapsedMs || 0);
  const renderableMessages = buildCombinedRenderableMessages(
    messages.filter(isRenderableMessageEntry)
  ).filter((message) => {
    if (showToolMessages) {
      return true;
    }
    if (isNarratedAssistantToolCallMessage(message)) {
      return true;
    }
    return !isToolRelatedMessage(message);
  });
  const shouldShowLoading = messagesLoading && renderableMessages.length === 0;
  const [messageCollapseOverrides, setMessageCollapseOverrides] = useState<Record<string, boolean>>({});
  const [reasoningCollapseOverrides, setReasoningCollapseOverrides] = useState<Record<string, boolean>>({});

  const toggleMessageCollapsed = (messageId: string, currentCollapsed: boolean) => {
    setMessageCollapseOverrides((prev) => ({
      ...prev,
      [messageId]: !currentCollapsed,
    }));
  };

  const toggleReasoningCollapsed = (messageId: string, currentCollapsed: boolean) => {
    setReasoningCollapseOverrides((prev) => ({
      ...prev,
      [messageId]: !currentCollapsed,
    }));
  };

  const isMessageCollapsed = (message, messageKey: string | null, isCollapsible: boolean) => {
    if (!isCollapsible || !messageKey) return false;
    if (Object.prototype.hasOwnProperty.call(messageCollapseOverrides, messageKey)) {
      return Boolean(messageCollapseOverrides[messageKey]);
    }
    return getInitialMessageCollapsedState(message, isCollapsible);
  };
  const isReasoningCollapsed = (message, messageKey: string | null) => {
    if (!messageKey || !String(message?.reasoningContent || '').trim()) {
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(reasoningCollapseOverrides, messageKey)) {
      return Boolean(reasoningCollapseOverrides[messageKey]);
    }
    return getInitialReasoningCollapsedState(message);
  };
  const shouldShowWelcome = !messagesLoading && !hasConversationMessages;
  const partitionedMessages = partitionWorldViewMessages(renderableMessages);
  const sortedGridAgentLanes = sortAgentLanesForGrid(partitionedMessages.agentLanes, normalizedGridChoiceId);
  const flatCanvasAgentMessages = partitionedMessages.agentLanes
    .flatMap((lane) => lane.messages)
    .sort((left, right) => left.index - right.index);
  const latestUserMessageEntry = normalizedWorldViewMode === 'chat'
    ? null
    : getLatestUserMessageEntry(partitionedMessages.userMessages);
  const baseContainerClassName = shouldShowWelcome && selectedSession
    ? 'mx-auto flex min-h-full w-full max-w-[920px] items-start justify-center py-4'
    : normalizedWorldViewMode === 'chat'
      ? 'mx-auto w-full max-w-[750px] space-y-3'
      : 'h-full w-full';

  const renderMessageCard = (message, messageIndex, sourceMessages) => {
    const senderLabel = getMessageSenderLabel(
      message,
      messagesById,
      sourceMessages,
      messageIndex,
      worldAgentsById,
      worldAgentsByName
    );
    const messageKey = getMessageCollapseKey(message);
    const messageAvatar = resolveMessageAvatar(message, worldAgentsById, worldAgentsByName);
    const isHuman = isHumanMessage(message);
    const isPendingOptimisticUserMessage = isHuman && message?.optimisticUserPending === true;
    const shouldForceUserActionsVisible = isHuman && shouldForceHumanMessageActionsVisible(sourceMessages, messageIndex);
    const messageRole = String(message?.role || '').toLowerCase();
    const isNarratedAssistantToolCall = isNarratedAssistantToolCallMessage(message);
    const isToolMessage = isToolRelatedMessage(message) && !isNarratedAssistantToolCall;
    const resolvedToolName = isToolMessage
      ? resolveToolNameForMessage(message, messagesById, sourceMessages, messageIndex)
      : '';
    const messageModelLabel = resolveMessageModelLabel(message, worldAgentsById, worldAgentsByName);
    const streamingInputPreview = extractStreamingInputPreview(message, messagesById, sourceMessages, messageIndex);
    const shouldRightAlignMessage = isHuman || isToolMessage || messageRole === 'assistant';
    const hasToolCalls = Array.isArray(message?.tool_calls) && message.tool_calls.length > 0;
    const isToolCallRequestMessage = isToolRequestMessage(message);
    const isPendingToolCallRequest = isToolCallRequestMessage && hasPendingToolCalls(message, sourceMessages, messageIndex);
    const toolStatusLabel = isToolMessage ? getToolStatusLabel(message, isPendingToolCallRequest, resolvedToolName) : '';
    const toolStatusTone = isToolMessage ? getToolStatusTone(message, isPendingToolCallRequest) : 'done';
    const linkedToolRequestMessage = isToolMessage
      ? findToolRequestMessageForToolResult(message, messagesById, sourceMessages, messageIndex)
      : null;
    const isStreamingAssistantMessage = Boolean(message?.isStreaming) && messageRole === 'assistant' && !isToolMessage;
    const isFinalizedAssistantMessage = message?.isStreaming !== true && message?.isToolStreaming !== true;
    const isActiveToolMessage = isToolMessage && (Boolean(message?.isToolStreaming) || isPendingToolCallRequest);
    const isBranchableAgentMessage = !isHuman
      && isFinalizedAssistantMessage
      && isTrueAgentResponseMessage(message)
      && Boolean(message.messageId);
    const isAssistantMessage = messageRole === 'assistant' && !isToolMessage;
    const isCollapsible = (isToolMessage && (!isToolRequestMessage(message) || hasMergedToolTranscriptContent(message)))
      || (isAssistantMessage && Boolean(messageKey));
    const isCollapsed = isMessageCollapsed(message, messageKey, isCollapsible);
    const reasoningCollapsed = isReasoningCollapsed(message, messageKey);
    const normalizedEditedText = editingText.trim();
    const normalizedOriginalText = String(message?.content || '').trim();
    const isEditChanged = Boolean(normalizedEditedText) && normalizedEditedText !== normalizedOriginalText;
    return (
      <div
        key={messageKey}
        className={`flex min-w-0 w-full items-start gap-2 ${shouldRightAlignMessage ? 'justify-end' : 'justify-start'}`}
        data-testid={messageKey ? `message-row-${messageKey}` : undefined}
      >
        {shouldShowMessageAvatar(showChatMessageChrome, Boolean(messageAvatar), isToolMessage) ? (
          <div
            className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-[10px] font-semibold text-secondary-foreground"
            title={messageAvatar.name}
            aria-label={`${messageAvatar.name} avatar`}
          >
            {messageAvatar.initials}
          </div>
        ) : shouldReserveToolAvatarSpace(showChatMessageChrome, isToolMessage) ? (
          <div className="mt-1 h-8 w-8 shrink-0" aria-hidden="true" />
        ) : null}

        <article
          className={`min-w-0 ${getMessageCardClassName(message, messagesById, sourceMessages, messageIndex, {
            isToolCallPending: isPendingToolCallRequest,
            showLeftBorder: showChatMessageChrome,
            fullWidthMessage: !showChatMessageChrome,
            fullWidthUserMessage: !showChatMessageChrome && isHuman,
          })} ${isStreamingAssistantMessage ? 'agent-streaming-card' : ''}`}
          data-testid={messageKey ? `message-card-${messageKey}` : undefined}
        >
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            {isToolMessage ? (
              <span className="flex min-w-0 items-center gap-2">
                <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${getToolSummaryDotClassName(toolStatusTone)}`} aria-hidden="true" />
                <span className="truncate font-medium text-foreground/80">{toolStatusLabel}</span>
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
                  title={getMessageCollapseToggleLabel(isCollapsed)}
                  aria-label={getMessageCollapseToggleLabel(isCollapsed)}
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
                if (isNarratedAssistantToolCall) {
                  nextMessage = { ...nextMessage, forceAssistantMessage: true };
                }
                return nextMessage;
              })()}
              collapsed={isCollapsed}
              reasoningCollapsed={reasoningCollapsed}
              onToggleReasoningCollapsed={messageKey
                ? () => toggleReasoningCollapsed(messageKey, reasoningCollapsed)
                : undefined}
              isToolCallPending={isPendingToolCallRequest}
              showToolHeader={!isToolMessage}
              streamingDotsLabel={messageModelLabel}
              streamingInputPreview={streamingInputPreview}
            />
          )}

          {isHumanMessage(message) && message.messageId && !isPendingOptimisticUserMessage && editingMessageId !== getMessageIdentity(message) ? (
            <div className={`absolute bottom-2 right-2 flex items-center gap-1 transition-opacity ${shouldForceUserActionsVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
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
  };

  return (
    <div
      ref={messagesContainerRef}
      className={normalizedWorldViewMode === 'chat'
        ? 'flex-1 overflow-y-auto overflow-x-hidden p-5 pb-[var(--floating-composer-height,8.5rem)]'
        : 'flex-1 overflow-hidden p-5'}
    >
      <div
        className={baseContainerClassName}
      >
        {shouldShowLoading && !selectedSession ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Select a session from the left column.
          </div>
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
          normalizedWorldViewMode === 'chat' ? (
            renderableMessages.map((message, messageIndex) => renderMessageCard(message, messageIndex, renderableMessages))
          ) : normalizedWorldViewMode === 'board' ? (
            <div className="flex h-full min-h-0 w-full flex-col gap-3">
              {latestUserMessageEntry ? (
                <section className="shrink-0 rounded-lg border border-border/70 bg-card/40 p-3">
                  {showNonChatSectionLabels ? (
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest User Message</div>
                  ) : null}
                  {renderMessageCard(latestUserMessageEntry.message, latestUserMessageEntry.index, renderableMessages)}
                </section>
              ) : null}
              <section className={getBoardBottomSectionClassName()}>
                {showNonChatSectionLabels ? (
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Board</div>
                ) : null}
                <div className={getBoardLaneContainerClassName()}>
                  {partitionedMessages.agentLanes.map((lane) => (
                    <section key={lane.id} className={getBoardLaneClassName()}>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{lane.label}</div>
                      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
                        {lane.messages.map((entry) => renderMessageCard(entry.message, entry.index, renderableMessages))}
                      </div>
                    </section>
                  ))}
                </div>
                {partitionedMessages.systemMessages.length > 0 ? (
                  <section className="shrink-0 rounded-lg border border-dashed border-border/80 bg-muted/30 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">System</div>
                    <div className="space-y-3">
                      {partitionedMessages.systemMessages.map((entry) => renderMessageCard(entry.message, entry.index, renderableMessages))}
                    </div>
                  </section>
                ) : null}
              </section>
            </div>
          ) : normalizedWorldViewMode === 'grid' ? (
            <div className="flex h-full min-h-0 w-full flex-col gap-3">
              {latestUserMessageEntry ? (
                <section className="shrink-0 rounded-lg border border-border/70 bg-card/40 p-3">
                  {showNonChatSectionLabels ? (
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest User Message</div>
                  ) : null}
                  {renderMessageCard(latestUserMessageEntry.message, latestUserMessageEntry.index, renderableMessages)}
                </section>
              ) : null}
              <section className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border border-border/70 bg-card/25 p-3 pb-[var(--floating-composer-height,8.5rem)]">
                {showNonChatSectionLabels ? (
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grid</div>
                ) : null}
                <div className={getGridContainerClassName(normalizedGridChoiceId)}>
                  {sortedGridAgentLanes.map((lane, laneIndex) => (
                    <section key={lane.id} className={`rounded-lg border border-border/70 bg-card/40 p-3 ${getGridLaneClassName(normalizedGridChoiceId, laneIndex)}`}>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{lane.label}</div>
                      <div className="space-y-3">
                        {lane.messages.map((entry) => renderMessageCard(entry.message, entry.index, renderableMessages))}
                      </div>
                    </section>
                  ))}
                </div>
                {partitionedMessages.systemMessages.length > 0 ? (
                  <section className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">System</div>
                    <div className="space-y-3">
                      {partitionedMessages.systemMessages.map((entry) => renderMessageCard(entry.message, entry.index, renderableMessages))}
                    </div>
                  </section>
                ) : null}
              </section>
            </div>
          ) : (
            <div className="flex h-full min-h-0 w-full flex-col gap-3">
              {latestUserMessageEntry ? (
                <section className="shrink-0 rounded-lg border border-border/70 bg-card/40 p-3">
                  {showNonChatSectionLabels ? (
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest User Message</div>
                  ) : null}
                  {renderMessageCard(latestUserMessageEntry.message, latestUserMessageEntry.index, renderableMessages)}
                </section>
              ) : null}
              <section className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border border-border/70 bg-card/25 p-3 pb-[var(--floating-composer-height,8.5rem)]">
                {showNonChatSectionLabels ? (
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Canvas</div>
                ) : null}
                <section className="rounded-xl border border-border/70 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_56%),radial-gradient(circle_at_bottom,_rgba(16,185,129,0.12),_transparent_58%)] p-3">
                  {showNonChatSectionLabels ? (
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent Canvas</div>
                  ) : null}
                  <div className="space-y-3">
                    {flatCanvasAgentMessages.map((entry) => renderMessageCard(entry.message, entry.index, renderableMessages))}
                  </div>
                </section>
                {partitionedMessages.systemMessages.length > 0 ? (
                  <section className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">System</div>
                    <div className="space-y-3">
                      {partitionedMessages.systemMessages.map((entry) => renderMessageCard(entry.message, entry.index, renderableMessages))}
                    </div>
                  </section>
                ) : null}
              </section>
            </div>
          )
        )}

        {activeHitlPrompt ? (
          <div className="flex min-w-0 w-full items-start gap-2 justify-start" data-testid="hitl-prompt">
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
