/**
 * MessageQueuePanel Component
 *
 * Purpose:
 * - Display the user message queue with status indicators and control buttons.
 * - Hidden unless more than one active queue item remains.
 *
 * Key Features:
 * - Lists queued messages in order (queued, sending)
 * - Pause / Resume / Stop / Clear controls
 * - Auto-hides when the queue does not have enough items to justify the floating panel
 *
 * Implementation Notes:
 * - Stateless presentation; parent owns queue state and action callbacks.
 * - Queue processing is driven by core, not this component.
 *
 * Summary of Recent Changes:
 * - 2026-04-23: Added a defensive visibility guard so the panel stays hidden until two queue items remain.
 */

import React from 'react';
import { MAIN_CONTENT_COLUMN_MAX_WIDTH_CLASS } from '../../../constants/ui-constants';
import QueueMessageItem from './QueueMessageItem';
import type { QueuedMessageEntry } from '../../../hooks/useMessageQueue';

export default function MessageQueuePanel({
  queuedMessages,
  onRemove,
  onRetry,
  onPause,
  onResume,
  onStop,
  onClear,
  isPaused = false,
}: {
  queuedMessages: QueuedMessageEntry[];
  onRemove: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onClear: () => void;
  isPaused?: boolean;
}) {
  if (queuedMessages.length < 2) return null;

  const hasSending = queuedMessages.some((m) => m.status === 'sending');

  return (
    <div className={`mx-auto w-full ${MAIN_CONTENT_COLUMN_MAX_WIDTH_CLASS} px-4 pb-2`} data-testid="message-queue-panel">
      <div className="rounded-lg border border-border bg-card/50 p-2">
        <div className="mb-1.5 flex items-center justify-between px-1">
          <span className="text-xs font-medium text-muted-foreground">
            Message Queue ({queuedMessages.length})
          </span>
          <div className="flex items-center gap-1">
            {isPaused ? (
              <button
                type="button"
                onClick={onResume}
                className="rounded px-2 py-0.5 text-[11px] font-medium text-blue-500 transition-colors hover:bg-blue-500/10"
                aria-label="Resume queue"
              >
                Resume
              </button>
            ) : (
              <button
                type="button"
                onClick={onPause}
                disabled={hasSending && queuedMessages.length <= 1}
                className="rounded px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                aria-label="Pause queue"
              >
                Pause
              </button>
            )}
            <button
              type="button"
              onClick={onStop}
              disabled={queuedMessages.length === 0}
              className="rounded px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              aria-label="Stop queue"
            >
              Stop
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={hasSending}
              className="rounded px-2 py-0.5 text-[11px] font-medium text-red-500/70 transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
              aria-label="Clear queue"
              title={hasSending ? 'Cannot clear while a message is sending' : 'Clear all queued messages'}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          {queuedMessages.map((message) => (
            <QueueMessageItem
              key={message.messageId}
              message={message}
              onRemove={onRemove}
              onRetry={onRetry}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
