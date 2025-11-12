/**
 * WorldPage - World detail with chats and agents
 * 
 * Purpose: Main interaction page for a specific world
 * 
 * Features:
 * - Chat list sidebar for navigation
 * - World and agents panel in top right
 * - Real-time chat interface with ChatThread
 * - Settings editor for world/agents
 * - REST API + SSE for real-time updates
 * - Auto-load default chat (currentChatId)
 * - Load messages from agent memory
 * - Switch chats by clicking sidebar chat list
 * - shadcn UI components for consistent design
 * 
 * Implementation:
 * - Uses useWorldData, useAgentData, useChatData hooks
 * - Uses ChatThread component for chat interface
 * - Uses MarkdownEditor for world/agent settings
 * - Layout: Chat sidebar (left) + Main (center) + World/Agents (right)
 * - shadcn Card, Button, Badge, Tabs components
 * 
 * Changes:
 * - 2025-11-12: Added chat switching - clicking chat in sidebar loads messages and sets current chat
 * - 2025-11-12: Fixed default chat loading - auto-select currentChatId from world
 * - 2025-11-12: Fixed agent messages display - load from agent memory via useChatData
 * - 2025-11-12: Removed WebSocket dependency, now using REST API + SSE
 * - 2025-11-04: Redesigned with chat list sidebar and world/agents in top right
 * - 2025-11-04: Redesigned with shadcn UI components and improved layout
 * - 2025-11-04: Integrated chat design system - replaced StreamChatBox with ChatThread
 * - 2025-11-03: Created for Phase 6, adapted from Next.js world/[worldId]/page.tsx
 * - 2025-11-03: Changed from REST API to WebSocket commands
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWorldData } from '@/hooks/useWorldData';
import { useAgentData } from '@/hooks/useAgentData';
import { useChatData } from '@/hooks/useChatData';
import * as api from '@/lib/api';
import { ChatThread } from '@/components/chat';
import { messagesToChatMessages } from '@/components/chat/utils';
import MarkdownEditor from '@/components/MarkdownEditor.tsx';
import Loading from '@/components/Loading.tsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Agent, Chat } from '@/types';

export default function WorldPage() {
  const { worldId } = useParams<{ worldId: string }>();
  const navigate = useNavigate();

  const { getWorld } = useWorldData();
  const { agents, createAgent, updateAgent, refetch: refetchAgents } = useAgentData(worldId || '');
  const { chats, messages, sendMessage, createChat, deleteChat, subscribeToChat, loadChatMessages } = useChatData(worldId || '', undefined);

  const [world, setWorld] = useState<{ id: string; name: string; description?: string; currentChatId?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [viewMode, setViewMode] = useState<'chat' | 'world-settings' | 'agent-settings'>('chat');
  const [sending, setSending] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Agent creation
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [creating, setCreating] = useState(false);

  // Settings editing
  const [editingSaving, setEditingSaving] = useState(false);

  // Load world on mount and auto-select default chat
  useEffect(() => {
    if (!worldId) return;

    const loadWorld = async () => {
      console.log('[WorldPage] Loading world', { worldId });
      try {
        const worldData = await getWorld(worldId);
        console.log('[WorldPage] Got world data', {
          hasWorld: !!worldData,
          currentChatId: worldData?.currentChatId,
          chatsCount: worldData?.chats?.length
        });
        if (worldData) {
          setWorld(worldData);

          // Auto-select the current chat if available
          if (worldData.currentChatId && worldData.chats) {
            const currentChat = worldData.chats.find(c => c.id === worldData.currentChatId);
            console.log('[WorldPage] Found current chat', { hasChat: !!currentChat, chatId: currentChat?.id });
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

  // Update selected chat when chats change and no chat is selected
  useEffect(() => {
    console.log('[WorldPage] Chat selection effect', {
      hasSelectedChat: !!selectedChat,
      chatsCount: chats.length,
      currentChatId: world?.currentChatId
    });
    if (!selectedChat && chats.length > 0 && world?.currentChatId) {
      const currentChat = chats.find(c => c.id === world.currentChatId);
      console.log('[WorldPage] Auto-selecting chat', { hasChat: !!currentChat, chatId: currentChat?.id });
      if (currentChat) {
        setSelectedChat(currentChat);
      }
    }
  }, [chats, world?.currentChatId, selectedChat]);

  // Subscribe to chat events
  useEffect(() => {
    if (worldId) {
      subscribeToChat();
    }
  }, [worldId, subscribeToChat]);

  // Handlers
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

  const handleAgentSelect = (agent: Agent) => {
    setSelectedAgent(agent);
    setViewMode('agent-settings');
  };

  const handleChatSelect = async (chat: Chat) => {
    console.log('[WorldPage] handleChatSelect', { chatId: chat.id, chatName: chat.name });
    setSelectedChat(chat);
    setViewMode('chat');

    // Set the current chat on the backend and load messages
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
      setViewMode('chat');
    } catch (err) {
      console.error('Failed to create chat:', err);
    }
  };

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent chat selection when clicking delete
    if (!window.confirm('Delete this chat?')) return;

    try {
      await deleteChat(chatId);

      // If deleting the currently selected chat, clear selection
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
      // TODO: Call updateWorld from useWorldData
      setViewMode('chat');
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
      setViewMode('chat');
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

  return (
    <div className="h-screen bg-gradient-to-br from-background via-muted/10 to-muted/30 flex overflow-hidden">
      {/* Left Sidebar - Chat List (collapsible) */}
      <div
        className={`bg-background/98 backdrop-blur-md border-r border-border/50 flex flex-col shadow-lg transition-all duration-300 ${sidebarCollapsed ? 'w-[50px]' : 'w-[280px]'
          }`}
      >
        {/* Header row: World Name and Toggle */}
        <div className="p-1 border-b border-border/50 bg-gradient-to-b from-muted/20 to-transparent">
          <div className={`flex items-center ${sidebarCollapsed ? 'pl-1 justify-center' : 'pl-5 justify-between'}`}>
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2 flex-1 min-w-0 group">
                <h2 className="text-sm font-bold text-foreground truncate">{world.name}</h2>
                <button
                  onClick={() => setViewMode('world-settings')}
                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                  title="Settings"
                  aria-label="Settings"
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
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="shrink-0 h-10 w-10 p-0 hover:bg-muted/50"
              title={sidebarCollapsed ? 'Expand panel' : 'Collapse panel'}
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
                {sidebarCollapsed ? (
                  <>
                    <polyline points="9 18 15 12 9 6" />
                  </>
                ) : (
                  <>
                    <polyline points="15 18 9 12 15 6" />
                  </>
                )}
              </svg>
            </Button>
          </div>
        </div>

        {/* New Chat Button row */}
        <div className={`flex ${sidebarCollapsed ? 'justify-center p-2' : 'p-2'}`}>
          <Button
            onClick={handleNewChat}
            variant="ghost"
            className={`hover:bg-primary/10 transition-all text-muted-foreground hover:text-primary ${sidebarCollapsed ? 'h-10 w-10 p-0' : 'w-full justify-start h-10'}`}
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

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {!sidebarCollapsed && (
            <div className="py-1">
              {chats.map((chat) => {
                const isSelected = selectedChat?.id === chat.id;

                return (
                  <div
                    key={chat.id}
                    className={`mx-2 my-1 px-3 py-2 cursor-pointer transition-all duration-200 rounded-lg group relative ${isSelected
                      ? 'bg-primary/15 border-l-4 border-l-primary shadow-sm scale-[0.98]'
                      : 'border-l-4 border-l-transparent hover:bg-muted/60 hover:scale-[0.99]'
                      }`}
                    onClick={() => handleChatSelect(chat)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-xs text-foreground truncate">
                          {chat.name || '💬 Untitled Chat'}
                        </h3>
                        <p className="text-xs text-muted-foreground/80 truncate leading-relaxed mt-1">
                          {messages.length > 0 ? messages[messages.length - 1].content : 'No messages yet'}
                        </p>
                      </div>
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
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center text-3xl">
                    💭
                  </div>
                  <p className="text-sm text-muted-foreground font-medium mb-1">
                    No chats yet
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    Click "New Chat" to start
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Back Button - Hidden for now */}
        {false && (
          <div className={`border-t border-border/50 bg-gradient-to-t from-muted/20 to-transparent flex ${sidebarCollapsed ? 'justify-center p-2' : 'p-2'}`}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className={`hover:bg-muted/50 transition-all text-muted-foreground hover:text-foreground ${sidebarCollapsed ? 'h-10 w-10 p-0' : 'w-full justify-start h-10'}`}
              title="Back to Worlds"
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
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              {!sidebarCollapsed && <span className="ml-2">Back to Worlds</span>}
            </Button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-gradient-to-br from-background via-background to-muted/10 overflow-hidden">
        {viewMode === 'chat' ? (
          <>
            {/* Top Row - Chat Title (Fixed Height) */}
            <div className="bg-gradient-to-r from-background via-card/30 to-background border-b border-border/50 px-6 py-4 shadow-sm shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-sm font-bold text-foreground">
                    {selectedChat?.name || 'Select or create a chat'}
                  </h1>
                  <p className="text-xs text-muted-foreground mt-1">
                    {world.name}
                  </p>
                </div>
                {/* Active Agents - Compact View */}
                <div className="flex items-center gap-3">
                  {agents.map((agent) => {
                    const isSelected = selectedAgent?.id === agent.id;
                    const initials = (agent.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'A';
                    return (
                      <div
                        key={agent.id}
                        className="flex items-center gap-2 cursor-pointer group"
                        onClick={() => handleAgentSelect(agent)}
                        title={agent.name}
                      >
                        <div className="relative">
                          <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-primary via-primary/80 to-primary/60 text-primary-foreground flex items-center justify-center font-bold text-xs transition-all duration-300 shadow-md ${isSelected ? 'ring-2 ring-primary/30 scale-110' : 'group-hover:scale-110 group-hover:ring-1 group-hover:ring-primary/20'
                            }`}>
                            {initials}
                          </div>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background shadow-sm ${isSelected ? 'bg-yellow-400' : 'bg-green-500'
                            }`} />
                        </div>
                      </div>
                    );
                  })}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAgentForm(!showAgentForm)}
                    className="h-8 px-3 text-xs font-semibold"
                  >
                    ➕
                  </Button>
                </div>
              </div>

              {/* Create Agent Form */}
              {showAgentForm && (
                <div className="mt-4 p-4 bg-gradient-to-br from-muted/30 to-muted/10 rounded-lg border border-border/50">
                  <form onSubmit={handleCreateAgent} className="flex gap-2 items-end">
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
                    <Button
                      type="submit"
                      disabled={creating}
                      size="sm"
                      className="h-8"
                    >
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
                  </form>
                </div>
              )}
            </div>

            {/* Middle Row - Messages (Stretch & Scroll) */}
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
          </>
        ) : viewMode === 'world-settings' ? (
          <div className="flex-1 overflow-y-auto bg-gradient-to-br from-background to-muted/20 min-h-0">
            <div className="max-w-4xl mx-auto px-6 lg:px-8 py-8 sm:py-12">
              <div className="mb-8">
                <Button
                  variant="ghost"
                  onClick={() => setViewMode('chat')}
                  className="mb-6 hover:bg-muted/50"
                >
                  ← Back to Chat
                </Button>
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-2xl">
                    ⚙️
                  </div>
                  <h2 className="text-3xl font-bold text-foreground">World Settings</h2>
                </div>
                <p className="text-sm text-muted-foreground ml-16">Configure your world properties and behavior</p>
              </div>
              <MarkdownEditor
                initialData={{
                  name: world.name,
                  description: world.description,
                }}
                onSave={handleSaveWorld}
                onCancel={() => setViewMode('chat')}
                saving={editingSaving}
                entityType="world"
              />
            </div>
          </div>
        ) : viewMode === 'agent-settings' && selectedAgent ? (
          <div className="flex-1 overflow-y-auto bg-gradient-to-br from-background to-muted/20 min-h-0">
            <div className="max-w-4xl mx-auto px-6 lg:px-8 py-8 sm:py-12">
              <div className="mb-8">
                <Button
                  variant="ghost"
                  onClick={() => setViewMode('chat')}
                  className="mb-6 hover:bg-muted/50"
                >
                  ← Back to Chat
                </Button>
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-2xl">
                    🤖
                  </div>
                  <h2 className="text-3xl font-bold text-foreground">Agent Settings</h2>
                </div>
                <p className="text-sm text-muted-foreground ml-16">Configure {selectedAgent.name}'s behavior and capabilities</p>
              </div>
              <MarkdownEditor
                initialData={{
                  name: selectedAgent.name,
                  type: selectedAgent.type,
                  systemPrompt: selectedAgent.systemPrompt,
                  description: selectedAgent.description,
                }}
                onSave={handleSaveAgent}
                onCancel={() => setViewMode('chat')}
                saving={editingSaving}
                entityType="agent"
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
