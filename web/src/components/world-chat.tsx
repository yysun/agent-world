/**
 * Purpose:
 * - Render the world chat transcript and composer with AppRun-compatible events.
 *
 * Key Features:
 * - Real-time message streaming with filtering, deduplication, and role-based rendering.
 * - Chat composer with send/stop controls, HITL safety gating, and Electron-style toolbar layout.
 * - Agent activity/queue indicators and message-level tooling/edit/delete affordances.
 *
 * Notes on Implementation:
 * - Stateless functional component that derives UI directly from props.
 * - Message body rendering is delegated to domain helpers to keep this file focused on view composition.
 *
 * Summary of Recent Changes:
 * - 2026-02-21: Matched web composer toolbar structure to Electron (plus icon + project pill + round arrow action).
 * - 2026-02-21: Aligned web composer UI/behavior with Electron (textarea composer shell, icon action button, and Enter/Shift+Enter semantics).
 * - 2026-02-20: Disabled new-message sending while a HITL prompt is pending; users must resolve HITL first.
 */

import { app } from 'apprun';
import type { WorldChatProps, Message } from '../types';
import toKebabCase from '../utils/toKebabCase';
import { SenderType, getSenderType } from '../utils/sender-type.js';
import { isToolResultMessage, renderMessageContent } from '../domain/message-content';
import { ActivityPulse, ElapsedTimeCounter } from './activity-indicators';
import { AgentQueueDisplay } from './agent-queue-display';

const debug = false;
const SYSTEM_AVATAR_SPRITE_INDEX = 4;

export interface ComposerActionState {
  canStopCurrentSession: boolean;
  composerDisabled: boolean;
  actionButtonDisabled: boolean;
  actionButtonClass: string;
  actionButtonLabel: string;
}

export function isBranchableAgentMessage(message: Message): boolean {
  if (!message || message.role !== 'assistant') return false;

  const sender = String(message.sender || '').toLowerCase().trim();
  if (!sender || sender === 'system' || sender === 'tool' || sender === 'human' || sender === 'user') {
    return false;
  }

  const text = String(message.text || '').trim();
  if (!text || /^error\s*:/i.test(text)) {
    return false;
  }

  const anyMessage = message as any;
  if (Array.isArray(anyMessage.tool_calls) && anyMessage.tool_calls.length > 0) return false;
  if (anyMessage.tool_call_id) return false;
  if (anyMessage.toolCallStatus) return false;

  return true;
}

export function getComposerActionState(params: {
  currentChatId: string | null;
  isWaiting: boolean;
  isBusy: boolean;
  isStopping: boolean;
  isSending: boolean;
  hasActiveHitlPrompt: boolean;
  userInput: string;
}): ComposerActionState {
  const {
    currentChatId,
    isWaiting,
    isBusy,
    isStopping,
    isSending,
    hasActiveHitlPrompt,
    userInput,
  } = params;

  const canStopCurrentSession = Boolean(currentChatId) && (isWaiting || isBusy);
  const composerDisabled = hasActiveHitlPrompt && !canStopCurrentSession;
  const actionButtonDisabled = canStopCurrentSession
    ? isStopping
    : (isSending || !userInput.trim() || composerDisabled);
  const actionButtonClass = canStopCurrentSession ? 'composer-submit-button stop-button' : 'composer-submit-button';
  const actionButtonLabel = canStopCurrentSession ? 'Stop message processing' : 'Send message';

  return {
    canStopCurrentSession,
    composerDisabled,
    actionButtonDisabled,
    actionButtonClass,
    actionButtonLabel,
  };
}

export default function WorldChat(props: WorldChatProps) {
  const {
    worldName,
    messages = [], // Default to empty array if undefined
    rawMessages = [], // Raw messages before deduplication for filtering
    userInput = '', // Default to empty string if undefined
    messagesLoading,
    isSending,
    isWaiting,
    needScroll = false,
    activeAgent,
    agents = [],
    currentChat,
    currentChatId = null,
    editingMessageId = null,
    editingText = '',
    agentFilters = [],  // Agent IDs to filter by
    isBusy = false,
    elapsedMs = 0,
    isStopping = false,
    activeHitlPrompt = null,
    submittingHitlRequestId = null,
  } = props;

  const { canStopCurrentSession, composerDisabled, actionButtonDisabled, actionButtonClass, actionButtonLabel } = getComposerActionState({
    currentChatId,
    isWaiting,
    isBusy,
    isStopping,
    isSending,
    hasActiveHitlPrompt: Boolean(activeHitlPrompt),
    userInput,
  });
  const inputPlaceholder = composerDisabled
    ? 'Resolve pending HITL prompt before sending a new message...'
    : 'Send a message...';
  const waitingAgentName = activeAgent?.name?.trim() || agents[0]?.name?.trim() || 'Agent';
  const agentSpriteByName = new Map<string, number>();
  const agentSpriteById = new Map<string, number>();

  for (const agent of agents) {
    const normalizedName = toKebabCase(agent.name);
    const normalizedId = toKebabCase(agent.id);
    agentSpriteByName.set(normalizedName, agent.spriteIndex);
    agentSpriteById.set(normalizedId, agent.spriteIndex);
  }

  const queuedAgents = agents
    .filter((agent) => agent.name !== activeAgent?.name)
    .map((agent) => ({ name: agent.name, spriteIndex: agent.spriteIndex }));

  // Helper function to determine if a message has sender/agent mismatch
  const hasSenderAgentMismatch = (message: Message): boolean => {
    const senderLower = toKebabCase(message.sender);
    const agentIdLower = toKebabCase(message.fromAgentId);
    return senderLower !== agentIdLower && !message.isStreaming;
  };

  const isSenderAutoReplyDisabled = (message: Message): boolean => {
    const fromAgentId = toKebabCase(message.fromAgentId || '');
    if (fromAgentId) {
      const fromAgent = agents.find(agent => toKebabCase(agent.id) === fromAgentId);
      if (fromAgent) {
        return fromAgent.autoReply === false;
      }
    }

    const normalizedSender = toKebabCase(message.sender || '');
    if (!normalizedSender) return false;

    const senderAgent = agents.find(
      agent => toKebabCase(agent.id) === normalizedSender || toKebabCase(agent.name) === normalizedSender
    );
    return senderAgent?.autoReply === false;
  };

  // Helper function to resolve reply target from replyToMessageId
  const getReplyTarget = (message: Message, allMessages: Message[]): string | null => {
    if (!message.replyToMessageId) {
      return null;
    }

    const parentMessage = allMessages.find(m => m.messageId === message.replyToMessageId);
    if (!parentMessage) {
      return null;
    }

    const senderType = getSenderType(parentMessage.sender);
    const replyTarget = senderType === SenderType.HUMAN ? 'HUMAN' : parentMessage.sender;
    return replyTarget;
  };

  // Filter messages based on active agent filters
  // When filters active: use raw messages and filter by ownerAgentId, then deduplicate human messages
  // When no filters: use pre-deduplicated messages for better performance
  const filteredMessages = agentFilters.length > 0
    ? (() => {
      // First filter by agent ownership
      const agentMessages = rawMessages.filter(message => {
        // Always include human/user messages (we'll deduplicate them next)
        const senderType = getSenderType(message.sender);
        if (senderType === SenderType.HUMAN) {
          return true;
        }

        // Check if message is from a filtered agent's memory
        return message.ownerAgentId && agentFilters.includes(message.ownerAgentId);
      });

      // Deduplicate human messages while preserving all agent messages
      const messageMap = new Map<string, Message>();
      const deduplicatedMessages: Message[] = [];

      for (const message of agentMessages) {
        const senderType = getSenderType(message.sender);
        const isHumanMessage = senderType === SenderType.HUMAN;

        if (isHumanMessage && message.messageId) {
          // Deduplicate human messages by messageId
          if (!messageMap.has(message.messageId)) {
            messageMap.set(message.messageId, message);
            deduplicatedMessages.push(message);
          }
        } else {
          // Keep all agent messages
          deduplicatedMessages.push(message);
        }
      }

      return deduplicatedMessages;
    })()
    : messages;  // No filters = use pre-deduplicated messages

  // Helper function to check if message should be hidden from display.
  // Internal tool result protocol messages are not shown in the chat UI.
  // Phase 5: Tool messages are now visible with collapsible output.
  const shouldHideMessage = (message: Message): boolean => {
    if (message.isToolEvent && !message.isToolStreaming) {
      return true;
    }

    try {
      const text = message.text.trim();
      const jsonText = text.startsWith('@') ? text.substring(text.indexOf(',') + 1).trim() : text;

      if (jsonText.startsWith('{') && jsonText.endsWith('}')) {
        const parsed = JSON.parse(jsonText);
        if (parsed.__type === 'tool_result' && parsed.tool_call_id) {
          return true;
        }
      }
    } catch {
      // Not valid JSON or doesn't match pattern - don't hide
    }

    return false;
  };

  const getMessageRowAlignmentClass = (senderType: SenderType, isCrossAgentMessage: boolean): string => {
    if (senderType === SenderType.HUMAN || isCrossAgentMessage) {
      return 'message-row-left';
    }
    return 'message-row-right';
  };

  const getMessageAvatarSpriteIndex = (message: Message): number => {
    const senderType = getSenderType(message.sender);
    if (senderType === SenderType.HUMAN) {
      // Human messages render an empty avatar slot, so sprite index is unused.
      return SYSTEM_AVATAR_SPRITE_INDEX;
    }
    if (senderType === SenderType.SYSTEM || senderType === SenderType.WORLD) {
      return SYSTEM_AVATAR_SPRITE_INDEX;
    }

    const normalizedSender = toKebabCase(message.sender || '');
    const normalizedFromAgentId = toKebabCase(message.fromAgentId || '');

    if (agentSpriteByName.has(normalizedSender)) {
      return agentSpriteByName.get(normalizedSender)!;
    }
    if (agentSpriteById.has(normalizedSender)) {
      return agentSpriteById.get(normalizedSender)!;
    }
    if (agentSpriteById.has(normalizedFromAgentId)) {
      return agentSpriteById.get(normalizedFromAgentId)!;
    }
    if (agentSpriteByName.has(normalizedFromAgentId)) {
      return agentSpriteByName.get(normalizedFromAgentId)!;
    }

    return SYSTEM_AVATAR_SPRITE_INDEX;
  };

  return (
    <fieldset className="chat-fieldset">
      <legend>
        {worldName} {
          currentChat ? ` - ${currentChat}` :
            <span className="unsaved-indicator" title="Unsaved chat"> ●</span>}
        <AgentQueueDisplay
          activeAgent={activeAgent ? { name: activeAgent.name, spriteIndex: activeAgent.spriteIndex } : null}
          queuedAgents={queuedAgents}
        />
        <ActivityPulse isBusy={isBusy || false} />
        {(isBusy || elapsedMs > 0) && <ElapsedTimeCounter elapsedMs={elapsedMs || 0} />}
      </legend>
      <div className="chat-container">
        {/* Conversation Area */}
        <div
          className="conversation-area"
          ref={(el, state) => {
            if (el && needScroll) {
              requestAnimationFrame(() => {
                el.scrollTop = el.scrollHeight;
                // Reset needScroll directly in state to prevent unwanted scrolls
                if (state) {
                  state.needScroll = false;
                }
              });
            }
          }}
        >
          {messagesLoading ? (
            <div className="loading-messages">Loading messages...</div>
          ) : filteredMessages.length === 0 ? (
            <div className="no-messages">No messages yet. Start a conversation!</div>
          ) : (
            filteredMessages.map((message, index) => {
              // Skip messages that should be hidden (internal tool result messages)
              if (shouldHideMessage(message)) {
                return null;
              }

              // Render log events (server logs)
              if (message.logEvent) {
                const isExpanded = !!message.isLogExpanded;
                let formattedArgs: string | null = null;
                if (message.logEvent.data !== undefined) {
                  try {
                    formattedArgs = JSON.stringify(message.logEvent.data, null, 2);
                  } catch (error) {
                    formattedArgs = String(message.logEvent.data);
                  }
                }

                return (
                  <div key={message.id || 'log-' + index} className="message log-message">
                    <button
                      type="button"
                      className="log-header"
                      aria-expanded={isExpanded}
                      $onclick={['toggle-log-details', message.id || `log-${index}`]}
                    >
                      <span className={`log-dot ${message.logEvent.level}`}></span>
                      <span className="log-category">{message.logEvent.category}</span>
                      <span className="log-content">{message.logEvent.message}</span>
                      <span className="log-toggle-icon" aria-hidden="true">
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </button>
                    {isExpanded && (
                      <pre className="log-details">
                        {formattedArgs ?? 'No additional details'}
                      </pre>
                    )}
                  </div>
                );
              }

              // Render world events (system and world)
              if (message.worldEvent) {
                // Don't display in UI and don't log here (logged once in handler to prevent duplicates on re-renders)
                return null;
              }

              const senderType = getSenderType(message.sender);
              const isCrossAgentMessage = hasSenderAgentMismatch(message);
              // Memory-only message: INCOMING agent message (type=user/human) saved to another agent's memory without triggering response
              // This is when an agent's reply gets saved to another agent's memory as an incoming message
              // Identified by: type=user/human + agent sender + sender/agentId mismatch (cross-agent)
              // Note: Agent replies have type='agent' or 'assistant', incoming messages have type='user' or 'human'
              const isIncomingMessage = message.type === 'user' || message.type === 'human';

              // Helper: Check if message is replying to the current viewing agent
              const isReplyingToCurrentAgent = (): boolean => {
                if (!message.replyToMessageId) return false;
                const parentMessage = filteredMessages.find(m => m.messageId === message.replyToMessageId);
                if (!parentMessage) return false;
                // Check if parent is from the current agent (the owner of this memory)
                return parentMessage.sender === message.fromAgentId;
              };

              // Special case: user messages with replyToMessageId are actually replies from agents
              // This happens in multi-agent scenarios where agent responses are stored as 'user' messages
              // BUT: if the replyToMessageId points to HUMAN or another agent (not the current agent),
              // it's memory-only (the agent was responding to someone else, not this agent)
              const isReplyMessage = isIncomingMessage && message.replyToMessageId && isReplyingToCurrentAgent();

              // Memory-only logic:
              // For threaded messages (with replyToMessageId): If not replying to current agent, it's memory-only
              // For non-threaded messages (legacy): Check if there's a reply to determine if it's memory-only
              const hasThreading = !!message.replyToMessageId;
              const hasReply = message.messageId
                ? filteredMessages.some(m => m.replyToMessageId === message.messageId)
                : false;

              const isMemoryOnlyMessage = isIncomingMessage &&
                senderType === SenderType.AGENT &&
                isCrossAgentMessage &&
                !message.isStreaming &&
                (hasThreading ? !isReplyMessage : !hasReply); // Threaded: hide if not replying to us. Non-threaded: hide if no reply

              // Skip rendering memory-only messages completely
              if (isMemoryOnlyMessage) {
                return null;
              }

              const baseMessageClass = senderType === SenderType.HUMAN ? 'user-message' : 'agent-message';
              const systemClass = senderType === SenderType.SYSTEM ? 'system-message' : '';
              const crossAgentClass = isCrossAgentMessage && !isMemoryOnlyMessage && senderType !== SenderType.HUMAN ? 'cross-agent-message' : '';
              const memoryOnlyClass = isMemoryOnlyMessage ? 'memory-only-message' : '';
              const toolClass = isToolResultMessage(message) ? 'tool-message' : '';
              const messageClasses = `message ${baseMessageClass} ${systemClass} ${crossAgentClass} ${memoryOnlyClass} ${toolClass}`.trim();
              const rowAlignmentClass = getMessageRowAlignmentClass(senderType, isCrossAgentMessage);
              const isHumanAvatar = senderType === SenderType.HUMAN;
              const avatarSpriteIndex = getMessageAvatarSpriteIndex(message);
              const avatarTitle = senderType === SenderType.HUMAN ? 'HUMAN' : message.sender || 'Agent';

              const isUserMessage = senderType === SenderType.HUMAN;
              const isEditing = editingMessageId === message.id;
              const normalizedEditedText = editingText.trim();
              const normalizedOriginalText = String(message.text || '').trim();
              const isEditChanged = Boolean(normalizedEditedText) && normalizedEditedText !== normalizedOriginalText;

              // Build display label matching export format
              let displayLabel = '';
              if (isUserMessage) {
                displayLabel = 'From: HUMAN';
                if (message.seenByAgents && message.seenByAgents.length > 0) {
                  displayLabel += `\nTo: ${message.seenByAgents.join(', ')}`;
                }
                // Note: If seenByAgents is empty, don't show 'To:' line (will be populated by duplicates)
              } else if (senderType === SenderType.AGENT) {
                if (isSenderAutoReplyDisabled(message)) {
                  displayLabel = message.sender;
                } else {
                  // Check if this is a reply message (has replyToMessageId) or incoming message
                  if (isReplyMessage) {
                    // Cross-agent reply: user message with replyToMessageId from another agent
                    const replyTarget = getReplyTarget(message, filteredMessages);
                    if (replyTarget) {
                      displayLabel = `Agent: ${message.sender} (reply to ${replyTarget})`;
                    } else {
                      displayLabel = `Agent: ${message.sender} (reply)`;
                    }
                  } else if (message.type === 'assistant' || message.type === 'agent') {
                    // Regular assistant/agent message
                    const replyTarget = getReplyTarget(message, filteredMessages);
                    if (replyTarget) {
                      displayLabel = `Agent: ${message.sender} (reply to ${replyTarget})`;
                    } else {
                      displayLabel = `Agent: ${message.sender} (reply)`;
                    }
                  } else if (isCrossAgentMessage && isIncomingMessage) {
                    // Non-reply cross-agent message (rare - most should have replyToMessageId)
                    displayLabel = `Agent: ${message.sender} (message from ${message.fromAgentId || message.sender})`;
                  } else {
                    // Fallback
                    displayLabel = `Agent: ${message.sender}`;
                  }
                }
              } else if (senderType === SenderType.SYSTEM) {
                displayLabel = message.sender;
              } else {
                displayLabel = message.sender;
              }

              return (
                <div key={message.id || 'msg-' + index} className={`message-row ${rowAlignmentClass}`}>
                  <div className="message-avatar-container" title={avatarTitle}>
                    <div className={isHumanAvatar ? 'message-avatar message-avatar-empty' : `message-avatar agent-sprite sprite-${avatarSpriteIndex}`}></div>
                  </div>
                  <div className={messageClasses}>
                    <div className="message-sender" style={{ whiteSpace: 'pre-line' }}>
                      {displayLabel}
                    </div>
                    {isEditing ? (
                      <div className="message-edit-container">
                        <textarea
                          className="message-edit-input"
                          value={editingText}
                          $oninput='update-edit-text'
                          rows={3}
                          autoFocus
                        />
                        <div className="message-edit-actions">
                          <button
                            className="btn-primary"
                            $onclick={['save-edit-message', message.id]}
                            disabled={!isEditChanged}
                          >
                            Update
                          </button>
                          <button
                            className="btn-secondary"
                            $onclick='cancel-edit-message'
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {renderMessageContent(message)}
                        {isUserMessage && !message.isStreaming && (
                          <div className="message-actions">
                            <button
                              className="message-edit-btn"
                              $onclick={['start-edit-message', { messageId: message.id, text: message.text }]}
                              title="Edit message"
                              disabled={!message.messageId || message.userEntered}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l9.06-9.06.92.92L5.92 19.58zM20.71 7.04a1.003 1.003 0 0 0 0-1.42L18.37 3.29a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.83z" />
                              </svg>
                            </button>
                            <button
                              className="message-delete-btn"
                              $onclick={['show-delete-message-confirm', {
                                messageId: message.id,
                                backendMessageId: message.messageId,
                                messageText: message.text,
                                userEntered: message.userEntered
                              }]}
                              title="Delete message and all after it"
                              disabled={!message.messageId || message.userEntered}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path fill="currentColor" d="M6 7h12l-1 14H7L6 7zm3-4h6l1 2h4v2H4V5h4l1-2z" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </>
                    )}
                    <div className="message-timestamp">
                      {message.createdAt ? new Date(message.createdAt).toLocaleTimeString() : 'Now'}
                    </div>
                    {message.isStreaming && (
                      <div className="streaming-indicator">
                        <div className="streaming-content">
                          <div className={`agent-sprite sprite-${activeAgent?.spriteIndex ?? 0}`}></div>
                          <span>responding ...</span>
                        </div>
                      </div>
                    )}
                    {message.hasError && <div className="error-indicator">Error: {message.errorMessage}</div>}
                    {debug && <div className="message-debug-info">{JSON.stringify({
                      id: message.id,
                      type: message.type,
                      sender: message.sender,
                      fromAgentId: message.fromAgentId,
                      messageId: message.messageId || 'undefined',
                      hasMessageId: !!message.messageId,
                    })}</div>}
                  </div>
                </div>
              );
            })
          )}

          {/* Show waiting dots when processing */}
          {isWaiting && (
            <div className="message-row message-row-left">
              <div className="message-avatar-container" title="HUMAN">
                <div className="message-avatar message-avatar-empty"></div>
              </div>
              <div className="message user-message waiting-message">
                <div className="message-content">
                  <div className="waiting-inline-status">
                    <span className="waiting-inline-dot" aria-hidden="true"></span>
                    <span>{waitingAgentName} is working...</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeHitlPrompt ? (
            <div className="message-row message-row-left">
              <div className="message-avatar-container" title="Human input required">
                <div className="message-avatar sprite-4"></div>
              </div>
              <div className="message system-message hitl-inline-message">
                <div className="message-sender">
                  {activeHitlPrompt.title || 'Human input required'}
                </div>
                <div className="message-content">
                  {(activeHitlPrompt.message || 'Please choose an option to continue.').replace(/\n\s*\n+/g, '\n')}
                </div>
                <div className="hitl-inline-actions hitl-inline-option-actions">
                  {activeHitlPrompt.options.map((option) => {
                    const isSubmitting = submittingHitlRequestId === activeHitlPrompt.requestId;
                    return (
                      <button
                        key={option.id}
                        className="btn-secondary px-4 py-2 rounded shrink-0"
                        disabled={isSubmitting}
                        $onclick={['respond-hitl-option', {
                          requestId: activeHitlPrompt.requestId,
                          optionId: option.id,
                          chatId: activeHitlPrompt.chatId
                        }]}
                      >
                        <div className="font-bold">{option.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* User Input Area */}
        <div className="input-area">
          <div className="composer-shell">
            <textarea
              className="composer-textarea"
              placeholder={inputPlaceholder}
              value={userInput || ''}
              $oninput='update-input'
              $onkeydown='key-press'
              rows={1}
              aria-label="Message input"
              disabled={composerDisabled}
            />
            <div className="composer-toolbar">
              <div className="composer-toolbar-left">
                <button
                  type="button"
                  className="composer-action-icon-button"
                  aria-label="Attach file"
                  title="Attach file"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="composer-toolbar-icon"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="composer-project-button"
                  aria-label="Project"
                  title="Project"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="composer-project-icon"
                    aria-hidden="true"
                  >
                    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                  </svg>
                  <span>Project</span>
                </button>
              </div>
              <button
                className={actionButtonClass}
                $onclick={canStopCurrentSession ? 'stop-message-processing' : 'send-message'}
                disabled={actionButtonDisabled}
                title={actionButtonLabel}
                aria-label={actionButtonLabel}
              >
                {canStopCurrentSession ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="composer-submit-icon"
                    aria-hidden="true"
                  >
                    <rect x="6" y="6" width="12" height="12" rx="1.5" />
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
                    className="composer-submit-icon"
                    aria-hidden="true"
                  >
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </fieldset>
  );
}
