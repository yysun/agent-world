/**
 * Main App Component
 * 
 * Root component that orchestrates:
 * - WebSocket connection
 * - World state management
 * - Layout and routing between views
 * - Split-pane UI with chat and agent sidebar
 * 
 * Created: 2025-11-01 - Phase 1: Core Infrastructure
 * Updated: 2025-11-01 - Phase 2: UI Components Integration
 * Updated: 2025-11-01 - Phase 3: Command Result Integration
 */

import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useWorldState } from './hooks/useWorldState.js';
import ChatView from './components/ChatView.js';
import AgentSidebar from './components/AgentSidebar.js';
import InputBox from './components/InputBox.js';
import ConnectionStatus from './components/ConnectionStatus.js';
import CommandResult from './components/CommandResult.js';

interface AppProps {
  serverUrl: string;
  worldId: string;
  chatId: string | null;
  replayFrom: 'beginning' | number;
}

const App: React.FC<AppProps> = ({ serverUrl, worldId, chatId, replayFrom }) => {
  const { exit } = useApp();
  
  const { messages, agents, isReplayComplete, replayProgress, lastCommandResult, processEvent } = useWorldState();
  
  const ws = useWebSocket(serverUrl, {
    onEvent: processEvent,
    onConnected: () => {
      // Subscribe to world on connection
      ws.subscribe(worldId, chatId, replayFrom);
    }
  });

  // Handle Ctrl+C to exit
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  const handleSubmit = (value: string, isCommand: boolean) => {
    if (isCommand) {
      ws.executeCommand(worldId, value);
    } else {
      ws.enqueue(worldId, chatId, value, 'human');
    }
  };

  // Loading/connecting state
  if (ws.connecting || !isReplayComplete) {
    const statusText = ws.connecting 
      ? `Connecting to ${serverUrl}...`
      : replayProgress 
        ? `Replaying events... ${replayProgress.current} / ${replayProgress.total}`
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

  // Connection error
  if (!ws.connected && ws.lastError) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">✗ {ws.lastError}</Text>
        <Text color="gray" dimColor>Press Ctrl+C to exit</Text>
      </Box>
    );
  }

  // Main UI with split-pane layout
  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>Agent World - {worldId}</Text>
        <Text> | </Text>
        <ConnectionStatus connected={ws.connected} connecting={ws.connecting} error={ws.lastError} />
      </Box>

      {/* Main content: sidebar + chat */}
      <Box flexGrow={1} flexDirection="row">
        {/* Agent Sidebar */}
        <Box width="25%" borderStyle="single" borderColor="gray">
          <AgentSidebar agents={agents} />
        </Box>

        {/* Chat View */}
        <Box width="75%" flexDirection="column">
          <Box flexGrow={1}>
            <ChatView messages={messages} />
          </Box>
        </Box>
      </Box>

      {/* Command Result */}
      {lastCommandResult && (
        <Box paddingX={1}>
          <CommandResult result={lastCommandResult} />
        </Box>
      )}

      {/* Input */}
      <InputBox
        onSubmit={handleSubmit}
        disabled={!ws.connected}
        placeholder={ws.connected ? 'Type a message or /command...' : 'Disconnected'}
      />

      {/* Footer */}
      <Box paddingX={1}>
        <Text color="gray" dimColor>
          Ctrl+C to exit | Messages: {messages.length} | Agents: {agents.length}
        </Text>
      </Box>
    </Box>
  );
};

export default App;
