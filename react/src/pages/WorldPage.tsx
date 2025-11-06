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
 * - WebSocket-based real-time updates
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
 * - 2025-11-04: Redesigned with chat list sidebar and world/agents in top right
 * - 2025-11-04: Redesigned with shadcn UI components and improved layout
 * - 2025-11-04: Integrated chat design system - replaced StreamChatBox with ChatThread
 * - 2025-11-03: Created for Phase 6, adapted from Next.js world/[worldId]/page.tsx
 * - 2025-11-03: Changed from REST API to WebSocket commands
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useWorldData } from '@/hooks/useWorldData';
import { useAgentData } from '@/hooks/useAgentData';
import { useChatData } from '@/hooks/useChatData';
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
  const { state: connectionState } = useWebSocket();

  const { getWorld } = useWorldData();
  const { agents, createAgent, updateAgent, refetch: refetchAgents } = useAgentData(worldId || '');
  const { chats, messages, sendMessage, createChat, subscribeToChat } = useChatData(worldId || '', undefined);

  const [world, setWorld] = useState<{ id: string; name: string; description?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [viewMode, setViewMode] = useState<'chat' | 'world-settings' | 'agent-settings'>('chat');
  const [sending, setSending] = useState(false);

  // Agent creation
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [creating, setCreating] = useState(false);

  // Settings editing
  const [editingSaving, setEditingSaving] = useState(false);

  // Load world on mount
  useEffect(() => {
    if (!worldId) return;

    const loadWorld = async () => {
      try {
        const worldData = await getWorld(worldId);
        if (worldData) {
          setWorld(worldData);
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

  // Subscribe to chat events
  useEffect(() => {
    if (worldId && connectionState === 'connected') {
      subscribeToChat();
    }
  }, [worldId, connectionState, subscribeToChat]);

  // Handlers
  const handleSendMessage = async (content: string) => {
    if (!content.trim() || sending || connectionState !== 'connected') return;

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

  const handleChatSelect = (chat: Chat) => {
    setSelectedChat(chat);
    setViewMode('chat');
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
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/10 to-muted/30 flex">
      {/* Left Sidebar - Chat List */}
      <div className="w-72 bg-background/98 backdrop-blur-md border-r border-border/50 flex flex-col shadow-lg">
        {/* Chats Header */}
        <div className="p-5 pb-4 border-b border-border/50 bg-gradient-to-b from-muted/20 to-transparent">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-lg">💬</div>
            <h2 className="text-lg font-bold text-foreground">Chats</h2>
          </div>
          <Button
            onClick={handleNewChat}
            className="w-full justify-center shadow-sm hover:shadow-md transition-all"
            size="default"
          >
            ✨ New Chat
          </Button>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          <div className="py-1">
            {chats.map((chat) => {
              const isSelected = selectedChat?.id === chat.id;
              const chatDate = new Date(chat.createdAt);
              const now = new Date();
              const diffDays = Math.floor((now.getTime() - chatDate.getTime()) / (1000 * 60 * 60 * 24));

              let timeLabel = '';
              if (diffDays === 0) {
                timeLabel = chatDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
              } else if (diffDays === 1) {
                timeLabel = 'Yesterday';
              } else if (diffDays < 7) {
                timeLabel = `${diffDays} days ago`;
              } else {
                timeLabel = chatDate.toLocaleDateString();
              }

              return (
                <div
                  key={chat.id}
                  className={`mx-2 my-1 px-3 py-3 cursor-pointer transition-all duration-200 rounded-lg ${isSelected
                    ? 'bg-primary/15 border-l-4 border-l-primary shadow-sm scale-[0.98]'
                    : 'border-l-4 border-l-transparent hover:bg-muted/60 hover:scale-[0.99]'
                    }`}
                  onClick={() => handleChatSelect(chat)}
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <h3 className="font-semibold text-sm text-foreground truncate flex-1">
                      {chat.name || '💬 Untitled Chat'}
                    </h3>
                    <span className="text-xs text-muted-foreground/70 ml-2 shrink-0 font-medium">
                      {timeLabel}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground/80 truncate leading-relaxed">
                    {messages.length > 0 ? messages[messages.length - 1].content : 'No messages yet'}
                  </p>
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
        </div>

        {/* Back Button */}
        <div className="p-4 border-t border-border/50 bg-gradient-to-t from-muted/20 to-transparent">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
          >
            ← Back to Worlds
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-gradient-to-br from-background via-background to-muted/10">
        {viewMode === 'chat' ? (
          <>
            {/* Header with World Info and Agents */}
            <div className="bg-gradient-to-r from-background via-card/30 to-background border-b border-border/50 px-6 lg:px-8 py-6 shadow-sm">
              <div className="max-w-7xl mx-auto">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-2xl shadow-sm">
                      🌍
                    </div>
                    <div>
                      <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{world.name}</h1>
                      <p className="text-sm text-muted-foreground mt-1">
                        {world.description || 'No description'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewMode('world-settings')}
                    className="text-sm hover:bg-muted/50 shadow-sm"
                  >
                    ⚙️ Settings
                  </Button>
                </div>

                {/* Active Agents */}
                <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-muted/20 to-transparent border border-border/30">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4 block">Active Agents</span>
                  <div className="flex items-center gap-5 flex-wrap">
                    {agents.map((agent) => {
                      const isSelected = selectedAgent?.id === agent.id;
                      const initials = (agent.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'A';
                      return (
                        <div
                          key={agent.id}
                          className="flex flex-col items-center gap-2 cursor-pointer group"
                          onClick={() => handleAgentSelect(agent)}
                        >
                          <div className="relative">
                            <div className={`w-14 h-14 rounded-full bg-gradient-to-br from-primary via-primary/80 to-primary/60 text-primary-foreground flex items-center justify-center font-bold text-base transition-all duration-300 shadow-md ${isSelected ? 'ring-4 ring-primary/30 scale-110 shadow-xl' : 'group-hover:scale-110 group-hover:shadow-xl group-hover:ring-2 group-hover:ring-primary/20'
                              }`}>
                              {initials}
                            </div>
                            <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-3 border-background shadow-sm ${isSelected ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'
                              }`} />
                          </div>
                          <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">{agent.name}</span>
                        </div>
                      );
                    })}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowAgentForm(!showAgentForm)}
                      className="ml-2 h-9 text-xs font-semibold shadow-sm hover:shadow-md transition-all hover:scale-105"
                    >
                      ➕ Add Agent
                    </Button>
                  </div>
                </div>

                {/* Create Agent Form */}
                {showAgentForm && (
                  <div className="mt-4 p-5 bg-gradient-to-br from-muted/30 to-muted/10 rounded-xl border border-border/50 shadow-sm">
                    <form onSubmit={handleCreateAgent} className="flex gap-2 items-end">
                      <div className="flex-1 space-y-1.5">
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
                          className="h-9"
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={creating}
                        size="sm"
                        className="h-9"
                      >
                        {creating ? 'Creating...' : 'Create'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAgentForm(false)}
                        disabled={creating}
                        className="h-9"
                      >
                        Cancel
                      </Button>
                    </form>
                  </div>
                )}
              </div>
            </div>

            {/* Chat Messages Area */}
            <div className="flex-1 bg-gradient-to-br from-muted/10 via-transparent to-muted/20 overflow-hidden">
              <ChatThread
                worldId={worldId!}
                selectedAgent={selectedAgent}
                messages={messagesToChatMessages(messages)}
                streaming={sending}
                onSendMessage={handleSendMessage}
                disabled={connectionState !== 'connected'}
              />
            </div>
          </>
        ) : viewMode === 'world-settings' ? (
          <div className="flex-1 overflow-y-auto bg-gradient-to-br from-background to-muted/20">
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
          <div className="flex-1 overflow-y-auto bg-gradient-to-br from-background to-muted/20">
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
