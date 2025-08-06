/**
 * World Settings Component - Dynamic settings panel for world/agent configuration
 * 
 * Features:
 * - Dynamic display based on selection (world vs agent settings)
 * - World settings: name, agent count, message count, LLM configuration
 * - Agent settings: LLM provider, model, temperature, system prompt, message counts
 * - Clear messages functionality with proper event handling
 * - AppRun JSX with fieldset layout and two-line value display
 */

import { app } from 'apprun';
import type { WorldSettingsProps } from '../types';

export default function WorldSettings(props: WorldSettingsProps) {
  const {
    world,
    selectedSettingsTarget,
    selectedAgent,
    totalMessages
  } = props;

  const handleClearMessages = () => {
    if (selectedSettingsTarget === 'agent' && selectedAgent) {
      if (confirm(`Clear all messages for agent ${selectedAgent.name}?`)) {
        app.run('clear-agent-messages', selectedAgent);
      }
    } else if (selectedSettingsTarget === 'world' && world) {
      if (confirm(`Clear all messages for world ${world.name}?`)) {
        app.run('clear-world-messages');
      }
    }
  };


  return (
    <fieldset className="settings-fieldset">
      <legend>
        {selectedSettingsTarget === 'agent' && selectedAgent
          ? `${selectedAgent.name} Settings`
          : selectedSettingsTarget === 'world' && world
            ? `${world.name} Settings`
            : 'Settings'}
      </legend>
      <div className="chat-settings">
        {selectedSettingsTarget === 'agent' && selectedAgent ? (
          <div className="agent-settings">
            <div className="setting-item">
              <label>Agent Name:</label>
              <span>
                <span className="setting-value">{selectedAgent.name}</span>
                <button
                  className="action-btn"
                  $onclick={['open-agent-edit', selectedAgent]}
                  title="Edit agent"
                >
                  <span className="btn-icon">⚙</span>
                </button>
                <button
                  className="action-btn"
                  $onclick={['open-agent-delete', selectedAgent]}
                  title="Delete agent"
                >
                  <span className="btn-icon">×</span>
                </button>
              </span>
            </div>
            <div className="setting-item">
              <label>Message Count:</label>
              <span>
                <span className="setting-value">{selectedAgent.messageCount}</span>
                <button
                  className="action-btn"
                  onclick={handleClearMessages}
                  title="Clear agent messages"
                >
                  <span className="btn-icon">-</span>
                </button>
              </span>
            </div>
            <div className="setting-item">
              <label>LLM Provider:</label>
              <span className="setting-value">{selectedAgent.provider || 'N/A'}</span>
            </div>
            <div className="setting-item">
              <label>Model:</label>
              <span className="setting-value">{selectedAgent.model || 'N/A'}</span>
            </div>
            <div className="setting-item">
              <label>Temperature:</label>
              <span className="setting-value">{selectedAgent.temperature !== undefined ? selectedAgent.temperature : 'N/A'}</span>
            </div>
            <div className="setting-item">
              <label>System Prompt:</label>
              <span className="system-prompt-preview">
                {selectedAgent.systemPrompt ?
                  (selectedAgent.systemPrompt.length > 100 ?
                    selectedAgent.systemPrompt.substring(0, 100) + '...' :
                    selectedAgent.systemPrompt
                  ) : 'N/A'
                }
              </span>
            </div>
          </div>
        ) : selectedSettingsTarget === 'world' && world ? (
          <div className="world-settings">
            <div className="setting-item">
              <label>World Name:</label>
              <span>
                <span className="setting-value">{world.name}</span>
                <button
                  className="action-btn"
                  $onclick="open-world-edit"
                  title="Edit world"
                >
                  <span className="btn-icon">⚙</span>
                </button>
              </span>
            </div>
            <div className="setting-item">
              <label>Agents Count:</label>
              <span>
                <span className="setting-value">{world.agents.length}</span>
                <button
                  className="action-btn"
                  $onclick="open-agent-create"
                  title="Add new agent"
                >
                  <span className="btn-icon">+</span>
                </button>
              </span>
            </div>
            <div className="setting-item">
              <label>Total Messages:</label>
              <span>
                <span className="setting-value">{totalMessages}</span>
                <button
                  className="action-btn"
                  $onclick={handleClearMessages}
                  title="Clear all messages"
                >
                  <span className="btn-icon">-</span>
                </button>
              </span>
            </div>
            <div className="setting-item">
              <label>LLM Call Limit:</label>
              <span className="setting-value">{world.turnLimit || 'Unlimited'}</span>
            </div>
          </div>
        ) : (
          <div className="default-settings">
            <p>Click on an agent or the gear icon to view settings</p>
          </div>
        )}
      </div>
    </fieldset>
  );
}
