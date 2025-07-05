/**
 * Message Component - Display individual conversation messages
 *
 * Features: Displays different message types (user, agent, system, error),
 * streaming indicator for real-time messages, error indicator and details
 * for error messages, visual styling with colored left borders
 *
 * Implementation: Function-based component with conditional rendering
 * for streaming and error states, red left border for error messages
 *
 * Changes:
 * - Added error message support with red left border styling
 * - Added error indicator (⚠) for error messages
 * - Added error details display for additional error information
 * - Enhanced message type styling with error state handling
 */

const { html, run } = window.apprun;

export default (message) => {
  if (message.streamComplete) return '';
  const showStreaming = message.isStreaming && !message.streamComplete;
  return html`
  <div class="conversation-message ${message.type} ${showStreaming ? 'streaming' : ''} ${message.hasError ? 'error' : ''}">
    <div class="message-sender">
      ${message.sender}
      ${showStreaming ? html`<span class="streaming-indicator">●</span>` : ''}
      ${message.hasError ? html`<span class="error-indicator">⚠</span>` : ''}
    </div>
    <div class="message-text">${message.text}${showStreaming ? html`<span class="cursor">|</span>` : ''}</div>
    ${message.hasError && message.errorMessage && message.errorMessage !== message.text ? html`<div class="error-details">${message.errorMessage}</div>` : ''}
  </div>
`;
};