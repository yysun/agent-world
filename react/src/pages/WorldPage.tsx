/**
 * WorldPage - World detail with chats and settings
 *
 * Purpose:
 * - Provide a responsive world workspace for chat, chat navigation, and settings.
 *
 * Features:
 * - Chat list sidebar with desktop collapse and mobile drawer behavior
 * - Real-time chat interface with ChatThread
 * - Right settings panel with World and Agent settings sections
 * - Side-by-side main area + settings panel on desktop/tablet
 * - Responsive mobile layout that preserves chat and settings access
 * - Agent creation and agent selection from header
 *
 * Implementation Notes:
 * - Uses useWorldData, useAgentData, useChatData hooks
 * - Reuses MarkdownEditor for both world and agent settings
 * - Uses right-panel state (open/closed + section) instead of settings view mode
 * - Uses Tailwind responsive classes for desktop/tablet/mobile behavior
 *
 * Recent Changes:
 * - 2026-02-08: Replaced full-page settings view mode with right settings panel state
 * - 2026-02-08: Added responsive world page behavior for desktop/tablet/mobile
 * - 2026-02-08: Added mobile chat-list drawer and responsive header/actions
 * - 2025-11-12: Added chat switching and default chat selection fixes
 * - 2025-11-12: Removed WebSocket dependency, now using REST API + SSE
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MarkdownEditor from '@/components/MarkdownEditor.tsx';
import Loading from '@/components/Loading.tsx';
import { ChatThread } from '@/components/chat';
import { messagesToChatMessages } from '@/components/chat/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAgentData } from '@/hooks/useAgentData';
import { useChatData } from '@/hooks/useChatData';
import { useWorldData } from '@/hooks/useWorldData';
import * as api from '@/lib/api';
import type { Agent, Chat } from '@/types';

type SettingsSection = 'world' | 'agent';

const isMobileViewport = () => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768;
};

export default function WorldPage() {
  const { worldId } = useParams<{ worldId: string }>();
  const navigate = useNavigate();

  const { getWorld } = useWorldData();
  const { agents, createAgent, updateAgent, refetch: refetchAgents } = useAgentData(worldId || '');
  const { chats, messages, sendMessage, createChat, deleteChat, subscribeToChat, loadChatMessages } = useChatData(
    worldId || '',
    undefined
  );

  const [world, setWorld] = useState<{ id: string; name: string; description?: string; currentChatId?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [sending, setSending] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileChatListOpen, setMobileChatListOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('world');

  // Agent creation
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [creating, setCreating] = useState(false);

  // Settings editing
  const [editingSaving, setEditingSaving] = useState(false);

  useEffect(() => {
    if (!worldId) return;

    const loadWorld = async () => {
      try {
        const worldData = await getWorld(worldId);
        if (worldData) {
          setWorld(worldData);

          if (worldData.currentChatId && worldData.chats) {
            const currentChat = worldData.chats.find((chat) => chat.id === worldData.currentChatId);
            if (currentChat) {
              setSelectedChat(currentChat);
            }
          }
        } else {
          navigate('/');
        }
      } catch (err) {
        console.error('Failed to load world:', err);
        navigate('/');
      } finally {
        setLoading(false);
      }
    };

    loadWorld();
  }, [worldId, getWorld, navigate]);

  useEffect(() => {
    if (!selectedChat && chats.length > 0 && world?.currentChatId) {
      const currentChat = chats.find((chat) => chat.id === world.currentChatId);
      if (currentChat) {
        setSelectedChat(currentChat);
      }
    }
  }, [chats, world?.currentChatId, selectedChat]);

  useEffect(() => {
    if (worldId) {
      subscribeToChat();
    }
  }, [worldId, subscribeToChat]);

  const openWorldSettings = () => {
    setSettingsSection('world');
    setIsSettingsPanelOpen(true);
  };

  const openAgentSettings = (agent: Agent) => {
    setSelectedAgent(agent);
    setSettingsSection('agent');
    setIsSettingsPanelOpen(true);
  };

  const closeSettingsPanel = () => {
    setIsSettingsPanelOpen(false);
  };

  const handleSidebarToggle = () => {
    if (isMobileViewport()) {
      setMobileChatListOpen((value) => !value);
      return;
    }
    setSidebarCollapsed((value) => !value);
  };

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || sending) return;

    setSending(true);
    try {
      await sendMessage(content, selectedAgent?.id || 'human');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim()) return;

    setCreating(true);
    try {
      await createAgent({
        name: newAgentName,
        type: 'assistant',
        systemPrompt: 'You are a helpful assistant.',
      });
      setNewAgentName('');
      setShowAgentForm(false);
      await refetchAgents();
    } catch (err) {
      console.error('Failed to create agent:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleChatSelect = async (chat: Chat) => {
    setSelectedChat(chat);
    setMobileChatListOpen(false);

    try {
      if (worldId) {
        await api.setChat(worldId, chat.id);
      }
      await loadChatMessages(chat.id);
    } catch (err) {
      console.error('Failed to load chat messages:', err);
    }
  };

  const handleNewChat = async () => {
    try {
      const newChat = await createChat();
      setSelectedChat(newChat);
      setMobileChatListOpen(false);
    } catch (err) {
      console.error('Failed to create chat:', err);
    }
  };

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this chat?')) return;

    try {
      await deleteChat(chatId);
      if (selectedChat?.id === chatId) {
        setSelectedChat(null);
      }
    } catch (err) {
      console.error('Failed to delete chat:', err);
    }
  };

  const handleSaveWorld = async (data: Record<string, unknown>) => {
    if (!worldId || !world) return;

    setEditingSaving(true);
    try {
      // World update via hook (needs implementation)
      console.log('Save world:', data);
      closeSettingsPanel();
    } catch (err) {
      console.error('Failed to save world:', err);
    } finally {
      setEditingSaving(false);
    }
  };

  const handleSaveAgent = async (data: Record<string, unknown>) => {
    if (!selectedAgent) return;

    setEditingSaving(true);
    try {
      await updateAgent(selectedAgent.id, data);
      await refetchAgents();
      closeSettingsPanel();
    } catch (err) {
      console.error('Failed to save agent:', err);
    } finally {
      setEditingSaving(false);
    }
  };

  if (loading) {
    return <Loading message="Loading world..." />;
  }

  if (!world) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-lg text-muted-foreground">World not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredChats = chats.filter(
    (chat) => !searchQuery || (chat.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-screen bg-gradient-to-br from-background via-muted/10 to-muted/30 flex overflow-hidden">
      {mobileChatListOpen && (
        <button
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setMobileChatListOpen(false)}
          aria-label="Close chat list"
        />
      )}

      {/* Left Sidebar - Chat List */}
      <div
        className={`fixed inset-y-0 left-0 z-30 w-[280px] md:static md:z-auto bg-background/98 backdrop-blur-md border-r border-border/50 flex flex-col shadow-lg transition-all duration-300 ${
          mobileChatListOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${sidebarCollapsed ? 'md:w-[50px]' : 'md:w-[280px]'}`}
      >
        <div className="p-1 border-b border-border/50 bg-gradient-to-b from-muted/20 to-transparent">
          <div className={`flex items-center pt-1.5 ${sidebarCollapsed ? 'pl-1 justify-center' : 'pl-5 justify-between'}`}>
            {!sidebarCollapsed && (
              <button
                onClick={() => {
                  setMobileChatListOpen(false);
                  navigate('/');
                }}
                className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity"
              >
                <h2 className="text-sm font-bold text-foreground truncate">Home</h2>
              </button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSidebarToggle}
              className="shrink-0 h-10 w-10 p-0 hover:bg-muted/50"
              title={isMobileViewport() ? 'Close panel' : sidebarCollapsed ? 'Expand panel' : 'Collapse panel'}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6"
              >
                {isMobileViewport() ? (
                  <>
                    <path d="M18 6L6 18" />
                    <path d="m6 6 12 12" />
                  </>
                ) : sidebarCollapsed ? (
                  <polyline points="9 18 15 12 9 6" />
                ) : (
                  <polyline points="15 18 9 12 15 6" />
                )}
              </svg>
            </Button>
          </div>
        </div>

        <div className={`flex ${sidebarCollapsed ? 'justify-center p-2' : 'px-4 py-2'}`}>
          <Button
            onClick={handleNewChat}
            variant="ghost"
            className={`hover:bg-primary/10 transition-all text-muted-foreground hover:text-primary ${
              sidebarCollapsed ? 'h-10 w-10 p-0' : 'w-full justify-start h-10'
            }`}
            size="sm"
            title={sidebarCollapsed ? 'New Chat' : undefined}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={sidebarCollapsed ? 'w-6 h-6' : 'w-5 h-5'}
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {!sidebarCollapsed && <span className="ml-2">New Chat</span>}
          </Button>
        </div>

        {!sidebarCollapsed && (
          <>
            <div className="px-4 pb-2">
              <div className="relative">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <Input
                  type="text"
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-9 pr-3 text-sm"
                />
              </div>
            </div>

            <div className="pl-7 pr-4 py-2">
              <div className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4 text-muted-foreground"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Chats</h3>
              </div>
            </div>
          </>
        )}

        <div className="flex-1 overflow-y-auto px-2">
          {!sidebarCollapsed && (
            <div className="py-1">
              {filteredChats.map((chat) => {
                const isSelected = selectedChat?.id === chat.id;
                return (
                  <div
                    key={chat.id}
                    className={`mx-2 my-1 px-3 py-1 cursor-pointer transition-all duration-200 rounded-lg group relative ${
                      isSelected
                        ? 'bg-primary/15 border-l-4 border-l-primary shadow-sm scale-[0.98]'
                        : 'border-l-4 border-l-transparent hover:bg-muted/60 hover:scale-[0.99]'
                    }`}
                    onClick={() => handleChatSelect(chat)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="flex-1 text-xs text-foreground truncate">{chat.name || 'Untitled Chat'}</h3>
                      <button
                        onClick={(e) => handleDeleteChat(chat.id, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                        title="Delete chat"
                        aria-label="Delete chat"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-4 h-4"
                        >
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
              {chats.length === 0 && (
                <div className="text-center py-12 px-4">
                  <p className="text-sm text-muted-foreground font-medium mb-1">No chats yet</p>
                  <p className="text-xs text-muted-foreground/70">Click "New Chat" to start</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main + Settings */}
      <div className="flex-1 min-w-0 flex flex-col md:flex-row bg-gradient-to-br from-background via-background to-muted/10 overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="bg-gradient-to-r from-background via-card/30 to-background border-b border-border/50 px-3 sm:px-6 py-3 sm:py-4 shadow-sm shrink-0">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMobileChatListOpen(true)}
                    className="md:hidden h-8 w-8 p-0"
                    title="Open chat list"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-5 h-5"
                    >
                      <line x1="3" x2="21" y1="6" y2="6" />
                      <line x1="3" x2="21" y1="12" y2="12" />
                      <line x1="3" x2="21" y1="18" y2="18" />
                    </svg>
                  </Button>
                  <h1 className="text-sm font-bold text-foreground truncate">{world.name}</h1>
                  <button
                    onClick={openWorldSettings}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                    title="World settings"
                    aria-label="World settings"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                    >
                      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>

                <div className="flex items-center gap-2 max-w-full overflow-x-auto">
                  {agents.map((agent) => {
                    const isSelected = selectedAgent?.id === agent.id;
                    const initials =
                      (agent.name || '')
                        .split(' ')
                        .map((part) => part[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase() || 'A';

                    return (
                      <button
                        key={agent.id}
                        className="flex items-center gap-2 cursor-pointer group"
                        onClick={() => openAgentSettings(agent)}
                        title={agent.name}
                      >
                        <div className="relative">
                          <div
                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-primary via-primary/80 to-primary/60 text-primary-foreground flex items-center justify-center font-bold text-xs transition-all duration-300 shadow-md ${
                              isSelected ? 'ring-2 ring-primary/30 scale-110' : 'group-hover:scale-110 group-hover:ring-1 group-hover:ring-primary/20'
                            }`}
                          >
                            {initials}
                          </div>
                          <div
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background shadow-sm ${
                              isSelected ? 'bg-yellow-400' : 'bg-green-500'
                            }`}
                          />
                        </div>
                      </button>
                    );
                  })}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAgentForm((value) => !value)}
                    className="h-8 px-3 text-xs font-semibold"
                  >
                    Add Agent
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{selectedChat?.name || 'Select or create a chat'}</p>
            </div>

            {showAgentForm && (
              <div className="mt-4 p-4 bg-gradient-to-br from-muted/30 to-muted/10 rounded-lg border border-border/50">
                <form onSubmit={handleCreateAgent} className="flex flex-col sm:flex-row gap-2 sm:items-end">
                  <div className="flex-1 space-y-1">
                    <label htmlFor="agentName" className="text-xs font-medium text-foreground">
                      Agent Name <span className="text-destructive">*</span>
                    </label>
                    <Input
                      id="agentName"
                      type="text"
                      value={newAgentName}
                      onChange={(e) => setNewAgentName(e.target.value)}
                      placeholder="Enter agent name..."
                      required
                      disabled={creating}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={creating} size="sm" className="h-8">
                      {creating ? 'Creating...' : 'Create'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAgentForm(false)}
                      disabled={creating}
                      className="h-8"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>

          <div className="flex-1 bg-gradient-to-br from-muted/10 via-transparent to-muted/20 overflow-hidden min-h-0">
            <ChatThread
              worldId={worldId!}
              selectedAgent={selectedAgent}
              messages={messagesToChatMessages(messages)}
              streaming={sending}
              onSendMessage={handleSendMessage}
              disabled={!selectedChat}
            />
          </div>
        </div>

        <aside
          className={`bg-background/95 backdrop-blur-md overflow-hidden flex flex-col transition-all duration-300 ${
            isSettingsPanelOpen ? 'max-h-[55vh] border-t border-border/50' : 'max-h-0 border-t-0'
          } md:max-h-none md:border-t-0 md:border-l md:border-border/50 ${
            isSettingsPanelOpen ? 'md:w-[360px] lg:w-[420px]' : 'md:w-0 md:border-l-0'
          }`}
        >
          <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={settingsSection === 'world' ? 'default' : 'outline'}
                onClick={() => setSettingsSection('world')}
                className="h-8"
              >
                World
              </Button>
              <Button
                size="sm"
                variant={settingsSection === 'agent' ? 'default' : 'outline'}
                onClick={() => setSettingsSection('agent')}
                className="h-8"
              >
                Agent
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={closeSettingsPanel} className="h-8 w-8 p-0" title="Close settings">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
              >
                <path d="M18 6L6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-5">
            {settingsSection === 'world' ? (
              <div>
                <h2 className="text-lg font-semibold mb-3">World Settings</h2>
                <MarkdownEditor
                  initialData={{
                    name: world.name,
                    description: world.description,
                  }}
                  onSave={handleSaveWorld}
                  onCancel={closeSettingsPanel}
                  saving={editingSaving}
                  entityType="world"
                />
              </div>
            ) : selectedAgent ? (
              <div>
                <h2 className="text-lg font-semibold mb-3">Agent Settings</h2>
                <MarkdownEditor
                  initialData={{
                    name: selectedAgent.name,
                    type: selectedAgent.type,
                    systemPrompt: selectedAgent.systemPrompt,
                    description: selectedAgent.description,
                  }}
                  onSave={handleSaveAgent}
                  onCancel={closeSettingsPanel}
                  saving={editingSaving}
                  entityType="agent"
                />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center text-sm text-muted-foreground">
                Select an agent from the header to edit agent settings.
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
