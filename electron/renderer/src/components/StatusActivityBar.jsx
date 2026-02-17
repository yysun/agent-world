/**
 * Status Activity Bar Component
 * Purpose:
 * - Render the bottom status/activity bar for composer progress and status text.
 *
 * Key Features:
 * - Activity mode with pulse, tool count, status text, and elapsed timer.
 * - Passive status mode for non-activity status messages.
 * - Role-aware status color handling for error/success/default states.
 *
 * Implementation Notes:
 * - Receives fully derived state from `App.jsx` orchestration.
 * - Preserves existing renderer behavior and visual styling from the previous inline block.
 *
 * Recent Changes:
 * - 2026-02-17: Extracted from `App.jsx` during Phase 4 component decomposition.
 */

import ActivityPulse from './ActivityPulse.jsx';
import ElapsedTimeCounter from './ElapsedTimeCounter.jsx';

export default function StatusActivityBar({
  status,
  hasComposerActivity,
  isAgentWorkInProgress,
  activeTools,
  elapsedMs,
}) {
  if (!status?.text && !hasComposerActivity) return null;

  return (
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
  );
}