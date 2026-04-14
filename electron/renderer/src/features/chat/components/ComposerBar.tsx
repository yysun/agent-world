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
 * - 2026-04-14: Increased the permission dropdown width after the compact layout clipped its label too aggressively.
 * - 2026-04-14: Rebalanced the compact composer dropdown widths after the previous forced sizing made their labels too cramped.
 * - 2026-04-14: Forced narrower dropdown widths with compact overrides so the reasoning and permission controls do not sprawl across the composer row.
 * - 2026-04-14: Switched the grouped composer dropdowns to compact select sizing and removed horizontal overflow scrolling from the action row.
 * - 2026-04-14: Tightened the reasoning and permission dropdown widths so the grouped project controls fit without horizontal scrolling.
 * - 2026-04-14: Kept the Project button, reasoning dropdown, and permission dropdown in a single non-wrapping toolbar cluster.
 * - 2026-04-14: Reduced toolbar dropdown label size and line-height so the native select text clears the button chrome cleanly.
 * - 2026-04-14: Switched toolbar dropdowns back to native medium select sizing and aligned adjacent controls to avoid bottom-edge clipping.
 * - 2026-04-14: Increased toolbar control height and allowed the left action row to wrap so native macOS dropdowns do not clip.
 * - 2026-04-14: Split the project affordance into separate open-folder and project-viewer buttons.
 * - 2026-03-23: Rewired the composer textarea and toolbar selects onto shared design-system primitives.
 * - 2026-03-13: Removed reasoning/permission prefixes from dropdown option labels and capitalized the visible text.
 * - 2026-03-13: Switched composer reasoning-effort options to `default`/`none` so users can distinguish omission from an explicit no-reasoning hint.
 * - 2026-03-13: Added world-scoped reasoning-effort dropdown to the composer toolbar.
 * - 2026-03-12: Added tool permission `<select>` dropdown after the Project button to expose world-level read/ask/auto permission control.
 * - 2026-02-20: Disabled new-message composer actions while a HITL prompt is pending.
 * - 2026-02-14: Extracted from App.jsx to simplify renderer orchestration logic.
 */

import React from 'react';
import { Select, Textarea } from '../../../design-system/primitives';
import { MAIN_CONTENT_COLUMN_MAX_WIDTH_CLASS } from '../../../constants/ui-constants';

export default function ComposerBar({
  onSubmitMessage,
  composerTextareaRef,
  composer,
  onComposerChange,
  onComposerKeyDown,
  onOpenProjectFolder,
  onOpenProjectViewer,
  selectedProjectPath,
  canStopCurrentSession,
  isCurrentSessionStopping,
  isCurrentSessionSending,
  hasActiveHitlPrompt,
  onAddToQueue,
  reasoningEffort = 'default',
  onSetReasoningEffort,
  toolPermission = 'auto',
  onSetToolPermission,
}) {
  const composerDisabled = Boolean(hasActiveHitlPrompt) && !canStopCurrentSession;
  const showStopButton = canStopCurrentSession || isCurrentSessionSending;
  return (
    <form onSubmit={onSubmitMessage} className="px-4 pt-4 pb-2">
      <div className={`mx-auto flex w-full ${MAIN_CONTENT_COLUMN_MAX_WIDTH_CLASS} flex-col gap-2 rounded-lg border border-input bg-card p-3`}>
        <Textarea
          textareaRef={composerTextareaRef}
          value={composer}
          onChange={(event) => onComposerChange(event.target.value)}
          onKeyDown={onComposerKeyDown}
          rows={1}
          placeholder={composerDisabled ? 'Resolve pending HITL prompt before sending a new message...' : 'Send a message...'}
          className="w-full resize-none border-0 bg-transparent px-1 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:border-transparent focus:ring-0"
          aria-label="Message input"
          disabled={composerDisabled}
        />
        <div className="flex items-end justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
              onClick={onOpenProjectFolder}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Open project folder"
              title={selectedProjectPath ? `Open project folder. Current folder: ${selectedProjectPath}` : 'Open project folder for context'}
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
            </button>
            <div
              className="flex min-w-0 flex-nowrap items-center gap-1.5"
              data-testid="composer-project-controls-row"
            >
              <button
                type="button"
                onClick={onOpenProjectViewer}
                disabled={!selectedProjectPath}
                className="flex h-9 shrink-0 items-center rounded-lg px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Open project viewer"
                title={selectedProjectPath ? `Open project viewer for ${selectedProjectPath}` : 'Select project folder first'}
              >
                <span>Project</span>
              </button>
              <Select
                size="sm"
                value={reasoningEffort}
                onChange={(e) => onSetReasoningEffort?.(e.target.value)}
                className="!w-[78px] shrink-0 rounded-lg border-0 bg-transparent px-1.5 text-[12px] leading-none text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:border-transparent focus:ring-0"
                aria-label="Reasoning effort"
                title="Reasoning effort"
                data-testid="composer-reasoning-effort"
              >
                <option value="default">Not set</option>
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
              <Select
                size="sm"
                value={toolPermission}
                onChange={(e) => onSetToolPermission?.(e.target.value)}
                className="!w-[72px] shrink-0 rounded-lg border-0 bg-transparent px-1.5 text-[12px] leading-none text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:border-transparent focus:ring-0"
                aria-label="Tool permission level"
                title="Tool permission level"
              >
                <option value="read">Read</option>
                <option value="ask">Ask</option>
                <option value="auto">Auto</option>
              </Select>
            </div>
          </div>
          <button
            type="submit"
            disabled={showStopButton ? (isCurrentSessionStopping || isCurrentSessionSending) : (!composer.trim() || composerDisabled)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={showStopButton ? 'Stop message processing' : 'Send message'}
            title={showStopButton ? 'Stop processing' : 'Send message'}
          >
            {showStopButton ? (
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
