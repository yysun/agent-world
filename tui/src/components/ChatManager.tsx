/**
 * ChatManager Popup
 * 
 * CRUD operations for chats:
 * - List chats in current world
 * - Switch chat
 * - Create new chat
 * - Delete chat
 * 
 * Created: 2025-11-02 - Phase 3: CRUD Popups
 */

import React from 'react';
import { Box, Text } from 'ink';
import Popup from './Popup.js';

interface ChatManagerProps {
  currentChatId: string | null;
  worldId: string;
  onClose: () => void;
  onSwitchChat?: (chatId: string) => void;
  onCreateChat?: (title: string) => void;
  onDeleteChat?: (chatId: string) => void;
}

const ChatManager: React.FC<ChatManagerProps> = ({
  currentChatId,
  worldId,
  onClose
}) => {
  return (
    <Popup title="Chat Manager" width="60%" height="50%" onClose={onClose}>
      <Box flexDirection="column">
        <Text color="cyan" bold>Current Chat: {currentChatId || '(none)'}</Text>
        <Text color="gray">World: {worldId}</Text>

        <Box marginTop={2}>
          <Text color="gray" dimColor>
            Chat CRUD operations coming soon...
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text color="yellow">
            Use /chat:create, /chat:switch, /chat:delete commands for now
          </Text>
        </Box>
      </Box>
    </Popup>
  );
};

export default ChatManager;
