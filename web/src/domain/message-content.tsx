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
 * - 2026-03-12: Merged attached live tool-stream output into the request card body so running shell output does not
 *   render as a second standalone tool box.
 * - 2026-03-12: Reused one bounded scroll viewport for live and completed plain-text tool output and surfaced
 *   live tool-input metadata in the expanded running tool body.
 * - 2026-03-11: Parsed tool names from inline `Calling tool:` request text and added an expanded-body fallback for
 *   live request rows that have not yet received structured `tool_calls` metadata.
 * - 2026-03-11: Doubled markdown tool-preview viewport height to 10 lines and exposed the max-line setting through
 *   a small helper so compact preview sizing stays testable.
 * - 2026-03-11: Removed visible tool toggle text so compact tool rows use chevron-only controls while keeping
 *   accessible labels and correct expand/collapse icon state.
 * - 2026-03-11: Added shared tool-row classification plus compact header rendering with explicit Open/Collapse text
 *   and a flashing active-status dot so web tool rows no longer depend on assistant message chrome.
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

export type ToolSummaryStatus = 'running' | 'done' | 'failed';

export function isToolRenderableMessage(message: Message): boolean {
  const anyMessage = message as any;
  if (Array.isArray(anyMessage?.combinedToolResults)) {
    return true;
  }
  if (Array.isArray(anyMessage?.combinedToolStreams)) {
    return true;
  }
  if (Boolean(anyMessage?.isToolStreaming)) {
    return true;
  }
  if (isToolResultMessage(message)) {
    return true;
  }
  if (Array.isArray(anyMessage?.tool_calls) && anyMessage.tool_calls.length > 0) {
    return true;
  }

  const role = String(anyMessage?.role || '').trim().toLowerCase();
  if (role === 'tool') {
    return true;
  }

  const content = String(anyMessage?.content || anyMessage?.text || '').trim();
  return /^calling tool(?::|\s)/i.test(content);
}

function getToolRequestText(message: Message): string {
  return String((message as any)?.content || (message as any)?.text || '').trim();
}

function parseToolNameFromRequestText(text: string): string {
  const match = String(text || '').match(/calling tool\s*:\s*([a-z0-9_.:-]+)/i);
  return String(match?.[1] || '').trim();
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

  const inlineToolName = parseToolNameFromRequestText(getToolRequestText(message));
  if (inlineToolName) {
    return inlineToolName;
  }

  return 'unknown';
}

function resolveToolSummaryStatus(message: Message): ToolSummaryStatus {
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

export function getToolSummaryStatus(message: Message): ToolSummaryStatus {
  return resolveToolSummaryStatus(message);
}

export function getToolOneLineSummary(message: Message): string {
  const name = resolveToolDisplayName(message);
  const status = getToolSummaryStatus(message);
  return `tool: ${name} - ${status}`;
}

export function getToolToggleLabel(isExpanded: boolean): 'Open' | 'Collapse' {
  return isExpanded ? 'Collapse' : 'Open';
}

export function getToolPreviewMaxLines(): number {
  return 10;
}

function getToolTextViewportMaxLines(): number {
  return 10;
}

function getToolDisplayText(message: Message): string {
  return getToolPreviewDisplayText(message)
    ?? String((message as any)?.text || (message as any)?.content || '');
}

function stringifyToolInput(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function renderPlainToolOutputText(textContent: string) {
  return (
    <pre
      className="tool-output-text tool-output-body-text"
      style={{ '--tool-output-max-lines': String(getToolTextViewportMaxLines()) } as any}
    >
      {textContent}
    </pre>
  );
}

function getLiveToolArgsText(message: Message): string {
  const toolInput = stringifyToolInput((message as any)?.toolInput);
  if (toolInput) {
    return toolInput;
  }

  const command = String((message as any)?.command || '').trim();
  if (command) {
    return stringifyToolInput({ command });
  }

  return '';
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
      <div
        className="tool-preview-item tool-preview-markdown"
        key={key}
        style={{ '--tool-preview-max-lines': String(getToolPreviewMaxLines()) } as any}
      >
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

  return renderToolPreview(message) || renderPlainToolOutputText(textContent);
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

function findCombinedToolStream(message: Message, callId: string, fallbackIndex: number): Message | null {
  const combinedToolStreams: Message[] = Array.isArray((message as any)?.combinedToolStreams)
    ? (message as any).combinedToolStreams
    : [];

  if (!callId) {
    return combinedToolStreams.length === 1 && fallbackIndex === 0
      ? combinedToolStreams[0]
      : null;
  }

  return combinedToolStreams.find((streamRow) => String((streamRow as any)?.toolCallId || '').trim() === callId)
    || (combinedToolStreams.length === 1 && fallbackIndex === 0 ? combinedToolStreams[0] : null);
}

function renderToolSummaryHeader(message: Message, isExpanded: boolean) {
  const status = getToolSummaryStatus(message);
  const statusClass = status === 'done' ? 'tool-status-done'
    : status === 'failed' ? 'tool-status-failed'
      : 'tool-status-running';
  const toggleLabel = getToolToggleLabel(isExpanded);

  return (
    <div className="tool-output-header">
      <div className="tool-summary-group">
        <span
          className={`tool-status-dot ${statusClass} ${status === 'running' ? 'tool-status-dot-pulse' : ''}`.trim()}
          aria-hidden="true"
        ></span>
        <span className={`tool-summary-line ${statusClass}`}>{getToolOneLineSummary(message)}</span>
      </div>
      <button
        className="tool-output-toggle"
        $onclick={['toggle-tool-output', message.id]}
        title={toggleLabel}
        aria-label={toggleLabel}
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
  );
}

function renderMergedToolCard(message: Message) {
  const combinedToolResults: Message[] = (message as any).combinedToolResults || [];
  const combinedToolStreams: Message[] = (message as any).combinedToolStreams || [];
  const toolCalls: any[] = Array.isArray((message as any).tool_calls) ? (message as any).tool_calls : [];
  const requestText = getToolRequestText(message);
  const isExpanded = (message as any).isToolOutputExpanded || false;
  const fallbackToolCalls = toolCalls.length > 0
    ? toolCalls
    : [{
      id: `${String((message as any)?.messageId || message.id || 'tool-request')}-inline`,
      function: {
        name: resolveToolDisplayName(message),
        arguments: requestText,
      },
    }];

  return (
    <div className="merged-tool-card tool-surface">
      {renderToolSummaryHeader(message, isExpanded)}
      {isExpanded && (
        <div className="merged-tool-body">
          {fallbackToolCalls.map((tc: any, i: number) => {
            const callId = String(tc?.id || '');
            const args = String(tc?.function?.arguments || tc?.arguments || '');
            const result = combinedToolResults.find(r => String((r as any).tool_call_id || '') === callId)
              || (combinedToolResults.length === 1 && i === 0 ? combinedToolResults[0] : null);
            const liveStream = findCombinedToolStream(message, callId, i);
            const resultText = result ? getToolDisplayText(result as Message) : null;
            const liveStreamText = liveStream ? String((liveStream as any)?.text || (liveStream as any)?.content || '') : null;
            const { content: truncatedResult, wasTruncated } = resultText !== null
              ? truncateToolOutput(resultText)
              : { content: null, wasTruncated: false };
            const { content: truncatedLiveOutput, wasTruncated: liveOutputWasTruncated } = liveStreamText !== null
              ? truncateToolOutput(liveStreamText)
              : { content: null, wasTruncated: false };
            const liveStreamOutputClass = liveStream && (liveStream as any)?.streamType === 'stderr'
              ? 'tool-output-stderr'
              : 'tool-output-stdout';

            return (
              <div className="tool-result-block" key={callId || `tool-call-${i}`}>
                {fallbackToolCalls.length > 1 && (
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
                {truncatedResult === null && truncatedLiveOutput !== null && (
                  <div className={`tool-output-content ${liveStreamOutputClass}`}>
                    {renderPlainToolOutputText(truncatedLiveOutput)}
                    {liveOutputWasTruncated && (
                      <div className="tool-output-truncated">
                        ⚠️ Output truncated (exceeded 50,000 characters)
                      </div>
                    )}
                  </div>
                )}
                {result == null && truncatedLiveOutput === null && (
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
    const isExpanded = message.isToolOutputExpanded || false;
    const argsText = getLiveToolArgsText(message);

    return (
      <div className="tool-output-container tool-surface tool-output-live">
        {renderToolSummaryHeader(message, isExpanded)}
        {isExpanded && (
          <div className={`tool-output-content ${message.streamType === 'stderr' ? 'tool-output-stderr' : 'tool-output-stdout'}`}>
            {argsText && (
              <div className="tool-args">
                <pre className="tool-output-text">{argsText}</pre>
              </div>
            )}
            {renderPlainToolOutputText(message.text || '(waiting for output...)')}
          </div>
        )}
      </div>
    );
  }

  if (isToolResultMessage(message)) {
    const { content, wasTruncated } = truncateToolOutput(getToolDisplayText(message));
    const isExpanded = message.isToolOutputExpanded || false;
    const outputClass = isStderrOutput(message) ? 'tool-output-stderr' : 'tool-output-stdout';

    return (
      <div className="tool-output-container tool-surface">
        {renderToolSummaryHeader(message, isExpanded)}
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
