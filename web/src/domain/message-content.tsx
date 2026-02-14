/**
 * Message Content Domain Renderer - Framework-agnostic display paths for chat messages
 *
 * Purpose:
 * - Provide a single, simple renderer for message body content in web chat
 * - Keep message rendering aligned with desktop app simplicity (log/tool/regular)
 *
 * Key Features:
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
 * - 2026-02-14: Extracted from `world-chat` for cleaner component composition
 */

import { app, safeHTML } from 'apprun';
import type { Message } from '../types';
import { renderMarkdown } from '../utils/markdown';

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

export function renderMessageContent(message: Message) {
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

    return (
      <div className="tool-output-container">
        <div className="tool-output-header">
          <button
            className="tool-output-toggle"
            $onclick={['toggle-tool-output', message.id]}
            title={isExpanded ? 'Collapse output' : 'Expand output'}
          >
            <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
            <span className="tool-label">⚙️ Tool output</span>
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
