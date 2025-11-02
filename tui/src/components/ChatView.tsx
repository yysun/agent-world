/**
 * Chat View Component
 * 
 * Displays message history with:
 * - Sender-specific colors (human = yellow, agents = green)
 * - Timestamps
 * - Auto-scrolling to latest message
 * - Historical vs live message indicators
 * 
 * Created: 2025-11-01 - Phase 2: UI Components
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../types/index.js';

interface ChatViewProps {
  messages: Message[];
  maxMessages?: number;
}

const ChatView: React.FC<ChatViewProps> = ({ messages, maxMessages = 100 }) => {
  // Get last N messages
  const displayMessages = messages.slice(-maxMessages);

  if (displayMessages.length === 0) {
    return (
      <Box padding={1}>
        <Text color="gray" dimColor>No messages yet. Type a message to get started.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {displayMessages.map((msg, index) => {
        const isHuman = msg.sender === 'human' || msg.sender.toLowerCase() === 'human';
        const senderColor = isHuman ? 'yellow' : 'green';
        const timestamp = msg.timestamp.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        return (
          <Box key={`${msg.messageId}-${index}`} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color="gray" dimColor>[{timestamp}]</Text>
              <Text> </Text>
              <Text color={senderColor} bold>{msg.sender}:</Text>
              {msg.isHistorical && <Text color="gray" dimColor> (historical)</Text>}
            </Box>
            <Box paddingLeft={2}>
              <Text>{msg.content}</Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

export default ChatView;
