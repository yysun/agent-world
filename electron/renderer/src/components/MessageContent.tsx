/**
 * Message Content Component
 * Purpose:
 * - Render message body content across regular, log, and tool-related rows.
 *
 * Key Features:
 * - Markdown rendering for normal chat messages.
 * - Structured log output with level-color indicator.
 * - Collapsible tool output with truncation guard for large payloads.
 *
 * Implementation Notes:
 * - Keeps rendering behavior aligned with prior inline App implementation.
 * - Helper functions are scoped to this module because only this component uses them.
 *
 * Recent Changes:
 * - 2026-02-16: Extracted from `App.jsx` as part of renderer refactor Phase 2.
 */

import { useMemo, useState } from 'react';
import { renderMarkdown } from '../utils/markdown';
import { formatLogMessage } from '../utils/formatting';
import { isToolRelatedMessage } from '../utils/message-utils';

function extractToolNameFromMessage(message) {
  const explicitToolName = String(message?.toolName || message?.tool_name || '').trim();
  if (explicitToolName) {
    return explicitToolName;
  }

  const content = String(message?.content || '');
  const callingToolMatch = content.match(/calling tool\s*:\s*([a-z0-9_.:-]+)/i);
  if (callingToolMatch?.[1]) {
    return callingToolMatch[1];
  }

  return '';
}

function getToolMessageHeaderLabel(message) {
  const content = String(message?.content || '');
  const isToolCallRequest = /calling tool\s*:/i.test(content);
  const toolName = extractToolNameFromMessage(message);
  const normalizedToolName = toolName.toLowerCase();
  const isShellCommandTool = normalizedToolName === 'shell_cmd' || normalizedToolName === 'shell-cmd' || normalizedToolName === 'shell';
  const streamType = String(message?.streamType || '').toLowerCase();

  if (isToolCallRequest) {
    return toolName ? `⚙️ Tool request → ${toolName}` : '⚙️ Tool request';
  }

  if (message?.isToolStreaming) {
    if (isShellCommandTool) {
      return '⚙️ Running command...';
    }
    return toolName ? `⚙️ Running ${toolName}...` : '⚙️ Running action...';
  }

  if (streamType === 'stderr') {
    if (isShellCommandTool) {
      return '⚙️ Command errors';
    }
    return toolName ? `⚙️ ${toolName} errors` : '⚙️ Execution errors';
  }

  if (isShellCommandTool) {
    return '⚙️ Terminal output';
  }

  if (toolName) {
    return `⚙️ ${toolName} result`;
  }

  return '⚙️ Execution result';
}

export default function MessageContent({ message }) {
  const isToolMessage = isToolRelatedMessage(message);
  const [isToolCollapsed, setIsToolCollapsed] = useState(true);
  const MAX_TOOL_OUTPUT_LENGTH = 50000;

  const renderedContent = useMemo(() => {
    if (message.logEvent || isToolMessage) {
      return null;
    }

    const content = message.content || '';
    if (!content) return '';

    return renderMarkdown(content);
  }, [message.content, message.logEvent, isToolMessage]);

  if (message.logEvent) {
    const logLineText = `${message.logEvent.category} - ${formatLogMessage(message.logEvent)}`;
    return (
      <div className="flex items-start gap-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
        <span
          className="inline-block rounded-full mt-0.5"
          style={{
            width: '6px',
            height: '6px',
            flexShrink: 0,
            backgroundColor:
              message.logEvent.level === 'error' ? '#ef4444' :
                message.logEvent.level === 'warn' ? '#f59e0b' :
                  message.logEvent.level === 'info' ? '#10b981' :
                    message.logEvent.level === 'debug' ? '#06b6d4' :
                      '#9ca3af'
          }}
        />
        <div className="flex-1 break-words" style={{ color: 'hsl(var(--foreground))' }}>
          {logLineText}
        </div>
      </div>
    );
  }

  if (isToolMessage) {
    const toolContent = String(message.content || '');
    const isTruncated = toolContent.length > MAX_TOOL_OUTPUT_LENGTH;
    const visibleContent = isTruncated ? toolContent.slice(0, MAX_TOOL_OUTPUT_LENGTH) : toolContent;
    const toolHeaderLabel = getToolMessageHeaderLabel(message);

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {toolHeaderLabel}
          </div>
          <button
            type="button"
            onClick={() => setIsToolCollapsed((collapsed) => !collapsed)}
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            aria-label={isToolCollapsed ? 'Expand tool output' : 'Collapse tool output'}
            title={isToolCollapsed ? 'Expand tool output' : 'Collapse tool output'}
          >
            {isToolCollapsed ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path d="m18 15-6-6-6 6" />
              </svg>
            )}
          </button>
        </div>
        {!isToolCollapsed ? (
          <div
            className="rounded-md overflow-hidden border"
            style={message.streamType === 'stderr' ? {
              backgroundColor: 'rgba(69, 10, 10, 0.3)',
              borderColor: 'rgba(239, 68, 68, 0.3)'
            } : {
              backgroundColor: 'rgb(15, 23, 42)',
              borderColor: 'rgb(51, 65, 85)'
            }}
          >
            <pre
              className="text-xs p-3 font-mono whitespace-pre-wrap"
              style={{
                color: message.streamType === 'stderr'
                  ? 'rgb(248, 113, 113)'
                  : 'rgb(203, 213, 225)',
                wordBreak: 'break-all'
              }}
            >
              {visibleContent || (message.isToolStreaming ? '(waiting for output...)' : '(no output)')}
            </pre>
            {isTruncated ? (
              <div className="border-t border-border/40 px-3 py-2 text-[11px] text-amber-400">
                ⚠️ Output truncated (exceeded 50,000 characters)
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="prose prose-invert max-w-none break-words text-foreground"
      dangerouslySetInnerHTML={{ __html: renderedContent }}
    />
  );
}
