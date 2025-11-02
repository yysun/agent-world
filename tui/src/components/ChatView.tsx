/**
 * Chat View Component
 * 
 * Displays message history with:
 * - Sender-specific colors (human = yellow, agents = green)
 * - Timestamps
 * - Auto-scrolling to latest message
 * - Historical vs live message indicators
 * - Full width layout (no sidebar)
 * 
 * Created: 2025-11-01 - Phase 2: UI Components
 * Updated: 2025-11-02 - Phase 1: Use shared Message type from ws/types
 * Updated: 2025-11-02 - Phase 1: Full width for vertical layout
 */

import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import type { Message } from '../../../ws/types.js';

interface ChatViewProps {
  messages: Message[];
  maxMessages?: number;
}

const ChatView: React.FC<ChatViewProps> = ({ messages, maxMessages = 100 }) => {
  // Get last N messages
  const displayMessages = messages.slice(-maxMessages);

  if (displayMessages.length === 0) {
    return (
      <Box padding={1} width="100%">
        <Text color="gray" dimColor>No messages yet. Type a message to get started.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1} width="100%">
      {displayMessages.map((msg, index) => {
        const isHuman = msg.sender === 'human' || msg.sender.toLowerCase() === 'human';
        const isSystem = msg.sender === 'system' || msg.isSystemEvent;
        const isStreaming = msg.isStreaming;

        // System events are gray, human is yellow, agents are green
        const senderColor = isSystem ? 'gray' : (isHuman ? 'yellow' : 'green');

        // Use createdAt if available, fallback to timestamp
        const messageTime = msg.createdAt || msg.timestamp;
        const timestamp = messageTime ? new Date(messageTime).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }) : '';

        // Use text or content
        const content = msg.text || msg.content || '';

        return (
          <Box key={`${msg.messageId || msg.id}-${index}`} flexDirection="column" marginBottom={1}>
            <Box>
              {!isSystem && timestamp && (
                <>
                  <Text color="gray" dimColor>[{timestamp}]</Text>
                  <Text> </Text>
                </>
              )}
              <Text color={senderColor} bold={!isSystem} dimColor={isSystem}>{msg.sender}:</Text>
              {msg.isHistorical && <Text color="gray" dimColor> (historical)</Text>}
              {isStreaming && <Text color="cyan"> ▌</Text>}
            </Box>
            <Box paddingLeft={isSystem ? 0 : 2}>
              <Text color={isSystem ? 'gray' : undefined} dimColor={isSystem}>{content}</Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

export default ChatView;
