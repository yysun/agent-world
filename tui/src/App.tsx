/**
 * Main App Component
 * 
 * Root component that orchestrates:
 * - WebSocket connection (useWebSocketConnection)
 * - World state management (useWorldState)
 * - Event processing (useEventProcessor)
 * - High-level operations (useAgentWorldClient)
 * - Tool approval dialog integration (ApprovalDialog)
 * - Vertical layout: TopPanel → Messages → Input → StatusBar
 * 
 * Created: 2025-11-01 - Phase 1: Core Infrastructure
 * Updated: 2025-11-01 - Phase 2: UI Components Integration
 * Updated: 2025-11-01 - Phase 3: Command Result Integration
 * Updated: 2025-11-02 - Phase 1: Refactor to use focused hooks
 * Updated: 2025-11-02 - Phase 1: Vertical layout redesign
 * Updated: 2025-11-02 - Add proper error handling for WebSocket disconnections with reconnection support
 * Updated: Phase 7 - Integrate tool approval dialog and approval response handling
 */

import React, { useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { useWebSocketConnection } from './hooks/useWebSocketConnection.js';
import { useAgentWorldClient } from './hooks/useAgentWorldClient.js';
import { useWorldState } from './hooks/useWorldState.js';
import { useEventProcessor } from './hooks/useEventProcessor.js';
import { usePopup } from './hooks/usePopup.js';
import TopPanel from './components/TopPanel.js';
import ChatView from './components/ChatView.js';
import InputBox from './components/InputBox.js';
import StatusBar from './components/StatusBar.js';
import CommandResult from './components/CommandResult.js';
import WorldManager from './components/WorldManager.js';
import AgentManager from './components/AgentManager.js';
import ChatManager from './components/ChatManager.js';
import type { AgentActivityStatus } from '../../ws/types.js';

interface AppProps {
  serverUrl: string;
  worldId: string;
  chatId: string | null;
  replayFrom: 'beginning' | number;
}

const App: React.FC<AppProps> = ({ serverUrl, worldId, chatId, replayFrom }) => {
  const { exit } = useApp();

  // 1. WebSocket connection
  const wsConnection = useWebSocketConnection(serverUrl);

  // 2. World state
  const worldState = useWorldState();

  // 3. Event processor
  const processEvent = useEventProcessor(worldState, {
    batchDuringReplay: true,
    batchSize: 50,
    throttleMs: 16 // ~60fps
  });

  // Status message handler for replay progress
  const handleStatus = useCallback((status: any) => {
    if (status?.replayProgress) {
      const { current, total } = status.replayProgress;
      worldState.setReplayProgress(current, total);
    }
    if (status?.replayComplete) {
      worldState.setReplayProgress(0, 0); // Marks replay as complete
    }
  }, [worldState]);

  // 4. Agent World client operations
  const client = useAgentWorldClient(wsConnection.ws, wsConnection.connected, {
    onEvent: processEvent,
    onStatus: handleStatus
  });

  // 5. Popup management
  const popup = usePopup(wsConnection.connected);

  // 6. Setup approval response callback
  useEffect(() => {
    worldState.setApprovalCallback((response) => {
      // Pass worldId and chatId to approval response
      client.sendApprovalResponse({
        ...response,
        worldId,
        chatId
      });
    });
  }, [worldState.setApprovalCallback, client.sendApprovalResponse, worldId, chatId]);

  // Subscribe to world when connected
  useEffect(() => {
    if (wsConnection.connected && wsConnection.ws) {
      client.subscribe(worldId, chatId, replayFrom);
    }
  }, [wsConnection.connected, worldId, chatId, replayFrom, client.subscribe, wsConnection.ws]);

  // Handle Ctrl+C to exit
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  const handleSubmit = (value: string, isCommand: boolean) => {
    if (isCommand) {
      client.executeCommand(worldId, value);
    } else {
      client.enqueue(worldId, chatId, value, 'human');
    }
  };

  // Convert Agent objects to AgentActivityStatus for components that need it
  const agentActivityStatuses = Array.from(worldState.agents.values()).map(agent => {
    const status = worldState.agentStatuses.get(agent.id);
    return {
      agentId: agent.id,
      message: status?.message || `${agent.name} (${agent.status || 'inactive'})`,
      phase: status?.phase || 'thinking',
      activityId: status?.activityId || null,
      updatedAt: status?.updatedAt || Date.now()
    } as AgentActivityStatus;
  });

  // Initial connecting state (before first connection)
  if ((wsConnection.connecting || worldState.isReplaying) && !wsConnection.reconnecting) {
    const statusText = wsConnection.connecting
      ? `Connecting to ${serverUrl}...`
      : worldState.replayProgress
        ? `Replaying events... ${worldState.replayProgress.current} / ${worldState.replayProgress.total} (${worldState.replayProgress.percentage}%)`
        : 'Loading...';

    return (
      <Box flexDirection="column" padding={1}>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text color="cyan"> {statusText}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>Press Ctrl+C to exit</Text>
        </Box>
      </Box>
    );
  }

  // Show full UI even when disconnected/reconnecting
  // Connection status is displayed in TopPanel

  // Main UI with vertical layout
  return (
    <Box flexDirection="column" height="100%">
      {/* Top Panel: Agents + Title + Connection */}
      <TopPanel
        worldId={worldId}
        chatId={chatId}
        agents={agentActivityStatuses}
        connected={wsConnection.connected}
        connecting={wsConnection.connecting}
        reconnecting={wsConnection.reconnecting}
        error={wsConnection.error}
      />

      {/* Message Area (grows to fill available space) */}
      <Box flexGrow={1}>
        <ChatView messages={worldState.messages} />
      </Box>

      {/* Command Result */}
      {worldState.lastCommandResult && (
        <Box paddingX={1}>
          <CommandResult result={worldState.lastCommandResult} />
        </Box>
      )}

      {/* Inline Approval Display (above input) */}
      {worldState.approvalState.isShowingApproval && worldState.approvalState.currentRequest && (
        <Box paddingX={1} paddingY={1} borderStyle="double" borderColor="yellow">
          <Box flexDirection="column">
            <Text bold color="yellow">🔒 Tool Approval Required</Text>
            <Text color="gray">Tool: <Text color="cyan">{worldState.approvalState.currentRequest.toolName}</Text></Text>
            {worldState.approvalState.currentRequest.message && (
              <Text color="gray">Details: {worldState.approvalState.currentRequest.message}</Text>
            )}
            {worldState.approvalState.currentRequest.toolArgs && Object.keys(worldState.approvalState.currentRequest.toolArgs).length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text color="gray">Arguments:</Text>
                {Object.entries(worldState.approvalState.currentRequest.toolArgs).map(([key, value]) => {
                  const displayValue = typeof value === 'string' && value.length > 100
                    ? `${value.substring(0, 100)}...`
                    : String(value);
                  return (
                    <Text key={key} color="gray">  {key}: {displayValue}</Text>
                  );
                })}
              </Box>
            )}
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="magenta">How would you like to respond?</Text>
              <Text color="cyan">  1. Deny</Text>
              <Text color="cyan">  2. Approve Once</Text>
              <Text color="cyan">  3. Approve for Session</Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* Input Box */}
      <InputBox
        onSubmit={handleSubmit}
        disabled={!wsConnection.connected}
        placeholder={wsConnection.connected ? 'Type a message or /command...' : 'Disconnected'}
        approvalRequest={worldState.approvalState.currentRequest}
        onApproval={worldState.sendApprovalResponse}
        onApprovalCancel={worldState.hideApprovalRequest}
      />

      {/* Status Bar: Shortcuts + Counts */}
      <StatusBar
        messageCount={worldState.messages.length}
        agentCount={worldState.agents.size}
        showCrudShortcuts={true}
      />

      {/* Popups (rendered on top) */}
      {popup.popupType === 'world' && (
        <WorldManager
          currentWorldId={worldId}
          onClose={popup.closePopup}
        />
      )}
      {popup.popupType === 'agent' && (
        <AgentManager
          agents={agentActivityStatuses}
          onClose={popup.closePopup}
        />
      )}
      {popup.popupType === 'chat' && (
        <ChatManager
          currentChatId={chatId}
          worldId={worldId}
          onClose={popup.closePopup}
        />
      )}
    </Box>
  );
};

export default App;
