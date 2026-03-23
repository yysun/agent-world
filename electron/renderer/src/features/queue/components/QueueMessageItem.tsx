/**
 * QueueMessageItem Component
 *
 * Purpose:
 * - Render a single message in the user message queue.
 *
 * Key Features:
 * - Status badge: queued / sending / error / cancelled
 * - Remove button (disabled while sending)
 * - Truncated content preview
 */

import React from 'react';
import type { QueuedMessageEntry } from '../../../hooks/useMessageQueue';

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  sending: 'Processing',
  error: 'Error',
  cancelled: 'Cancelled',
};

const STATUS_CLASSES: Record<string, string> = {
  queued: 'bg-muted text-muted-foreground',
  sending: 'bg-blue-500/15 text-blue-500',
  error: 'bg-red-500/15 text-red-500',
  cancelled: 'bg-muted/50 text-muted-foreground/50',
};

export default function QueueMessageItem({
  message,
  onRemove,
  onRetry,
}: {
  message: QueuedMessageEntry;
  onRemove: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
}) {
  const isSending = message.status === 'sending';
  const isError = message.status === 'error';
  const statusClass = STATUS_CLASSES[message.status] || STATUS_CLASSES.queued;
  const statusLabel = STATUS_LABELS[message.status] || message.status;

  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
      <span
        className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight ${statusClass}`}
        aria-label={`Status: ${statusLabel}`}
      >
        {statusLabel}
      </span>

      <span className="min-w-0 flex-1 truncate text-foreground/80">
        {message.content}
      </span>

      {isError && onRetry && (
        <button
          type="button"
          onClick={() => onRetry(message.messageId)}
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-500 transition-colors hover:bg-blue-500/10"
          aria-label="Retry failed message"
          title="Retry this message"
        >
          Retry
        </button>
      )}

      <button
        type="button"
        onClick={() => onRemove(message.messageId)}
        disabled={isSending}
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
        aria-label={isError ? 'Skip failed message' : 'Remove from queue'}
        title={isSending ? 'Cannot remove while sending' : isError ? 'Skip this message' : 'Remove from queue'}
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
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
