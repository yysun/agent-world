/**
 * Composer Bar Component
 *
 * Features:
 * - Renders chat composer textarea and submit/stop control
 * - Includes quick-action toolbar for attach and project selection
 * - Supports Enter/Shift+Enter behavior via delegated keydown handler
 *
 * Implementation Notes:
 * - Stateless presentation; parent owns composer value and submit logic
 * - Keeps action-button sizing and iconography consistent with desktop UI updates
 *
 * Recent Changes:
 * - 2026-02-20: Disabled new-message composer actions while a HITL prompt is pending.
 * - 2026-02-14: Extracted from App.jsx to simplify renderer orchestration logic.
 */

import React from 'react';

export default function ComposerBar({
  onSubmitMessage,
  composerTextareaRef,
  composer,
  onComposerChange,
  onComposerKeyDown,
  onSelectProject,
  selectedProjectPath,
  canStopCurrentSession,
  isCurrentSessionStopping,
  isCurrentSessionSending,
  hasActiveHitlPrompt
}) {
  const composerDisabled = Boolean(hasActiveHitlPrompt) && !canStopCurrentSession;
  return (
    <form onSubmit={onSubmitMessage} className="px-4 pt-4 pb-2">
      <div className="mx-auto flex w-full max-w-[750px] flex-col gap-2 rounded-lg border border-input bg-card p-3">
        <textarea
          ref={composerTextareaRef}
          value={composer}
          onChange={(event) => onComposerChange(event.target.value)}
          onKeyDown={onComposerKeyDown}
          rows={1}
          placeholder={composerDisabled ? 'Resolve pending HITL prompt before sending a new message...' : 'Send a message...'}
          className="w-full resize-none bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Message input"
          disabled={composerDisabled}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                className="h-4 w-4"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onSelectProject}
              className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Select project folder"
              title={selectedProjectPath ? `Project folder: ${selectedProjectPath}` : 'Select project folder for context'}
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
                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
              </svg>
              <span>Project</span>
            </button>
          </div>
          <button
            type="submit"
            disabled={canStopCurrentSession ? isCurrentSessionStopping : (isCurrentSessionSending || !composer.trim() || composerDisabled)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={canStopCurrentSession ? 'Stop message processing' : 'Send message'}
            title={canStopCurrentSession ? 'Stop processing' : 'Send message'}
          >
            {canStopCurrentSession ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4 w-4"
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
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
