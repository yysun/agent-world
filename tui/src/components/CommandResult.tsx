/**
 * Command Result Component
 * 
 * Displays command execution results with:
 * - Timestamp
 * - Success/failure indicators
 * - Result data (if any)
 * 
 * Created: 2025-11-01 - Phase 3: Polish & Testing
 * Updated: 2025-11-01 - Updated interface to accept CommandResult directly
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface CommandResult {
  timestamp: Date;
  success: boolean;
  result: any;
}

interface CommandResultProps {
  result: CommandResult;
}

const CommandResult: React.FC<CommandResultProps> = ({ result }) => {
  const { timestamp, success, result: data } = result;
  
  const time = timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={success ? "green" : "red"} padding={1} marginBottom={1}>
      <Box>
        <Text color="gray" dimColor>[{time}]</Text>
        <Text> </Text>
        <Text color={success ? "green" : "red"} bold>{success ? '✓ Command executed' : '✗ Command failed'}</Text>
      </Box>
      
      {data && (
        <Box flexDirection="column" paddingLeft={2} marginTop={1}>
          {typeof data === 'string' ? (
            <Text>{data}</Text>
          ) : (
            <Text>{JSON.stringify(data, null, 2)}</Text>
          )}
        </Box>
      )}
    </Box>
  );
};

export default CommandResult;
