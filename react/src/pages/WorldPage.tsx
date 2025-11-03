/**
 * WorldPage - World detail with agents and chat
 * 
 * Purpose: Main interaction page for a specific world
 * 
 * Features:
 * - Display world details with sidebar
 * - List and manage agents
 * - Real-time chat interface
 * - Tab-based UI (main view / settings editor)
 * - WebSocket-based real-time updates
 * 
 * Implementation:
 * - Uses useWorldData, useAgentData, useChatData hooks
 * - Uses StreamChatBox for chat interface
 * - Uses MarkdownEditor for world/agent settings
 * - Layout: Sidebar (agents) + Main area (chat/settings)
 * 
 * Changes:
 * - 2025-11-03: Created for Phase 6, adapted from Next.js world/[worldId]/page.tsx
 * - 2025-11-03: Changed from REST API to WebSocket commands
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useWorldData } from '@/hooks/useWorldData';
import { useAgentData } from '@/hooks/useAgentData';
import { useChatData } from '@/hooks/useChatData';
import StreamChatBox from '@/components/StreamChatBox.tsx';
import MarkdownEditor from '@/components/MarkdownEditor.tsx';
import Loading from '@/components/Loading.tsx';
import type { Agent } from '@/types';

export default function WorldPage() {
  const { worldId } = useParams<{ worldId: string }>();
  const navigate = useNavigate();
  const { state: connectionState } = useWebSocket();

  const { getWorld } = useWorldData();
  const { agents, createAgent, updateAgent, refetch: refetchAgents } = useAgentData(worldId || '');
  const { messages, sendMessage, subscribeToChat } = useChatData(worldId || '', undefined);

  const [world, setWorld] = useState<{ id: string; name: string; description?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [activeTab, setActiveTab] = useState<'main' | 'settings'>('main');
  const [message, setMessage] = useState('');
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
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sending || connectionState !== 'connected') return;

    setSending(true);
    try {
      await sendMessage(message, selectedAgent?.id);
      setMessage('');
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
    setActiveTab('main');
  };

  const handleSaveWorld = async (data: Record<string, unknown>) => {
    if (!worldId || !world) return;

    setEditingSaving(true);
    try {
      // World update via hook (needs implementation)
      console.log('Save world:', data);
      // TODO: Call updateWorld from useWorldData
      setActiveTab('main');
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
      setActiveTab('main');
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
        <div className="text-lg text-muted-foreground font-sans">World not found</div>
      </div>
    );
  }

  const tabLabels = selectedAgent
    ? [selectedAgent.name, 'Agent Settings']
    : [world.name, 'World Settings'];

  return (
    <div className="min-h-screen bg-background flex font-sans mx-3 px-2">
      {/* Sidebar */}
      <div className="w-80 bg-card shadow-xl flex flex-col">
        {/* Header */}
        <div className="p-6 bg-card rounded-xl mb-4">
          <button
            onClick={() => navigate('/')}
            className="text-muted-foreground hover:underline text-sm font-medium mb-2"
          >
            ← Back to Worlds
          </button>
          <h1 className="text-2xl font-bold text-foreground font-sans">{world.name}</h1>
          {world.description && (
            <p className="text-muted-foreground text-sm mt-1 font-sans">{world.description}</p>
          )}
        </div>

        {/* Agents Section */}
        <div className="flex-1 p-6 bg-card rounded-b-xl border-t border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-foreground font-sans">Agents</h2>
            <button
              onClick={() => setShowAgentForm(!showAgentForm)}
              className="bg-primary hover:bg-primary/80 text-primary-foreground px-3 py-1 rounded-lg text-sm transition-colors shadow-sm font-medium"
            >
              + Add
            </button>
          </div>

          {/* Create Agent Form */}
          {showAgentForm && (
            <div className="bg-muted rounded-xl p-4 mb-4 border border-primary/30">
              <form onSubmit={handleCreateAgent}>
                <div className="mb-3">
                  <label className="block text-sm font-medium text-foreground mb-1 font-sans">
                    Name
                  </label>
                  <input
                    type="text"
                    value={newAgentName}
                    onChange={(e) => setNewAgentName(e.target.value)}
                    className="w-full px-2 py-1 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 bg-background text-foreground font-sans"
                    placeholder="Agent name..."
                    required
                    disabled={creating}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={creating}
                    className="bg-primary hover:bg-primary/80 disabled:bg-muted text-primary-foreground px-3 py-1 rounded-lg text-sm transition-colors shadow-sm font-medium disabled:cursor-not-allowed"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAgentForm(false)}
                    disabled={creating}
                    className="bg-muted hover:bg-muted/80 text-foreground px-3 py-1 rounded-lg text-sm transition-colors shadow-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="-mx-6 border-t border-gray-200 dark:border-gray-700" />

          {/* Agents List */}
          <div className="pt-4 space-y-3">
            {agents.map((agent) => {
              const abbr = (agent.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'AG';
              const isSelected = selectedAgent?.id === agent.id;
              return (
                <div
                  key={agent.id}
                  className="bg-muted rounded-xl py-3 px-3 cursor-pointer transition font-sans flex items-center gap-3"
                  onClick={() => handleAgentSelect(agent)}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                >
                  <div className="w-9 h-9 flex items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-base shrink-0">
                    {abbr}
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-medium font-sans ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {agent.name}
                    </h3>
                    {agent.systemPrompt && (
                      <p className="text-muted-foreground text-sm mt-1 font-sans line-clamp-1">
                        {agent.systemPrompt}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {agents.length === 0 && (
              <p className="text-muted-foreground text-sm font-sans">No agents yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header with Tabs */}
        <div className="bg-card shadow-md">
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('main')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'main'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              {tabLabels[0]}
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'settings'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              {tabLabels[1]}
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 bg-background">
          {activeTab === 'main' ? (
            <StreamChatBox
              messages={messages}
              selectedAgent={selectedAgent}
              message={message}
              setMessage={setMessage}
              onSendMessage={handleSendMessage}
              sending={sending}
              connectionState={connectionState}
            />
          ) : (
            <div className="h-full p-6">
              {selectedAgent ? (
                <MarkdownEditor
                  initialData={{
                    name: selectedAgent.name,
                    type: selectedAgent.type,
                    systemPrompt: selectedAgent.systemPrompt,
                    description: selectedAgent.description,
                  }}
                  onSave={handleSaveAgent}
                  onCancel={() => setActiveTab('main')}
                  saving={editingSaving}
                  entityType="agent"
                />
              ) : (
                <MarkdownEditor
                  initialData={{
                    name: world.name,
                    description: world.description,
                  }}
                  onSave={handleSaveWorld}
                  onCancel={() => setActiveTab('main')}
                  saving={editingSaving}
                  entityType="world"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
