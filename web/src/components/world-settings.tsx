/**
 * World Settings Component - Settings panel for world configuration
 * 
 * Features:
 * - Dynamic settings display based on selection (world vs agent)
 * - World settings: name, agent count, message count, LLM call limit
 * - Agent settings: name, message count, LLM provider, model, temperature, system prompt
 * - Clear messages button for message count
 * - World settings displayed as default state
 * - Improved layout with left-aligned values and right-aligned buttons
 * - Clear buttons sized to match gear button (32x32px)
 * - Two-line layout: field titles on top, values below
 * - Clean design without field dividers
 * 
 * Implementation:
 * - Functional component using AppRun JSX
 * - Props-based state management from parent World component
 * - AppRun $ directive pattern for event handling
 * - Fieldset layout matching chat component
 * - Conditional rendering based on selectedSettingsTarget
 * - Clear messages functionality with confirmation
 * - Accepts World and Agent objects directly in props for cleaner interface
 * - Responsive layout with proper spacing and alignment
 * - Clear message icons wrapped in spans for better styling control
 * 
 * Changes:
 * - Enhanced to support agent and world settings
 * - Added selectedAgent and selectedSettingsTarget props
 * - Implemented dynamic legend and content
 * - Removed notification checkbox as per requirements
 * - World settings now shown by default instead of prompt message
 * - Removed memorySize from agent settings for simplification
 * - Consolidated to use messageCount only for tracking agent activity
 * - Added LLM call limit to world settings
 * - Added LLM provider, model, temperature, and system prompt to agent settings
 * - Added clear messages button with proper event handling
 * - Updated props to accept World and Agent objects instead of individual properties
 * - Simplified props interface for better maintainability and type safety
 * - Fixed layout: left-aligned values, right-aligned buttons, consistent button sizing
 * - Switched to two-line layout for better readability
 * - Increased setting-value font size to 1.1rem
 * - Wrapped trash icons in .clear-message-icon spans
 * - Removed field dividers for cleaner appearance
 */

import { app } from 'apprun';

interface World {
  id?: string;
  name: string;
  description?: string;
  agents: Agent[];
  llmCallLimit?: number;
  [key: string]: any;
}

interface Agent {
  id?: string;
  name: string;
  description?: string;
  messageCount: number;
  provider?: string;
  model?: string;
  temperature?: number;
  systemPrompt?: string;
  [key: string]: any;
}

interface WorldSettingsProps {
  world: World | null;
  selectedSettingsTarget: 'world' | 'agent' | null;
  selectedAgent: Agent | null;
  totalMessages: number;
}

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
              <span className="setting-value">{selectedAgent.name}</span>
            </div>
            <div className="setting-item">
              <label>Message Count:</label>
              <span>
                <span className="setting-value">{selectedAgent.messageCount}</span>
                <button
                  className="clear-messages-btn"
                  $onclick={handleClearMessages}
                  title="Clear agent messages"
                >
                  <span className="clear-message-icon">🗑️</span>
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
              <span className="setting-value">{world.name}</span>
            </div>
            <div className="setting-item">
              <label>Agents Count:</label>
              <span className="setting-value">{world.agents.length}</span>
            </div>
            <div className="setting-item">
              <label>Total Messages:</label>
              <span>
                <span className="setting-value">{totalMessages}</span>
                <button
                  className="clear-messages-btn"
                  $onclick={handleClearMessages}
                  title="Clear all messages"
                >
                  <span className="clear-message-icon">🗑️</span>
                </button>
              </span>
            </div>
            <div className="setting-item">
              <label>LLM Call Limit:</label>
              <span className="setting-value">{world.llmCallLimit || 'Unlimited'}</span>
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
