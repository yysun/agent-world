/**
 * Connection Status Component
 * 
 * Displays connection state and reconnection progress
 * - Connected indicator (green)
 * - Connecting with spinner (yellow)
 * - Reconnecting with spinner and attempts (orange)
 * - Disconnected with error (red)
 * 
 * Created: 2025-11-01 - Phase 3: Polish & Testing
 * Updated: 2025-11-02 - Add reconnecting state display
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

interface ConnectionStatusProps {
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  error: string | null;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  connected,
  connecting,
  reconnecting,
  error
}) => {
  if (connected) {
    return (
      <Box>
        <Text color="green">● Connected</Text>
      </Box>
    );
  }

  if (reconnecting) {
    return (
      <Box>
        <Text color="yellow">
          <Spinner type="dots" />
        </Text>
        <Text color="yellow"> Reconnecting...</Text>
      </Box>
    );
  }

  if (connecting) {
    return (
      <Box>
        <Text color="yellow">
          <Spinner type="dots" />
        </Text>
        <Text color="yellow"> Connecting...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Text color="red">● Disconnected</Text>
        <Text color="gray" dimColor> ({error})</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color="gray" dimColor>● Disconnected</Text>
    </Box>
  );
};

export default ConnectionStatus;
