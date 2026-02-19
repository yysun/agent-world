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
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 4 component extraction.
 */

import MessageContent from './MessageContent';
import { compactSkillDescription, formatTime } from '../utils/formatting';
import {
  getMessageCardClassName,
  getMessageIdentity,
  getMessageSenderLabel,
  isHumanMessage,
  isToolRelatedMessage,
  isTrueAgentResponseMessage,
  resolveMessageAvatar,
} from '../utils/message-utils';

export default function MessageListPanel({
  messagesContainerRef,
  hasConversationMessages,
  selectedSession,
  refreshSkillRegistry,
  loadingSkillRegistry,
  visibleSkillRegistryEntries,
  skillRegistryError,
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
  showInlineWorkingIndicator,
  inlineWorkingAgentLabel,
}) {
  return (
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
            const messageRole = String(message?.role || '').toLowerCase();
            const shouldRightAlignMessage = isHuman || isToolRelatedMessage(message) || messageRole === 'assistant';
            const isBranchableAgentMessage = !isHuman && isTrueAgentResponseMessage(message) && Boolean(message.messageId);
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

                <article className={`min-w-0 ${getMessageCardClassName(message, messagesById, messages, messageIndex)}`}>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{senderLabel}</span>
                    <span>{formatTime(message.createdAt)}</span>
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
                    <MessageContent message={message} />
                  )}

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

                  {isBranchableAgentMessage && editingMessageId !== getMessageIdentity(message) ? (
                    <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
  );
}
