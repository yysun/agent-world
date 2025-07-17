/**
 * World Component - Displays world interface with agents and chat
 * Features: Two-row layout with agent list and chat interface, back navigation, message badges
 * Implementation: AppRun component with state management, sprite sheet for agents, message counting
 * Changes: Added back button navigation and message count badges for agents
 */

import { app, Component } from 'apprun';

export default class WorldComponent extends Component {
  state = {
    worldName: 'World',
    agents: [
      { id: 1, name: 'Agent Alpha', spriteIndex: 0, messageCount: 1 },
      { id: 2, name: 'Agent Beta', spriteIndex: 1, messageCount: 10 },
      { id: 3, name: 'Agent Gamma', spriteIndex: 2, messageCount: 20 },
      { id: 4, name: 'Agent Delta', spriteIndex: 3, messageCount: 2 },
      { id: 5, name: 'Agent Echo', spriteIndex: 4, messageCount: 0 },
      { id: 6, name: 'Agent Fox', spriteIndex: 5, messageCount: 0 },
      { id: 7, name: 'Agent Golf', spriteIndex: 6, messageCount: 0 },
      { id: 8, name: 'Agent Hotel', spriteIndex: 7, messageCount: 30 },
      { id: 9, name: 'Agent India', spriteIndex: 8, messageCount: 10 },
    ],
    messages: [
      { id: 1, sender: 'Agent Alpha', content: 'Hello! Welcome to the world.', timestamp: new Date() },
      { id: 2, sender: 'User', content: 'Hi there!', timestamp: new Date() }
    ],
    userInput: ''
  };

  view = state => (
    <div className="world-container">
      <div className="world-header">
        <div className="world-nav-buttons">
          <a href="/">
            <button className="back-button" title="Back to Worlds">
              <span className="world-back-icon">←</span>
            </button>
          </a>
        </div>
        <h1 className="world-title">{state.worldName}</h1>
        <div className="world-nav-buttons">
          <button className="world-settings-btn" title="World Settings">
            <span className="world-gear-icon">⚙</span>
          </button>
        </div>
      </div>

      <div className="world-layout">
        {/* Top Row - Agents */}
        <div className="agents-row">
          <div className="agents-list">
            {state.agents.map(agent => {
              return (
                <div key={`agent-${agent.id}`} className="agent-item">
                  <div className="agent-sprite-container">
                    <div className={`agent-sprite sprite-${agent.spriteIndex}`}></div>
                    {agent.messageCount > 0 && (
                      <div className="message-badge">{agent.messageCount}</div>
                    )}
                  </div>
                  <div className="agent-name">{agent.name}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Row - Chat Interface */}
        <div className="chat-row">
          {/* chat interface */}
          <fieldset>
            <legend>Chat</legend>
            <div className="chat-container">
              {/* Conversation Area */}
              <div className="conversation-area">
                {state.messages.map(message => (
                  <div key={message.id} className={`message ${message.sender === 'User' ? 'user-message' : 'agent-message'}`}>
                    <div className="message-sender">{message.sender}</div>
                    <div className="message-content">{message.content}</div>
                    <div className="message-timestamp">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>

              {/* User Input Area */}
              <div className="input-area">
                <div className="input-container">
                  <input
                    type="text"
                    className="message-input"
                    placeholder="Type your message..."
                    value={state.userInput}
                    onInput={e => app.run('updateInput', e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && app.run('sendMessage')}
                  />
                  <button
                    className="send-button"
                    onClick={() => app.run('sendMessage')}
                    disabled={!state.userInput.trim()}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </fieldset>

          {/* chat settings */}
          <fieldset>
            <legend>Chat Settings</legend>
            <div className="chat-settings">
              <label>
                <input
                  type="checkbox"

                />
                Enable Notifications
              </label>
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );

  update = {
    '/World': (state, name) => {
      const worldName = name ? decodeURIComponent(name) : 'New World';
      return {
        ...state,
        worldName
      };
    },
    'updateInput': (state, value) => ({
      ...state,
      userInput: value
    }),
    'sendMessage': (state) => {
      if (!state.userInput.trim()) return state;

      const newMessage = {
        id: state.messages.length + 1,
        sender: 'User',
        content: state.userInput,
        timestamp: new Date()
      };

      return {
        ...state,
        messages: [...state.messages, newMessage],
        userInput: ''
      };
    }
  };
}

