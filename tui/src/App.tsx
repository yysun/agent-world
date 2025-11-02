/**
 * Main App Component
 * 
 * Root component that orchestrates:
 * - WebSocket connection (useWebSocketConnection)
 * - World state management (useWorldState)
 * - Event processing (useEventProcessor)
 * - High-level operations (useAgentWorldClient)
 * - Vertical layout: TopPanel → Messages → Input → StatusBar
 * 
 * Created: 2025-11-01 - Phase 1: Core Infrastructure
 * Updated: 2025-11-01 - Phase 2: UI Components Integration
 * Updated: 2025-11-01 - Phase 3: Command Result Integration
 * Updated: 2025-11-02 - Phase 1: Refactor to use focused hooks
 * Updated: 2025-11-02 - Phase 1: Vertical layout redesign
 * Updated: 2025-11-02 - Add proper error handling for WebSocket disconnections with reconnection support
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

  // Subscribe to world when connected
  useEffect(() => {
    if (wsConnection.connected && wsConnection.ws) {
      client.subscribe(worldId, chatId, replayFrom);
    }
  }, [wsConnection.connected, worldId, chatId, replayFrom]);

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
        agents={Array.from(worldState.agents.values())}
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

      {/* Input Box */}
      <InputBox
        onSubmit={handleSubmit}
        disabled={!wsConnection.connected}
        placeholder={wsConnection.connected ? 'Type a message or /command...' : 'Disconnected'}
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
          agents={Array.from(worldState.agents.values())}
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
