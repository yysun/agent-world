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
 */

import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useWorldState, useEventProcessor } from './hooks/useWorldState.js';
import ChatView from './components/ChatView.js';
import AgentSidebar from './components/AgentSidebar.js';
import InputBox from './components/InputBox.js';

interface AppProps {
  serverUrl: string;
  worldId: string;
  chatId: string | null;
  replayFrom: 'beginning' | number;
}

const App: React.FC<AppProps> = ({ serverUrl, worldId, chatId, replayFrom }) => {
  const { exit } = useApp();
  const [hasSubscribed, setHasSubscribed] = useState(false);

  const worldState = useWorldState();
  const processEvent = useEventProcessor(worldState);

  const ws = useWebSocket(serverUrl, {
    onEvent: processEvent,
    onConnected: () => {
      worldState.setError(null);
    },
    onDisconnected: () => {
      worldState.setError('Disconnected from server');
    },
    onError: (error) => {
      worldState.setError(error.message);
    }
  });

  // Subscribe to world on connection
  useEffect(() => {
    if (ws.connected && !hasSubscribed) {
      ws.subscribe(worldId, chatId, replayFrom);
      setHasSubscribed(true);
    }
  }, [ws.connected, hasSubscribed, worldId, chatId, replayFrom, ws]);

  // Handle Ctrl+C to exit
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      ws.disconnect();
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

  // Loading state
  if (ws.connecting) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text color="cyan"> Connecting to {serverUrl}...</Text>
        </Box>
      </Box>
    );
  }

  // Connection error
  if (!ws.connected && worldState.error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">✗ {worldState.error}</Text>
        <Text color="gray" dimColor>Press Ctrl+C to exit</Text>
      </Box>
    );
  }

  // Replay progress
  if (worldState.isReplaying && worldState.replayProgress) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text color="cyan"> Replaying events...</Text>
        </Box>
        <Box marginTop={1}>
          <Text>
            {worldState.replayProgress.current} / {worldState.replayProgress.total} ({worldState.replayProgress.percentage}%)
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>Press Ctrl+C to exit</Text>
        </Box>
      </Box>
    );
  }

  // Main UI with split-pane layout
  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>Agent World - {worldId}</Text>
        {ws.connected && <Text color="green"> ●</Text>}
      </Box>

      {/* Main content: sidebar + chat */}
      <Box flexGrow={1} flexDirection="row">
        {/* Agent Sidebar */}
        <Box width="25%" borderStyle="single" borderColor="gray">
          <AgentSidebar agents={worldState.agents} />
        </Box>

        {/* Chat View */}
        <Box width="75%" flexDirection="column">
          <Box flexGrow={1}>
            <ChatView messages={worldState.messages} />
          </Box>
        </Box>
      </Box>

      {/* Error bar */}
      {worldState.error && (
        <Box paddingX={1}>
          <Text color="red" bold>Error: {worldState.error}</Text>
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
          Ctrl+C to exit | Messages: {worldState.messages.length} | Agents: {worldState.agents.size}
        </Text>
      </Box>
    </Box>
  );
};

export default App;
