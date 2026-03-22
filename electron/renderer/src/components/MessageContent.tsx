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
 * - 2026-03-21: Route Electron HTML artifact iframes through guarded `preview=inline-html` URLs so bundle-relative assets resolve inside inline previews.
 * - 2026-03-21: Recognize plain-text tool execution failures such as `Error executing tool` / `Tool not found` so Electron tool status dots stay red for failed runs.
 * - 2026-03-21: Render structured tool envelope previews in Electron tool rows and combined request/result views instead of collapsing adopted previews to plain summary text.
 * - 2026-03-13: Switched the reasoning header to regular-weight text and removed visible `Open` / `Collapse` toggle labels so the control stays arrow-only.
 * - 2026-03-13: Added a separate assistant reasoning toggle so completed messages keep reasoning available in a collapsed section instead of dropping it after stream finalization.
 * - 2026-03-13: Flattened tool rows into dot-status transcript lines and removed the in-body tool card shell so collapsed tool rows stay compact.
 * - 2026-03-13: Rendered streamed assistant `reasoningContent` in a separate muted block so reasoning-only chunks stay visible without polluting answer text.
 * - 2026-03-06: Render persisted tool execution envelope previews in tool bodies and status helpers after reload.
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

import { useEffect, useMemo, useState } from 'react';
import { readDesktopApi } from '../domain/desktop-api';
import { renderMarkdown } from '../utils/markdown';
import { formatLogMessage } from '../utils/formatting';
import { isToolRelatedMessage } from '../utils/message-utils';
import {
  getToolExecutionEnvelope,
  normalizeToolPreviewItems,
  getToolPreviewDisplayText,
  parseToolExecutionEnvelopeContent,
  stringifyToolEnvelopeResult,
} from '../utils/tool-execution-envelope';

const MESSAGE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:', 'sms:', 'xmpp:', 'callto:']);

function getElementFromEventTarget(target) {
  if (!target || typeof target !== 'object') {
    return null;
  }

  if (typeof target.closest === 'function') {
    return target;
  }

  if (target.nodeType === 3 && target.parentElement && typeof target.parentElement.closest === 'function') {
    return target.parentElement;
  }

  if (target.parentElement && typeof target.parentElement.closest === 'function') {
    return target.parentElement;
  }

  return null;
}

function normalizeExternalMessageLink(rawHref) {
  const href = String(rawHref || '').trim();
  if (!href) {
    return null;
  }

  try {
    const url = new URL(href);
    if (!MESSAGE_EXTERNAL_PROTOCOLS.has(url.protocol)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function toLocalFileUrl(filePath) {
  const normalized = String(filePath || '').trim();
  if (!normalized || !/^(?:\/|[a-zA-Z]:[\\/])/.test(normalized)) {
    return '';
  }

  if (/^[a-zA-Z]:[\\/]/.test(normalized)) {
    return encodeURI(`file:///${normalized.replace(/\\/g, '/')}`);
  }

  return encodeURI(`file://${normalized}`);
}

function resolveToolResultName(message, index = 0) {
  const directToolName = String(
    message?.toolName
    || message?.tool_name
    || message?.toolExecution?.toolName
    || getToolExecutionEnvelope(message)?.tool
    || ''
  ).trim();
  if (directToolName) {
    return directToolName;
  }

  const toolCallId = String(message?.tool_call_id || message?.messageId || '').trim();
  return toolCallId || `tool-${index + 1}`;
}

function getToolPreviewAnchorHref(item) {
  const source = String(item?.url || item?.artifact?.url || '').trim();
  if (source) {
    return source;
  }

  return String(item?.artifact?.path || '').trim();
}

function getElectronToolMediaSource(item) {
  const source = String(item?.url || item?.artifact?.url || '').trim();
  if (source && canEmbedToolMedia(source)) {
    return source;
  }

  const localFileUrl = toLocalFileUrl(item?.artifact?.path);
  if (localFileUrl) {
    return localFileUrl;
  }

  return source;
}

function appendInlineHtmlPreviewMode(source) {
  const normalized = String(source || '').trim();
  if (!normalized || !/^\/api\/tool-artifact(?:\?|$)/.test(normalized)) {
    return normalized;
  }

  try {
    const url = new URL(normalized, 'http://localhost');
    if (url.searchParams.get('preview') !== 'inline-html') {
      url.searchParams.set('preview', 'inline-html');
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return normalized.includes('?')
      ? `${normalized}&preview=inline-html`
      : `${normalized}?preview=inline-html`;
  }
}

function isPreviewableDocumentMediaType(mediaType) {
  const normalized = String(mediaType || '').trim().toLowerCase();
  return normalized === 'text/html' || normalized === 'application/pdf';
}

function getToolPreviewDocumentSource(item) {
  const source = getElectronToolMediaSource(item);
  if (!source || !canEmbedToolMedia(source)) {
    return '';
  }

  const mediaType = String(item?.media_type || item?.artifact?.media_type || '').trim().toLowerCase();
  if (mediaType === 'text/html') {
    return appendInlineHtmlPreviewMode(source);
  }

  return source;
}

function renderToolDocumentPreview(source, displayName, mediaType, key) {
  const isHtml = String(mediaType || '').trim().toLowerCase() === 'text/html';

  return (
    <div className="flex flex-col gap-2" key={key}>
      <div className="flex flex-col gap-1">
        <div className="break-all text-xs text-foreground">{displayName}</div>
        <div className="text-xs text-muted-foreground">Inline preview</div>
      </div>
      <div className="overflow-hidden rounded border border-border/40 bg-background/50">
        <iframe
          src={source}
          title={displayName}
          className="h-[28rem] w-full bg-white"
          sandbox={isHtml ? 'allow-downloads allow-forms allow-modals allow-same-origin allow-scripts' : undefined}
        />
      </div>
    </div>
  );
}

export function getExternalMessageLinkFromTarget(target) {
  const element = getElementFromEventTarget(target);
  if (!element) {
    return null;
  }

  const anchor = element.closest('a');
  if (!anchor) {
    return null;
  }

  const href = (typeof anchor.href === 'string' ? anchor.href : '')
    || (typeof anchor.getAttribute === 'function' ? anchor.getAttribute('href') : '')
    || (typeof anchor.textContent === 'string' ? anchor.textContent.trim() : '');
  return normalizeExternalMessageLink(href);
}

export function handleMessageExternalLinkClick(event, openExternalLink) {
  if (event?.defaultPrevented) {
    return false;
  }

  const href = getExternalMessageLinkFromTarget(event?.target || null);
  if (!href || typeof openExternalLink !== 'function') {
    return false;
  }

  event.preventDefault?.();
  event.stopPropagation?.();
  void openExternalLink(href);
  return true;
}

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

  const combinedToolResults = Array.isArray(message?.combinedToolResults) ? message.combinedToolResults : [];
  if (combinedToolResults.length > 0) {
    return resolveToolResultName(combinedToolResults[0]);
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

  const envelope = parseToolExecutionEnvelopeContent(text);
  if (envelope) {
    const resultText = stringifyToolEnvelopeResult(envelope.result);
    if (resultText && resultText !== text) {
      return toToolResultRecord(resultText) || envelope;
    }
    return envelope;
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

  if (/^error\b/i.test(text)) return true;
  if (/status\s*[:=]\s*(failed|error)/i.test(text)) return true;
  if (/timed[_\s-]?out\s*[:=]\s*true/i.test(text)) return true;
  if (/cancel(?:ed|led)\s*[:=]\s*true/i.test(text)) return true;
  if (/reason\s*[:=]\s*(non_zero_exit|execution_error|validation_error|approval_denied|timeout|timed_out|canceled|cancelled)/i.test(text)) return true;
  if (/tool not found/i.test(text)) return true;

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
  const statusLabel = getToolStatusTone(message, isToolCallPending);
  const toolName = String(resolvedToolName || extractToolNameFromMessage(message)).trim() || 'unknown';

  return `tool: ${toolName} - ${statusLabel}`;
}

export function getToolStatusTone(message, isToolCallPending = false) {
  const content = String(message?.content || '');
  const hasToolCalls = Array.isArray(message?.tool_calls) && message.tool_calls.length > 0;
  const isToolCallRequest = hasToolCalls || /calling tool\s*:/i.test(content);
  const streamType = String(message?.streamType || '').toLowerCase();
  const combinedResults = Array.isArray(message?.combinedToolResults) ? message.combinedToolResults : [];
  const hasCombinedError = combinedResults.some((result) => {
    const streamIsError = String(result?.streamType || '').toLowerCase() === 'stderr';
    return streamIsError || isFailedToolResultContent(result?.content);
  });
  const hasMessageFailure = String(streamType || '').toLowerCase() === 'stderr' || isFailedToolResultContent(message?.content);
  const statusLabel = message?.isToolStreaming === true || isToolCallPending || (isToolCallRequest && combinedResults.length === 0)
    ? 'running'
    : (hasCombinedError || hasMessageFailure ? 'failed' : 'done');

  return statusLabel;
}

function getToolStatusDotClassName(statusTone) {
  if (statusTone === 'failed') {
    return 'bg-red-400';
  }
  if (statusTone === 'done') {
    return 'bg-emerald-400';
  }
  return 'bg-amber-400 animate-pulse';
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
    return getToolPreviewDisplayText(results[0]) || String(results[0]?.content || '');
  }

  return results
    .map((result, index) => {
      const title = resolveToolResultName(result, index);
      const content = String(getToolPreviewDisplayText(result) || result?.content || '').trim() || '(no output)';
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
  const planningText = String(message?.role === 'assistant' ? message?.content || '' : '').trim();
  const hasMeaningfulPlanningText = planningText.length > 0 && !/^calling tool\s*:/i.test(planningText);
  if (hasMeaningfulPlanningText) {
    return `${planningText}\n\nArgs:\n${requestText}\n\nResult:\n${resultText}`;
  }

  return `Args:\n${requestText}\n\nResult:\n${resultText}`;
}

function getToolDisplayText(message) {
  return String(getToolPreviewDisplayText(message) || message?.content || message?.text || '');
}

function truncateToolOutput(text) {
  const normalized = String(text || '');
  const MAX_LENGTH = 50000;
  if (normalized.length <= MAX_LENGTH) {
    return {
      content: normalized,
      wasTruncated: false,
    };
  }

  return {
    content: normalized.slice(0, MAX_LENGTH),
    wasTruncated: true,
  };
}

function canEmbedToolMedia(source) {
  const normalized = String(source || '').trim();
  return /^https?:\/\//i.test(normalized)
    || /^data:/i.test(normalized)
    || normalized.startsWith('blob:')
    || normalized.startsWith('/');
}

function renderPlainToolOutputText(textContent) {
  return (
    <pre className="text-xs py-2 font-mono whitespace-pre-wrap break-all text-foreground">
      {textContent}
    </pre>
  );
}

function renderToolPreviewItem(item, key) {
  const source = getElectronToolMediaSource(item);
  const displayName = String(item?.artifact?.display_name || item?.title || source || item?.artifact?.path || 'artifact').trim();
  const mediaType = String(item?.media_type || item?.artifact?.media_type || '').trim();
  const documentSource = getToolPreviewDocumentSource(item);

  if ((item?.kind === 'markdown' || item?.renderer === 'markdown') && typeof item?.text === 'string') {
    return (
      <div
        className="prose prose-invert max-w-none break-words text-sm text-foreground"
        key={key}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(item.text) }}
      />
    );
  }

  if ((item?.kind === 'text' || item?.renderer === 'text') && typeof item?.text === 'string') {
    return (
      <div className="rounded-md border border-border/40 bg-background/30 px-2 py-1" key={key}>
        {renderPlainToolOutputText(item.text)}
      </div>
    );
  }

  if ((item?.renderer === 'image' || item?.renderer === 'svg') && source && canEmbedToolMedia(source)) {
    return (
      <div className="flex flex-col gap-2" key={key}>
        <img src={source} alt={displayName} className="max-w-full rounded border border-border/40" />
      </div>
    );
  }

  if (item?.renderer === 'audio' && source && canEmbedToolMedia(source)) {
    return (
      <div className="flex flex-col gap-2" key={key}>
        <audio controls src={source} className="w-full" />
      </div>
    );
  }

  if (item?.renderer === 'video' && source && canEmbedToolMedia(source)) {
    return (
      <div className="flex flex-col gap-2" key={key}>
        <video controls src={source} className="max-w-full rounded border border-border/40" />
      </div>
    );
  }

  if (item?.renderer === 'file' && isPreviewableDocumentMediaType(mediaType) && documentSource) {
    return renderToolDocumentPreview(documentSource, displayName, mediaType, key);
  }

  const href = getToolPreviewAnchorHref(item);
  const externalHref = normalizeExternalMessageLink(href);
  const secondaryText = typeof item?.text === 'string' && item.text.trim()
    ? item.text.trim()
    : String(item?.artifact?.path || '').trim();

  return (
    <div className="flex flex-col gap-1 text-xs text-foreground" key={key}>
      {externalHref
        ? <a href={externalHref} target="_blank" rel="noopener noreferrer" className="underline break-all">{displayName}</a>
        : <span className="break-all">{displayName}</span>}
      {secondaryText && secondaryText !== displayName ? (
        <div className="break-all text-muted-foreground">{secondaryText}</div>
      ) : null}
      {mediaType ? (
        <div className="text-muted-foreground">{mediaType}</div>
      ) : null}
    </div>
  );
}

function renderToolPreview(message) {
  const envelope = getToolExecutionEnvelope(message);
  if (!envelope) {
    return null;
  }

  const items = normalizeToolPreviewItems(envelope.preview);
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => renderToolPreviewItem(item, `tool-preview-${index}`))}
    </div>
  );
}

function renderToolResultBody(message, textContent) {
  return renderToolPreview(message) || renderPlainToolOutputText(textContent);
}

function hasSyntheticToolResultMessages(message) {
  return Array.isArray(message?.syntheticToolResultMessages) && message.syntheticToolResultMessages.length > 0;
}

function isDirectToolResultMessage(message) {
  const role = String(message?.role || '').trim().toLowerCase();
  const type = String(message?.type || '').trim().toLowerCase();
  return role === 'tool'
    || type === 'tool'
    || Boolean(message?.tool_call_id)
    || message?.toolExecution?.preview !== undefined
    || message?.toolExecution?.result !== undefined;
}

function hasMeaningfulPlanningText(message) {
  const planningText = String(message?.role === 'assistant' ? message?.content || '' : '').trim();
  return planningText.length > 0 && !/^calling tool\s*:/i.test(planningText);
}

function renderToolResultRows(resultRows) {
  if (!Array.isArray(resultRows) || resultRows.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">(waiting for output...)</div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {resultRows.map((result, index) => {
        const toolCallId = String(result?.tool_call_id || result?.messageId || '').trim();
        const title = resolveToolResultName(result, index);
        const resultText = getToolDisplayText(result);
        const { content: visibleContent, wasTruncated } = truncateToolOutput(resultText);
        const hideToolResultBody = hasSyntheticToolResultMessages(result);

        return (
          <div className="flex flex-col gap-2" key={toolCallId || `tool-result-${index}`}>
            {resultRows.length > 1 ? (
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</div>
            ) : null}
            <div className="rounded-md border border-border/40 bg-background/30 px-2 py-2">
              {!hideToolResultBody
                ? renderToolResultBody(result, visibleContent || '(no output)')
                : <span className="text-xs text-muted-foreground">Result shown below as assistant content.</span>}
            </div>
            {!hideToolResultBody && wasTruncated ? (
              <div className="border-t border-border/40 pt-2 text-[11px] text-amber-400">
                ⚠️ Output truncated (exceeded 50,000 characters)
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function renderStructuredToolBody(message) {
  const combinedToolResults = Array.isArray(message?.combinedToolResults) ? message.combinedToolResults : [];
  const hideToolResultBody = hasSyntheticToolResultMessages(message);
  const hasCombinedResult = combinedToolResults.length > 0;
  const hasLinkedToolRequest = Array.isArray(message?.linkedToolRequest?.tool_calls)
    && message.linkedToolRequest.tool_calls.length > 0;
  const hasInlineToolInput = Boolean(
    (message?.toolInput && typeof message.toolInput === 'object')
    || String(message?.command || '').trim()
  );
  const shouldRenderRequestAndResult = hasCombinedResult
    || isToolCallRequestMessage(message)
    || hasLinkedToolRequest
    || hasInlineToolInput;

  if (!shouldRenderRequestAndResult) {
    const { content: visibleContent, wasTruncated } = truncateToolOutput(getToolDisplayText(message));
    return (
      <>
        {!hideToolResultBody
          ? renderToolResultBody(message, visibleContent || (message?.isToolStreaming ? '(waiting for output...)' : '(no output)'))
          : <span className="text-xs text-muted-foreground">Result shown below as assistant content.</span>}
        {!hideToolResultBody && wasTruncated ? (
          <div className="border-t border-border/40 pt-2 text-[11px] text-amber-400">
            ⚠️ Output truncated (exceeded 50,000 characters)
          </div>
        ) : null}
      </>
    );
  }

  const requestText = buildToolRequestContent(message);
  const resultRows = hasCombinedResult
    ? combinedToolResults
    : (isDirectToolResultMessage(message) ? [message] : []);

  return (
    <div className="flex flex-col gap-3">
      {hasMeaningfulPlanningText(message) ? (
        <div
          className="prose prose-invert max-w-none break-words text-sm text-foreground"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(String(message?.content || '').trim()) }}
        />
      ) : null}
      <div className="flex flex-col gap-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Args</div>
        <pre className="text-xs py-2 font-mono whitespace-pre-wrap break-all text-foreground">
          {requestText || '(tool request)'}
        </pre>
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Result</div>
        {!hideToolResultBody
          ? renderToolResultRows(resultRows)
          : <div className="text-xs text-muted-foreground">Result shown below as assistant content.</div>}
      </div>
    </div>
  );
}

export function getInitialReasoningCollapsedState(message) {
  const reasoningText = String(message?.reasoningContent || '').trim();
  if (!reasoningText) {
    return false;
  }

  return message?.isStreaming !== true;
}

export function formatReasoningDuration(elapsedMs) {
  const normalizedMs = Number.isFinite(Number(elapsedMs)) ? Math.max(0, Number(elapsedMs)) : 0;
  const totalSeconds = Math.floor(normalizedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function getReasoningElapsedMs(message, nowMs = Date.now()) {
  const storedDurationMs = Number(message?.reasoningDurationMs);
  if (Number.isFinite(storedDurationMs) && storedDurationMs >= 0) {
    return storedDurationMs;
  }

  if (message?.isStreaming !== true) {
    return 0;
  }

  const startedAtMs = new Date(String(message?.createdAt || '')).getTime();
  if (!Number.isFinite(startedAtMs)) {
    return 0;
  }

  return Math.max(0, nowMs - startedAtMs);
}

export function getReasoningHeaderLabel(message, elapsedMs) {
  const reasoningText = String(message?.reasoningContent || '').trim();
  if (!reasoningText) {
    return '';
  }

  if (message?.isStreaming === true) {
    return 'Thinking ...';
  }

  return `Thought for ${formatReasoningDuration(elapsedMs)}`;
}

export function getToolBodyContent(message) {
  if (hasSyntheticToolResultMessages(message)) {
    const requestText = buildToolRequestContent(message);
    if (requestText) {
      return `Args:\n${requestText}\n\nResult:\nResult shown below as assistant content.`;
    }
    return 'Result shown below as assistant content.';
  }

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

  return String(getToolPreviewDisplayText(message) || message?.content || '');
}

export default function MessageContent({
  message,
  collapsed = false,
  reasoningCollapsed = false,
  onToggleReasoningCollapsed,
  isToolCallPending = false,
  showToolHeader = true,
  streamingDotsLabel = 'model',
  streamingInputPreview = '',
}) {
  const isToolMessage = message?.forceAssistantMessage === true ? false : isToolRelatedMessage(message);
  const isAssistantStreaming = message?.isStreaming === true && !isToolMessage;
  const shouldHideStreamingPlaceholder = isAssistantStreaming && isStreamingPlaceholderContent(message?.content);
  const displayContent = shouldHideStreamingPlaceholder ? '' : String(message?.content || '');
  const displayReasoningContent = String(message?.reasoningContent || '').trim();
  const shouldShowStreamingDots = isAssistantStreaming && !displayContent;
  const [reasoningNowMs, setReasoningNowMs] = useState(() => Date.now());
  const reasoningElapsedMs = getReasoningElapsedMs(message, reasoningNowMs);
  const reasoningHeaderLabel = getReasoningHeaderLabel(message, reasoningElapsedMs);

  useEffect(() => {
    if (!displayReasoningContent || message?.isStreaming !== true) {
      return undefined;
    }

    setReasoningNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setReasoningNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [displayReasoningContent, message?.isStreaming]);

  const renderedContent = useMemo(() => {
    if (message.logEvent || isToolMessage) {
      return null;
    }

    const content = displayContent;
    if (!content) return '';

    return renderMarkdown(content);
  }, [displayContent, message.logEvent, isToolMessage]);

  const renderedReasoningContent = useMemo(() => {
    if (message.logEvent || isToolMessage || !displayReasoningContent) {
      return '';
    }

    return renderMarkdown(displayReasoningContent);
  }, [displayReasoningContent, message.logEvent, isToolMessage]);

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
    const toolHeaderLabel = `⚙️ ${getToolStatusLabel(message, isToolCallPending)}`;
    const toolStatusTone = getToolStatusTone(message, isToolCallPending);
    const shouldRenderToolHeader = showToolHeader;

    if (collapsed && !shouldRenderToolHeader) {
      return null;
    }

    return (
      <div className="flex flex-col gap-2">
        {shouldRenderToolHeader ? (
          <div className="flex items-center gap-2 text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
            <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${getToolStatusDotClassName(toolStatusTone)}`} aria-hidden="true" />
            <span className="truncate">{toolHeaderLabel}</span>
          </div>
        ) : null}
        {!collapsed ? (
          <div className="ml-3 border-l border-border/40 pl-3">
            {renderStructuredToolBody(message)}
          </div>
        ) : null}
      </div>
    );
  }

  if (collapsed) return null;

  const inlineErrorText = String(message?.errorMessage || '').trim();
  const shouldShowInlineError = message?.hasError === true && inlineErrorText.length > 0;
  const handleContainerClick = (event) => {
    const desktopApi = readDesktopApi();
    const openExternalLink = desktopApi && typeof desktopApi.openExternalLink === 'function'
      ? desktopApi.openExternalLink.bind(desktopApi)
      : undefined;
    handleMessageExternalLinkClick(event, openExternalLink);
  };

  return (
    <div className="flex flex-col gap-2" onClick={handleContainerClick}>
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
      {displayReasoningContent ? (
        <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2">
          <button
            type="button"
            onClick={onToggleReasoningCollapsed}
            disabled={!onToggleReasoningCollapsed}
            className="flex w-full items-center justify-between gap-2 text-left disabled:cursor-default"
            aria-expanded={!reasoningCollapsed}
            aria-label={reasoningCollapsed ? 'Open reasoning' : 'Collapse reasoning'}
          >
            <div className="text-[11px] text-muted-foreground">{reasoningHeaderLabel}</div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
              {message?.isStreaming === true ? (
                <span className="tabular-nums">{formatReasoningDuration(reasoningElapsedMs)}</span>
              ) : null}
              {reasoningCollapsed ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                  <path d="m18 15-6-6-6 6" />
                </svg>
              )}
            </div>
          </button>
          {!reasoningCollapsed ? (
            <div
              className="prose prose-invert mt-1 max-w-none break-words text-sm text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: renderedReasoningContent }}
            />
          ) : null}
        </div>
      ) : null}
      {shouldShowInlineError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          Error: {inlineErrorText}
        </div>
      ) : null}
    </div>
  );
}
