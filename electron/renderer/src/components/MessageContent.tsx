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
 * - 2026-03-06: Recognize canonical shell `validation_error` and `approval_denied` result reasons as failed tool outcomes in renderer status labels.
 * - 2026-02-28: Added linked tool-request backfill support so tool-result cards render combined `Args` + `Result` even when `tool_calls` live on a separate assistant row.
 * - 2026-02-28: Updated tool status label format to `tool - <name> - <status>` and added optional resolved-name override for history rows missing direct tool metadata.
 * - 2026-02-27: Restored bold user prompt preview above the `<model> ......` pre-chunk wait row on assistant cards.
 * - 2026-02-27: Removed embedded user-preview box rendering so user context remains in the original user message card.
 * - 2026-02-27: Tool cards no longer render embedded HUMAN preview sections.
 * - 2026-02-27: Pre-chunk assistant streaming placeholder now renders as `<model> ......` with animated accumulating dots.
 * - 2026-02-27: Added animated accumulating `...` placeholder for streaming assistant messages before first response chunk arrives.
 * - 2026-02-27: Removed assistant-card `a1 is working` inline indicator text during streaming; activity remains visible through card/tool animations and status rows.
 * - 2026-02-27: Removed request-phase `Calling <tool>...` indicator block while pending; waiting state is represented only by top-row status (`running`).
 * - 2026-02-27: Exposed tool status label helper and added optional tool-header suppression for list-level sender+status rendering.
 * - 2026-02-27: Header status now detects failed tool outcomes from result payload content (e.g. `status: failed`, `exit_code: 1`, timeout/canceled/non_zero_exit) to avoid false `done`.
 * - 2026-02-27: Tool header format simplified to `⚙️ <tool> - <status>` and combined tool body now shows `Args` + `Result` in the collapsible section.
 * - 2026-02-27: Tool headers now show `toolName (args) + status` with compact request arguments and runtime state (`running|done|error`).
 * - 2026-02-27: Combined tool cards now render explicit Request + Result sections so both tool-call intent and output are visible together.
 * - 2026-02-27: Added merged tool-request/result rendering support via `combinedToolResults` so request and response appear in one card.
 * - 2026-02-27: Tool working indicator now respects unresolved tool-call state passed by parent and stops after completion.
 * - 2026-02-27: Added animated tool-phase indicator for `calling tool` and live tool streaming rows.
 * - 2026-02-27: Added inline animated `is working` indicator for streaming assistant messages and suppressed static `...` placeholder-only rendering.
 * - 2026-02-26: Added inline message error indicator rendering for `hasError/errorMessage` so stream failures show inside message cards (web-parity behavior).
 * - 2026-02-21: Added shell command header labeling (`Running command: <name>`) from tool-stream command metadata and unified stderr/stdout tool output styling to dark background with light text.
 * - 2026-02-21: Prefer tool name from `tool_calls` metadata and treat assistant messages with `tool_calls` as explicit tool requests in header labeling.
 * - 2026-02-16: Extracted from `App.jsx` as part of renderer refactor Phase 2.
 */

import { useMemo } from 'react';
import { renderMarkdown } from '../utils/markdown';
import { formatLogMessage } from '../utils/formatting';
import { isToolRelatedMessage } from '../utils/message-utils';
import ThinkingIndicator from './ThinkingIndicator';

function isStreamingPlaceholderContent(content) {
  const normalized = String(content || '').trim();
  if (!normalized) {
    return true;
  }
  return /^[.\u2026]{1,6}$/.test(normalized);
}

function extractToolNameFromMessage(message) {
  const explicitToolName = String(message?.toolName || message?.tool_name || '').trim();
  if (explicitToolName) {
    return explicitToolName;
  }
  const toolExecutionName = String(message?.toolExecution?.toolName || '').trim();
  if (toolExecutionName) {
    return toolExecutionName;
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

function toToolResultRecord(content) {
  const text = String(content || '').trim();
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function extractBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

function extractNumeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isFailedToolResultContent(content) {
  const text = String(content || '').trim();
  if (!text) {
    return false;
  }

  const record = toToolResultRecord(text);
  if (record) {
    const status = String(record.status || '').trim().toLowerCase();
    const reason = String(record.reason || '').trim().toLowerCase();
    const timedOut = extractBoolean(record.timed_out ?? record.timedOut);
    const canceled = extractBoolean(record.canceled ?? record.cancelled);
    const exitCode = extractNumeric(record.exit_code ?? record.exitCode);

    if (status === 'failed' || status === 'error') return true;
    if (timedOut === true || canceled === true) return true;
    if (reason === 'non_zero_exit' || reason === 'execution_error' || reason === 'validation_error' || reason === 'approval_denied' || reason === 'timeout' || reason === 'timed_out' || reason === 'canceled' || reason === 'cancelled') {
      return true;
    }
    if (exitCode !== null && exitCode !== 0) return true;
  }

  if (/status\s*[:=]\s*failed/i.test(text)) return true;
  if (/timed[_\s-]?out\s*[:=]\s*true/i.test(text)) return true;
  if (/cancel(?:ed|led)\s*[:=]\s*true/i.test(text)) return true;
  if (/reason\s*[:=]\s*(non_zero_exit|execution_error|validation_error|approval_denied|timeout|timed_out|canceled|cancelled)/i.test(text)) return true;

  const exitCodeMatch = text.match(/exit[_\s-]?code\s*[:=]\s*(-?\d+)/i);
  if (exitCodeMatch?.[1]) {
    const exitCode = Number(exitCodeMatch[1]);
    if (Number.isFinite(exitCode) && exitCode !== 0) {
      return true;
    }
  }

  return false;
}

export function getToolStatusLabel(message, isToolCallPending = false, resolvedToolName = '') {
  const content = String(message?.content || '');
  const hasToolCalls = Array.isArray(message?.tool_calls) && message.tool_calls.length > 0;
  const isToolCallRequest = hasToolCalls || /calling tool\s*:/i.test(content);
  const hasCombinedResult = Array.isArray(message?.combinedToolResults) && message.combinedToolResults.length > 0;
  const toolName = String(resolvedToolName || extractToolNameFromMessage(message)).trim();
  const streamType = String(message?.streamType || '').toLowerCase();
  const combinedResults = Array.isArray(message?.combinedToolResults) ? message.combinedToolResults : [];
  const hasCombinedError = combinedResults.some((result) => {
    const streamIsError = String(result?.streamType || '').toLowerCase() === 'stderr';
    return streamIsError || isFailedToolResultContent(result?.content);
  });
  const hasMessageFailure = String(streamType || '').toLowerCase() === 'stderr' || isFailedToolResultContent(message?.content);
  const statusLabel = message?.isToolStreaming === true || isToolCallPending
    ? 'running'
    : (hasCombinedError || hasMessageFailure ? 'failed' : 'done');

  const normalizedToolName = toolName || 'unknown';
  if (hasCombinedResult || isToolCallRequest) {
    return `tool: ${normalizedToolName} - ${statusLabel}`;
  }

  return `tool: ${normalizedToolName} - ${statusLabel}`;
}

function isToolCallRequestMessage(message) {
  if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
    return true;
  }
  return /calling tool\s*:/i.test(String(message?.content || ''));
}

function buildCombinedToolResultContent(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return '';
  }

  if (results.length === 1) {
    return String(results[0]?.content || '');
  }

  return results
    .map((result, index) => {
      const toolName = String(result?.toolName || '').trim();
      const toolCallId = String(result?.tool_call_id || result?.messageId || '').trim();
      const title = toolName || toolCallId || `tool-${index + 1}`;
      const content = String(result?.content || '').trim() || '(no output)';
      return `[${title}]\n${content}`;
    })
    .join('\n\n');
}

function buildToolRequestContent(message) {
  const directToolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const linkedToolCalls = Array.isArray(message?.linkedToolRequest?.tool_calls)
    ? message.linkedToolRequest.tool_calls
    : [];
  const toolCalls = directToolCalls.length > 0 ? directToolCalls : linkedToolCalls;
  if (toolCalls.length > 0) {
    return toolCalls
      .map((toolCall, index) => {
        const name = String(toolCall?.function?.name || toolCall?.name || `tool-${index + 1}`).trim() || `tool-${index + 1}`;
        const rawArgs = toolCall?.function?.arguments ?? toolCall?.arguments ?? {};
        const argsText = typeof rawArgs === 'string'
          ? rawArgs
          : (() => {
            try {
              return JSON.stringify(rawArgs, null, 2);
            } catch {
              return String(rawArgs);
            }
          })();
        return `${name}\nargs:\n${argsText || '{}'}`;
      })
      .join('\n\n');
  }

  const inlineToolInput = message?.toolInput && typeof message.toolInput === 'object'
    ? message.toolInput
    : null;
  const inlineCommand = String(message?.command || '').trim();
  if (inlineToolInput || inlineCommand) {
    const toolName = String(extractToolNameFromMessage(message) || 'tool').trim() || 'tool';
    const argsPayload = inlineToolInput
      ? { ...inlineToolInput }
      : {};
    if (inlineCommand && typeof (argsPayload as Record<string, unknown>).command !== 'string') {
      (argsPayload as Record<string, unknown>).command = inlineCommand;
    }
    let argsText = '{}';
    try {
      argsText = JSON.stringify(argsPayload, null, 2) || '{}';
    } catch {
      argsText = String(argsPayload);
    }
    return `${toolName}\nargs:\n${argsText}`;
  }

  const fallbackContent = String(message?.content || '').trim();
  if (fallbackContent) {
    return fallbackContent;
  }

  return '(tool request)';
}

function buildCombinedRequestAndResultContent(message, combinedResults) {
  const requestText = buildToolRequestContent(message);
  const resultText = buildCombinedToolResultContent(combinedResults) || '(no output)';
  const planningText = String(message?.content || '').trim();
  const hasMeaningfulPlanningText = planningText.length > 0 && !/^calling tool\s*:/i.test(planningText);
  if (hasMeaningfulPlanningText) {
    return `${planningText}\n\nArgs:\n${requestText}\n\nResult:\n${resultText}`;
  }

  return `Args:\n${requestText}\n\nResult:\n${resultText}`;
}

export function getToolBodyContent(message) {
  const combinedToolResults = Array.isArray(message?.combinedToolResults) ? message.combinedToolResults : [];
  const hasCombinedResult = combinedToolResults.length > 0;
  const isToolCallRequest = isToolCallRequestMessage(message);
  const hasLinkedToolRequest = Array.isArray(message?.linkedToolRequest?.tool_calls)
    && message.linkedToolRequest.tool_calls.length > 0;
  const hasInlineToolInput = Boolean(
    (message?.toolInput && typeof message.toolInput === 'object')
    || String(message?.command || '').trim()
  );
  const shouldRenderRequestAndResult = hasCombinedResult
    || isToolCallRequest
    || hasLinkedToolRequest
    || hasInlineToolInput;

  if (shouldRenderRequestAndResult) {
    const resultRows = hasCombinedResult ? combinedToolResults : [message];
    return buildCombinedRequestAndResultContent(message, resultRows);
  }

  return String(message?.content || '');
}

export default function MessageContent({
  message,
  collapsed = false,
  isToolCallPending = false,
  showToolHeader = true,
  streamingDotsLabel = 'model',
  streamingInputPreview = '',
}) {
  const isToolMessage = message?.forceAssistantMessage === true ? false : isToolRelatedMessage(message);
  const MAX_TOOL_OUTPUT_LENGTH = 50000;
  const isAssistantStreaming = message?.isStreaming === true && !isToolMessage;
  const shouldHideStreamingPlaceholder = isAssistantStreaming && isStreamingPlaceholderContent(message?.content);
  const displayContent = shouldHideStreamingPlaceholder ? '' : String(message?.content || '');
  const shouldShowStreamingDots = isAssistantStreaming && !displayContent;

  const renderedContent = useMemo(() => {
    if (message.logEvent || isToolMessage) {
      return null;
    }

    const content = displayContent;
    if (!content) return '';

    return renderMarkdown(content);
  }, [displayContent, message.logEvent, isToolMessage]);

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
    const toolContent = getToolBodyContent(message);
    const isTruncated = toolContent.length > MAX_TOOL_OUTPUT_LENGTH;
    const visibleContent = isTruncated ? toolContent.slice(0, MAX_TOOL_OUTPUT_LENGTH) : toolContent;
    const toolHeaderLabel = `⚙️ ${getToolStatusLabel(message, isToolCallPending)}`;
    const toolName = extractToolNameFromMessage(message);
    const isToolStreaming = message?.isToolStreaming === true;
    const shouldShowToolWorkingIndicator = isToolStreaming;
    const toolIndicatorText = toolName ? `${toolName} running` : 'Tool running';

    return (
      <div className="flex flex-col gap-2">
        {showToolHeader ? (
          <div className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {toolHeaderLabel}
          </div>
        ) : null}
        {shouldShowToolWorkingIndicator ? (
          <div className="agent-tool-indicator rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1">
            <ThinkingIndicator text={toolIndicatorText} className="text-xs text-amber-200" />
          </div>
        ) : null}
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
      {shouldShowStreamingDots ? (
        <div className="agent-streaming-dots text-xs" role="status" aria-live="polite" aria-label="Waiting for response">
          <span className="agent-streaming-dots-label">{streamingDotsLabel}</span>
          <span className="agent-streaming-dots-text" aria-hidden="true" />
        </div>
      ) : null}
      {displayContent ? (
        <div
          className="prose prose-invert max-w-none break-words text-foreground"
          dangerouslySetInnerHTML={{ __html: renderedContent }}
        />
      ) : null}
      {shouldShowInlineError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          Error: {inlineErrorText}
        </div>
      ) : null}
    </div>
  );
}
