/**
 * Message Component - BEM-based conversation message display
 * 
 * BEM Structure: .message with elements (__sender, __content, __indicators, __details)
 * and modifiers (--user, --agent, --system, --error, --streaming)
 * Memory messages use base types: memory-user → user, memory-assistant → agent
 */

const { html, run } = window.apprun;

const getMessageType = (message) => {
  if (message.role === 'user' || message.type === 'user' || message.type === 'human') return 'user';
  if (message.role === 'assistant' || message.type === 'agent') return 'agent';
  if (message.type === 'system') return 'system';
  if (message.type === 'error' || message.hasError) return 'error';
  return 'agent';
};

const buildClasses = (message, showStreaming) => {
  const classes = ['message', `message--${getMessageType(message)}`];
  if (showStreaming) classes.push('message--streaming');
  if (message.hasError) classes.push('message--error');
  return classes.join(' ');
};

export default (message) => {
  if (message.streamComplete) return '';

  const showStreaming = message.isStreaming && !message.streamComplete;
  const hasErrorDetails = message.hasError && message.errorMessage && message.errorMessage !== message.text;

  return html`
    <div class="${buildClasses(message, showStreaming)}">
      <div class="message__sender">
        ${message.sender}
        <div class="message__indicators">
          ${showStreaming ? html`<span class="message__streaming-indicator">●</span>` : ''}
          ${message.hasError ? html`<span class="message__error-indicator">⚠</span>` : ''}
        </div>
      </div>
      <div class="message__content">${message.text}${showStreaming ? html`<span class="message__cursor">|</span>` : ''}
      </div>
      ${hasErrorDetails ? html`<div class="message__details">${message.errorMessage}</div>` : ''}
    </div>
  `;
};