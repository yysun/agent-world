/**
 * Logs Panel Content
 * Purpose:
 * - Render the shell-owned logs panel body for unified Electron runtime logs.
 *
 * Key Features:
 * - Shows scoped log rows from both main and renderer processes.
 * - Preserves sticky-to-bottom behavior while allowing manual scroll inspection.
 * - Exposes a clear action for the currently visible scoped log list.
 *
 * Implementation Notes:
 * - This remains shell-owned because it is app chrome rather than a product feature workflow.
 *
 * Recent Changes:
 * - 2026-04-19: Extracted from the transitional right-panel catch-all so shell only routes to dedicated panel bodies.
 */

import { useEffect, useRef } from 'react';

function formatLogTimestamp(value: unknown): string {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return rawValue;
  }
  return parsed.toLocaleTimeString();
}

function stringifyLogData(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getProcessBadgeStyle(process: string) {
  const accentColor = process === 'renderer'
    ? 'var(--color-chart-2)'
    : 'var(--color-chart-1)';

  return {
    color: 'var(--color-sidebar-foreground)',
    backgroundColor: `color-mix(in oklab, ${accentColor} 16%, var(--color-sidebar-accent))`,
    borderColor: `color-mix(in oklab, ${accentColor} 42%, var(--color-sidebar-border))`,
  };
}

function getLevelBadgeStyle(level: string) {
  let accentColor = 'var(--color-chart-2)';
  if (level === 'error') accentColor = 'var(--color-destructive)';
  if (level === 'warn') accentColor = 'var(--color-chart-3)';
  if (level === 'debug' || level === 'trace') accentColor = 'var(--color-chart-5)';

  return {
    color: 'var(--color-sidebar-foreground)',
    backgroundColor: `color-mix(in oklab, ${accentColor} 16%, var(--color-sidebar-accent))`,
    borderColor: `color-mix(in oklab, ${accentColor} 42%, var(--color-sidebar-border))`,
  };
}

function isNearBottom(container: HTMLDivElement, threshold = 24) {
  const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
  return remaining <= threshold;
}

export default function LogsPanelContent({ panelLogs, onClearPanelLogs }) {
  const logsContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldStickLogsToBottomRef = useRef(true);

  useEffect(() => {
    shouldStickLogsToBottomRef.current = true;
  }, []);

  useEffect(() => {
    const container = logsContainerRef.current;
    if (!container || !shouldStickLogsToBottomRef.current) return;
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'auto',
      });
    });
  }, [panelLogs.length]);

  const onLogsContainerScroll = () => {
    const container = logsContainerRef.current;
    if (!container) return;
    shouldStickLogsToBottomRef.current = isNearBottom(container);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2">
        <div className="text-xs text-sidebar-foreground/80">
          {Array.isArray(panelLogs) && panelLogs.length > 0 ? `${panelLogs.length} entries` : 'No log entries yet'}
        </div>
        <button
          type="button"
          onClick={onClearPanelLogs}
          disabled={!Array.isArray(panelLogs) || panelLogs.length === 0}
          className="rounded border border-sidebar-border px-2 py-0.5 text-[11px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-foreground/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear
        </button>
      </div>
      <div
        ref={logsContainerRef}
        onScroll={onLogsContainerScroll}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
      >
        {Array.isArray(panelLogs) && panelLogs.length > 0 ? (
          panelLogs.map((entry) => {
            const process = String(entry?.process || '').trim().toLowerCase() === 'renderer' ? 'renderer' : 'main';
            const level = String(entry?.level || 'info').trim().toLowerCase() || 'info';
            const category = String(entry?.category || 'runtime').trim() || 'runtime';
            const message = String(entry?.message || '').trim() || '(empty log message)';
            const timestamp = formatLogTimestamp(entry?.timestamp);
            const dataText = stringifyLogData(entry?.data);

            return (
              <article key={String(entry?.id || `${timestamp}-${category}-${message}`)} className="space-y-2 rounded-md border border-sidebar-border bg-sidebar-accent/80 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className="rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={getProcessBadgeStyle(process)}
                  >
                    {process}
                  </span>
                  <span
                    className="rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={getLevelBadgeStyle(level)}
                  >
                    {level}
                  </span>
                  <span className="text-[10px] text-sidebar-foreground/60">{timestamp}</span>
                </div>
                <div className="text-[11px] font-semibold text-sidebar-foreground/70">{category}</div>
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-sidebar-foreground">{message}</pre>
                {dataText ? (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-sidebar-border/70 bg-sidebar px-2 py-1 font-mono text-[10px] text-sidebar-foreground/80">
                    {dataText}
                  </pre>
                ) : null}
              </article>
            );
          })
        ) : (
          <div className="rounded-md border border-dashed border-sidebar-border bg-sidebar-accent/30 px-3 py-4 text-xs text-sidebar-foreground/60">
            Logs from both Electron processes will appear here.
          </div>
        )}
      </div>
    </div>
  );
}
