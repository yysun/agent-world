/**
 * Connection Status Component
 * 
 * Displays connection state and reconnection progress
 * - Connected indicator (green)
 * - Connecting with spinner (yellow)
 * - Disconnected with error (red)
 * 
 * Created: 2025-11-01 - Phase 3: Polish & Testing
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

interface ConnectionStatusProps {
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  connected,
  connecting,
  error
}) => {
  if (connected) {
    return (
      <Box>
        <Text color="green">● Connected</Text>
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
