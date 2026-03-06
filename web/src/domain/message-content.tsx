/**
 * Message Content Domain Renderer - Framework-agnostic display paths for chat messages
 *
 * Purpose:
 * - Provide a single, simple renderer for message body content in web chat
 * - Keep message rendering aligned with desktop app simplicity (log/tool/regular)
 *
 * Key Features:
 * - Merged tool call card with request args + result output in one collapsible card
 * - Streaming tool output renderer with stdout/stderr distinction
 * - Collapsible tool-result output with 50K truncation warning
 * - Safe markdown rendering for regular message text
 *
 * Implementation Notes:
 * - Uses AppRun JSX and `safeHTML` for sanitized markdown content
 * - Emits existing `toggle-tool-output` event to preserve current state flow
 * - Keeps helper logic local to this domain module for focused maintenance
 *
 * Recent Changes:
 * - 2026-03-06: Restore merged completed tool-card custom renderers from attached tool-result rows and allow same-origin artifact preview URLs.
 * - 2026-03-06: Render persisted tool execution envelope previews for adopted tools instead of showing raw envelope JSON in restored tool cards.
 * - 2026-03-06: Parse canonical JSON tool-result payloads in web status detection so failed shell results serialized as JSON do not render as `done`.
 * - 2026-03-06: Treat canonical shell `validation_error` and `approval_denied` tool results as failures in merged web tool cards and completed summaries.
 * - 2026-03-01: Unified tool card headers to single-line summaries (`tool: <name> - <status>`) for web/electron parity.
 * - 2026-03-01: Added renderMergedToolCard for unified tool request+result display with status pill.
 * - 2026-02-21: Switched tool output toggle to an SVG icon button and aligned label typography with regular message text sizing.
 * - 2026-02-21: Updated tool output header layout to show `Tool Output` label with right-aligned Open/Collapse control.
 * - 2026-02-14: Extracted from `world-chat` for cleaner component composition
 */

import { app, safeHTML } from 'apprun';
import type { Message } from '../types';
import { renderMarkdown } from '../utils/markdown';
import { getCustomRenderer, getCustomRendererMatch } from './custom-renderers';
import {
  getToolExecutionEnvelope,
  getToolPreviewDisplayText,
  normalizeToolPreviewItems,
  parseToolExecutionEnvelopeContent,
  stringifyToolEnvelopeResult,
  type ToolPreview,
} from './tool-execution-envelope';

export function isToolResultMessage(message: Message): boolean {
  return message.type === 'tool';
}

function parseToolResultRecord(text: string): Record<string, unknown> | null {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalized);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function parseToolResultBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

function parseToolResultNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isToolResultFailureText(text: string): boolean {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return false;
  }

  const envelope = parseToolExecutionEnvelopeContent(normalized);
  if (envelope) {
    if (String(envelope.status || '').trim().toLowerCase() === 'failed') {
      return true;
    }

    const resultText = stringifyToolEnvelopeResult(envelope.result);
    if (resultText && resultText !== normalized) {
      return isToolResultFailureText(resultText);
    }
  }

  const record = parseToolResultRecord(normalized);
  if (record) {
    const status = String(record.status || '').trim().toLowerCase();
    const reason = String(record.reason || '').trim().toLowerCase();
    const timedOut = parseToolResultBoolean(record.timed_out ?? record.timedOut);
    const canceled = parseToolResultBoolean(record.canceled ?? record.cancelled);
    const exitCode = parseToolResultNumber(record.exit_code ?? record.exitCode);

    if (status === 'failed' || status === 'error') return true;
    if (timedOut === true || canceled === true) return true;
    if (reason === 'non_zero_exit' || reason === 'execution_error' || reason === 'validation_error' || reason === 'approval_denied' || reason === 'timeout' || reason === 'timed_out' || reason === 'canceled' || reason === 'cancelled') {
      return true;
    }
    if (exitCode !== null && exitCode !== 0) return true;
  }

  return /^\[error\]/i.test(normalized)
    || /^error:/i.test(normalized)
    || /status\s*[:=]\s*(failed|error)/i.test(normalized)
    || /exit[_\s-]?code\s*[:=]\s*-?[1-9]\d*/i.test(normalized)
    || /timed[_\s-]?out\s*[:=]\s*true/i.test(normalized)
    || /cancel(?:ed|led)\s*[:=]\s*true/i.test(normalized)
    || /reason\s*[:=]\s*(non_zero_exit|execution_error|validation_error|approval_denied|timeout|timed_out|canceled|cancelled)/i.test(normalized);
}

function resolveToolDisplayName(message: Message): string {
  const explicitToolName = String((message as any)?.toolName || (message as any)?.tool_name || '').trim();
  if (explicitToolName) {
    return explicitToolName;
  }

  const executionToolName = String((message as any)?.toolExecution?.toolName || '').trim();
  if (executionToolName) {
    return executionToolName;
  }

  const toolCalls: any[] = Array.isArray((message as any)?.tool_calls) ? (message as any).tool_calls : [];
  if (toolCalls.length > 0) {
    const primaryName = String(toolCalls[0]?.function?.name || toolCalls[0]?.name || '').trim() || 'unknown';
    if (toolCalls.length === 1) {
      return primaryName;
    }
    return `${primaryName} +${toolCalls.length - 1} more`;
  }

  return 'unknown';
}

function resolveToolSummaryStatus(message: Message): 'running' | 'done' | 'failed' {
  const combinedToolResults: Message[] = Array.isArray((message as any)?.combinedToolResults)
    ? (message as any).combinedToolResults
    : [];

  if (Array.isArray((message as any)?.combinedToolResults)) {
    return getToolMergedStatus(combinedToolResults);
  }

  if (Boolean((message as any)?.isToolStreaming)) {
    return 'running';
  }

  if (String((message as any)?.streamType || '').trim().toLowerCase() === 'stderr') {
    return 'failed';
  }

  const messageText = String((message as any)?.text || (message as any)?.content || '');
  if (Boolean((message as any)?.isError) || isToolResultFailureText(messageText)) {
    return 'failed';
  }

  return 'done';
}

export function getToolOneLineSummary(message: Message): string {
  const name = resolveToolDisplayName(message);
  const status = resolveToolSummaryStatus(message);
  return `tool: ${name} - ${status}`;
}

function getToolDisplayText(message: Message): string {
  return getToolPreviewDisplayText(message)
    ?? String((message as any)?.text || (message as any)?.content || '');
}

function canEmbedWebMedia(source: string): boolean {
  return /^https?:\/\//i.test(source) || /^data:/i.test(source) || source.startsWith('blob:') || source.startsWith('/');
}

function renderToolPreviewItem(item: ToolPreview, key: string) {
  const source = String(item.url || item.artifact?.url || '').trim();
  const displayName = String(item.artifact?.display_name || item.title || source || item.artifact?.path || 'artifact').trim();
  const mediaType = String(item.media_type || item.artifact?.media_type || '').trim();

  if ((item.kind === 'markdown' || item.renderer === 'markdown') && typeof item.text === 'string') {
    return (
      <div className="tool-preview-item tool-preview-markdown" key={key}>
        {safeHTML(renderMarkdown(item.text))}
      </div>
    );
  }

  if ((item.kind === 'text' || item.renderer === 'text') && typeof item.text === 'string') {
    return (
      <div className="tool-preview-item tool-preview-text" key={key}>
        <pre className="tool-output-text">{item.text}</pre>
      </div>
    );
  }

  if ((item.renderer === 'image' || item.renderer === 'svg') && source && canEmbedWebMedia(source)) {
    return (
      <div className="tool-preview-item tool-preview-image" key={key}>
        <img src={source} alt={displayName} className="max-w-full rounded" />
      </div>
    );
  }

  if (item.renderer === 'audio' && source && canEmbedWebMedia(source)) {
    return (
      <div className="tool-preview-item tool-preview-audio" key={key}>
        <audio controls src={source} className="w-full" />
      </div>
    );
  }

  if (item.renderer === 'video' && source && canEmbedWebMedia(source)) {
    return (
      <div className="tool-preview-item tool-preview-video" key={key}>
        <video controls src={source} className="max-w-full rounded" />
      </div>
    );
  }

  const href = source || String(item.artifact?.path || '').trim();
  const secondaryText = typeof item.text === 'string' && item.text.trim()
    ? item.text.trim()
    : String(item.artifact?.path || '').trim();

  return (
    <div className="tool-preview-item tool-preview-artifact" key={key}>
      {href
        ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline break-all">{displayName}</a>
        : <span className="break-all">{displayName}</span>}
      {secondaryText && secondaryText !== displayName && (
        <div className="tool-preview-meta break-all">{secondaryText}</div>
      )}
      {mediaType && (
        <div className="tool-preview-meta">{mediaType}</div>
      )}
    </div>
  );
}

function renderToolPreview(message: Message) {
  const envelope = getToolExecutionEnvelope(message);
  if (!envelope) {
    return null;
  }

  const items = normalizeToolPreviewItems(envelope.preview);
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="tool-preview-list">
      {items.map((item, index) => renderToolPreviewItem(item, `tool-preview-${index}`))}
    </div>
  );
}

function renderToolResultBody(message: Message, textContent: string) {
  const rendererMatch = getCustomRendererMatch(message);
  if (rendererMatch) {
    return rendererMatch.renderer.render(rendererMatch.message);
  }

  return renderToolPreview(message) || <pre className="tool-output-text">{textContent}</pre>;
}

function truncateToolOutput(text: string): { content: string; wasTruncated: boolean } {
  const MAX_LENGTH = 50000;
  if (text.length > MAX_LENGTH) {
    return {
      content: text.substring(0, MAX_LENGTH),
      wasTruncated: true
    };
  }
  return {
    content: text,
    wasTruncated: false
  };
}

function isStderrOutput(message: Message): boolean {
  return message.streamType === 'stderr';
}

function getToolMergedStatus(combinedToolResults: Message[]): 'running' | 'done' | 'failed' {
  if (!combinedToolResults || combinedToolResults.length === 0) return 'running';
  const hasFailure = combinedToolResults.some(r => {
    const text = String((r as any)?.text || (r as any)?.content || '');
    return isToolResultFailureText(text) || Boolean((r as any)?.isError);
  });
  return hasFailure ? 'failed' : 'done';
}

function renderMergedToolCard(message: Message) {
  const combinedToolResults: Message[] = (message as any).combinedToolResults || [];
  const toolCalls: any[] = Array.isArray((message as any).tool_calls) ? (message as any).tool_calls : [];
  const status = getToolMergedStatus(combinedToolResults);
  const isExpanded = (message as any).isToolOutputExpanded || false;
  const summaryLine = getToolOneLineSummary(message);

  const statusClass = status === 'done' ? 'tool-status-done'
    : status === 'failed' ? 'tool-status-failed'
      : 'tool-status-running';
  const toggleTitle = isExpanded ? 'Collapse' : 'Expand';

  return (
    <div className="merged-tool-card">
      <div className="tool-output-header">
        <span className={`tool-summary-line ${statusClass}`}>{summaryLine}</span>
        <button
          className="tool-output-toggle"
          $onclick={['toggle-tool-output', message.id]}
          title={toggleTitle}
          aria-label={toggleTitle}
          aria-expanded={isExpanded}
        >
          <svg
            className="tool-toggle-icon"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {isExpanded
              ? <path d="M5 8l5 5 5-5" />
              : <path d="M8 5l5 5-5 5" />}
          </svg>
        </button>
      </div>
      {isExpanded && (
        <div className="merged-tool-body">
          {toolCalls.map((tc: any, i: number) => {
            const callId = String(tc?.id || '');
            const args = String(tc?.function?.arguments || tc?.arguments || '');
            const result = combinedToolResults.find(r => String((r as any).tool_call_id || '') === callId)
              || (combinedToolResults.length === 1 && i === 0 ? combinedToolResults[0] : null);
            const resultText = result ? getToolDisplayText(result as Message) : null;
            const { content: truncatedResult, wasTruncated } = resultText !== null
              ? truncateToolOutput(resultText)
              : { content: null, wasTruncated: false };

            return (
              <div className="tool-result-block">
                {toolCalls.length > 1 && (
                  <div className="tool-call-name">{String(tc?.function?.name || tc?.name || 'tool')}</div>
                )}
                {args && (
                  <div className="tool-args">
                    <pre className="tool-output-text">{args}</pre>
                  </div>
                )}
                {truncatedResult !== null && (
                  <div className="tool-output-content tool-output-stdout">
                    {renderToolResultBody(result as Message, truncatedResult)}
                    {wasTruncated && (
                      <div className="tool-output-truncated">
                        ⚠️ Output truncated (exceeded 50,000 characters)
                      </div>
                    )}
                  </div>
                )}
                {result == null && (
                  <div className="tool-output-content">
                    <span className="tool-waiting">waiting for result...</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function renderMessageContent(message: Message) {
  // Merged tool call card: tool request + results combined into one card
  if (Array.isArray((message as any).combinedToolResults)) {
    return renderMergedToolCard(message);
  }

  // Check for custom renderers first (e.g., sheet music, charts)
  const customRenderer = getCustomRenderer(message);
  if (customRenderer) {
    return customRenderer.render(message);
  }

  if (message.isToolStreaming) {
    return (
      <div className="tool-stream-output">
        <div className="tool-stream-header">
          ⚙️ Executing...
        </div>
        <div className={`tool-stream-content ${message.streamType === 'stderr' ? 'stderr' : 'stdout'}`}>
          <pre className="tool-output-text">{message.text || '(waiting for output...)'}</pre>
        </div>
      </div>
    );
  }

  if (isToolResultMessage(message)) {
    const { content, wasTruncated } = truncateToolOutput(getToolDisplayText(message));
    const isExpanded = message.isToolOutputExpanded || false;
    const outputClass = isStderrOutput(message) ? 'tool-output-stderr' : 'tool-output-stdout';
    const status = resolveToolSummaryStatus(message);
    const statusClass = status === 'failed' ? 'tool-status-failed'
      : status === 'running' ? 'tool-status-running'
        : 'tool-status-done';
    const toggleTitle = isExpanded ? 'Collapse output' : 'Open output';

    return (
      <div className="tool-output-container">
        <div className="tool-output-header">
          <span className={`tool-summary-line ${statusClass}`}>
            {getToolOneLineSummary(message)}
          </span>
          <button
            className="tool-output-toggle"
            $onclick={['toggle-tool-output', message.id]}
            title={toggleTitle}
            aria-label={toggleTitle}
            aria-expanded={isExpanded}
          >
            <svg
              className="tool-toggle-icon"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {isExpanded
                ? <path d="M5 8l5 5 5-5" />
                : <path d="M8 5l5 5-5 5" />}
            </svg>
          </button>
        </div>
        {isExpanded && (
          <div className={`tool-output-content ${outputClass}`}>
            {renderToolResultBody(message, content)}
            {wasTruncated && (
              <div className="tool-output-truncated">
                ⚠️ Output truncated (exceeded 50,000 characters)
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="message-content">
      {safeHTML(renderMarkdown(message.text || ''))}
    </div>
  );
}
