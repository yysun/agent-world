const { html, run } = window.apprun;

export default (message) => {
  return html`
  <div class="conversation-message ${message.type} ${message.isStreaming ? 'streaming' : ''}">
    <div class="message-sender">
      ${message.sender}
      ${message.isStreaming ? html`<span class="streaming-indicator">●</span>` : ''}
    </div>
    <div class="message-text">${message.text}${message.isStreaming ? html`<span class="cursor">|</span>` : ''}</div>
  </div>
`;
};