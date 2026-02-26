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
 * - 2026-02-26: Added inline message error indicator rendering for `hasError/errorMessage` so stream failures show inside message cards (web-parity behavior).
 * - 2026-02-21: Added shell command header labeling (`Running command: <name>`) from tool-stream command metadata and unified stderr/stdout tool output styling to dark background with light text.
 * - 2026-02-21: Prefer tool name from `tool_calls` metadata and treat assistant messages with `tool_calls` as explicit tool requests in header labeling.
 * - 2026-02-16: Extracted from `App.jsx` as part of renderer refactor Phase 2.
 */

import { useMemo } from 'react';
import { renderMarkdown } from '../utils/markdown';
import { formatLogMessage } from '../utils/formatting';
import { isToolRelatedMessage } from '../utils/message-utils';

function extractToolNameFromMessage(message) {
  const explicitToolName = String(message?.toolName || message?.tool_name || '').trim();
  if (explicitToolName) {
    return explicitToolName;
  }

  if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
    const firstToolName = String(message.tool_calls[0]?.function?.name || '').trim();
    if (firstToolName) {
      return firstToolName;
    }
  }

  const content = String(message?.content || '');
  const callingToolMatch = content.match(/calling tool\s*:\s*([a-z0-9_.:-]+)/i);
  if (callingToolMatch?.[1]) {
    return callingToolMatch[1];
  }

  return '';
}

function extractCommandNameFromMessage(message) {
  const rawCommand = String(message?.command || '').trim();
  if (!rawCommand) {
    return '';
  }

  const firstToken = rawCommand.split(/\s+/)[0] || '';
  if (!firstToken) {
    return '';
  }

  const pathSegments = firstToken.split(/[\\/]/).filter(Boolean);
  return pathSegments[pathSegments.length - 1] || firstToken;
}

function getToolMessageHeaderLabel(message) {
  const content = String(message?.content || '');
  const hasToolCalls = Array.isArray(message?.tool_calls) && message.tool_calls.length > 0;
  const isToolCallRequest = hasToolCalls || /calling tool\s*:/i.test(content);
  const toolName = extractToolNameFromMessage(message);
  const streamType = String(message?.streamType || '').toLowerCase();

  if (isToolCallRequest) {
    return toolName ? `⚙️ Tool request → ${toolName}` : '⚙️ Tool request';
  }

  if (message?.isToolStreaming) {
    const normalized = toolName.toLowerCase();
    const isShell = normalized === 'shell_cmd' || normalized === 'shell-cmd' || normalized === 'shell';
    if (isShell) {
      const commandName = extractCommandNameFromMessage(message);
      return commandName ? `⚙️ Running: ${commandName}` : '⚙️ Running shell command...';
    }
    return toolName ? `⚙️ Running ${toolName}...` : '⚙️ Running...';
  }

  if (streamType === 'stderr') {
    return toolName ? `⚙️ ${toolName} errors` : '⚙️ Execution errors';
  }

  return toolName ? `⚙️ ${toolName} result` : '⚙️ Tool result';
}

export default function MessageContent({ message, collapsed = false }) {
  const isToolMessage = isToolRelatedMessage(message);
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
        <div className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {toolHeaderLabel}
        </div>
        {!collapsed ? (
          <div className="rounded-md overflow-hidden border border-border bg-muted">
            <pre
              className="text-xs p-3 font-mono whitespace-pre-wrap break-all text-foreground"
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

  if (collapsed) return null;

  const inlineErrorText = String(message?.errorMessage || '').trim();
  const shouldShowInlineError = message?.hasError === true && inlineErrorText.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="prose prose-invert max-w-none break-words text-foreground"
        dangerouslySetInnerHTML={{ __html: renderedContent }}
      />
      {shouldShowInlineError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          Error: {inlineErrorText}
        </div>
      ) : null}
    </div>
  );
}
