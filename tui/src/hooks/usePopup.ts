/**
 * usePopup Hook
 * 
 * Manages popup state and keyboard shortcuts for CRUD operations.
 * 
 * Features:
 * - Open/close popup modals
 * - Keyboard shortcuts: Ctrl+W (worlds), Ctrl+A (agents), Ctrl+H (chats)
 * - Escape to close
 * - Single popup at a time
 * 
 * Created: 2025-11-02 - Phase 2: Popup Framework
 */

import { useState, useCallback, useEffect } from 'react';
import { useInput } from 'ink';

export type PopupType = 'world' | 'agent' | 'chat' | null;

export interface UsePopupReturn {
  popupType: PopupType;
  isOpen: boolean;
  openWorldManager: () => void;
  openAgentManager: () => void;
  openChatManager: () => void;
  closePopup: () => void;
}

/**
 * Hook for managing popup state and keyboard shortcuts
 */
export function usePopup(enabled: boolean = true): UsePopupReturn {
  const [popupType, setPopupType] = useState<PopupType>(null);

  const openWorldManager = useCallback(() => {
    setPopupType('world');
  }, []);

  const openAgentManager = useCallback(() => {
    setPopupType('agent');
  }, []);

  const openChatManager = useCallback(() => {
    setPopupType('chat');
  }, []);

  const closePopup = useCallback(() => {
    setPopupType(null);
  }, []);

  // Handle keyboard shortcuts
  useInput((input, key) => {
    if (!enabled) return;

    // Escape closes popup
    if (key.escape && popupType !== null) {
      closePopup();
      return;
    }

    // Don't open popups if one is already open
    if (popupType !== null) return;

    // Ctrl+W: World manager
    if (key.ctrl && input === 'w') {
      openWorldManager();
    }
    // Ctrl+A: Agent manager
    else if (key.ctrl && input === 'a') {
      openAgentManager();
    }
    // Ctrl+H: Chat manager (H for "History")
    else if (key.ctrl && input === 'h') {
      openChatManager();
    }
  }, { isActive: enabled });

  return {
    popupType,
    isOpen: popupType !== null,
    openWorldManager,
    openAgentManager,
    openChatManager,
    closePopup
  };
}
