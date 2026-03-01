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
 * - 2026-03-01: Added renderMergedToolCard for unified tool request+result display with status pill.
 * - 2026-02-21: Switched tool output toggle to an SVG icon button and aligned label typography with regular message text sizing.
 * - 2026-02-21: Updated tool output header layout to show `Tool Output` label with right-aligned Open/Collapse control.
 * - 2026-02-14: Extracted from `world-chat` for cleaner component composition
 */

import { app, safeHTML } from 'apprun';
import type { Message } from '../types';
import { renderMarkdown } from '../utils/markdown';
import { getCustomRenderer } from './custom-renderers';

export function isToolResultMessage(message: Message): boolean {
  return message.type === 'tool';
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
    return /^\[error\]/i.test(text) || /^error:/i.test(text) || Boolean((r as any)?.isError);
  });
  return hasFailure ? 'failed' : 'done';
}

function renderMergedToolCard(message: Message) {
  const combinedToolResults: Message[] = (message as any).combinedToolResults || [];
  const toolCalls: any[] = Array.isArray((message as any).tool_calls) ? (message as any).tool_calls : [];
  const toolNames = toolCalls.map((tc: any) => String(tc?.function?.name || tc?.name || 'tool')).filter(Boolean);
  const displayName = toolNames.length > 0 ? toolNames.join(', ') : 'Tool';
  const status = getToolMergedStatus(combinedToolResults);
  const isExpanded = (message as any).isToolOutputExpanded || false;

  const statusClass = status === 'done' ? 'tool-status-done'
    : status === 'failed' ? 'tool-status-failed'
    : 'tool-status-running';
  const statusLabel = status === 'done' ? '✓ done'
    : status === 'failed' ? '✗ failed'
    : '● running';
  const toggleTitle = isExpanded ? 'Collapse' : 'Expand';

  return (
    <div className="merged-tool-card">
      <div className="tool-output-header">
        <span className="tool-label">{displayName}</span>
        <span className={`tool-status ${statusClass}`}>{statusLabel}</span>
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
            const resultText = result ? String((result as any).text || (result as any).content || '') : null;
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
                    <pre className="tool-output-text">{truncatedResult}</pre>
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
  // Check for custom renderers first (e.g., sheet music, charts)
  const customRenderer = getCustomRenderer(message);
  if (customRenderer) {
    return customRenderer.render(message);
  }

  // Merged tool call card: tool request + results combined into one card
  if (Array.isArray((message as any).combinedToolResults)) {
    return renderMergedToolCard(message);
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
    const { content, wasTruncated } = truncateToolOutput(message.text);
    const isExpanded = message.isToolOutputExpanded || false;
    const outputClass = isStderrOutput(message) ? 'tool-output-stderr' : 'tool-output-stdout';
    const toggleTitle = isExpanded ? 'Collapse output' : 'Open output';

    return (
      <div className="tool-output-container">
        <div className="tool-output-header">
          <span className="tool-label">Tool Output</span>
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
            <pre className="tool-output-text">{content}</pre>
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
