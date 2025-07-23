/**
 * World Settings Component - Settings panel for world configuration
 * 
 * Features:
 * - Dynamic settings display based on selection (world vs agent)
 * - World settings: name, agent count, message count (shown by default)
 * - Agent settings: name, message count, memory size
 * - World settings displayed as default state
 * 
 * Implementation:
 * - Functional component using AppRun JSX
 * - Props-based state management from parent World component
 * - AppRun $ directive pattern for event handling
 * - Fieldset layout matching chat component
 * - Conditional rendering based on selectedSettingsTarget
 * 
 * Changes:
 * - Enhanced to support agent and world settings
 * - Added selectedAgent and selectedSettingsTarget props
 * - Implemented dynamic legend and content
 * - Removed notification checkbox as per requirements
 * - World settings now shown by default instead of prompt message
 */

import { app } from 'apprun';

interface WorldAgent {
  id?: string;
  name: string;
  messageCount: number;
  memorySize: number;
}

interface WorldSettingsProps {
  worldName: string;
  agentCount: number;
  messageCount: number;
  selectedSettingsTarget: 'world' | 'agent' | null;
  selectedAgent: WorldAgent | null;
}

export default function WorldSettings(props: WorldSettingsProps) {
  const {
    worldName,
    agentCount,
    messageCount,
    selectedSettingsTarget,
    selectedAgent
  } = props;

  return (
    <fieldset className="settings-fieldset">
      <legend>
        {selectedSettingsTarget === 'agent' && selectedAgent
          ? `${selectedAgent.name} Settings`
          : selectedSettingsTarget === 'world'
            ? `${worldName} Settings`
            : 'Settings'}
      </legend>
      <div className="chat-settings">
        {selectedSettingsTarget === 'agent' && selectedAgent ? (
          <div className="agent-settings">
            <div className="setting-item">
              <label>Agent Name:</label>
              <span>{selectedAgent.name}</span>
            </div>
            <div className="setting-item">
              <label>Message Count:</label>
              <span>{selectedAgent.messageCount}</span>
            </div>
            <div className="setting-item">
              <label>Memory Size:</label>
              <span>{selectedAgent.memorySize}</span>
            </div>
          </div>
        ) : selectedSettingsTarget === 'world' ? (
          <div className="world-settings">
            <div className="setting-item">
              <label>World Name:</label>
              <span>{worldName}</span>
            </div>
            <div className="setting-item">
              <label>Agents Count:</label>
              <span>{agentCount}</span>
            </div>
            <div className="setting-item">
              <label>Total Messages:</label>
              <span>{messageCount}</span>
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
