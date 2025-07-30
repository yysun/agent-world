'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MarkdownMemory from '../../../components/MarkdownMemory';
import MarkdownEditor from '../../../components/MarkdownEditor';
import StreamChatBox from '../../../components/StreamChatBox';

interface World {
  id: string;
  name: string;
  description?: string;
  memory?: string;
}

interface Agent {
  id: string;
  name: string;
  type: string;
  systemPrompt?: string;
  description?: string;
  memory?: string;
}

interface Message {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
}

export default function WorldPage({ params }: { params: Promise<{ worldId: string }> }) {
  // --- UI State for agent selection and tab ---
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [activeTab, setActiveTab] = useState<'main' | 'settings'>('main');
  const [world, setWorld] = useState<World | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [creating, setCreating] = useState(false);
  const [worldId, setWorldId] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingSaving, setEditingSaving] = useState(false);
  const router = useRouter();

  // --- All hooks must be before any return ---

  useEffect(() => {
    const initializeParams = async () => {
      const resolvedParams = await params;
      setWorldId(resolvedParams.worldId);
    };
    initializeParams();
  }, [params]);

  useEffect(() => {
    if (worldId) {
      // Reset agent selection when world changes
      setSelectedAgent(null);
      setActiveTab('main');
      setIsEditing(false);

      // Inline loadWorld
      (async () => {
        try {
          const response = await fetch(`/api/worlds/${worldId}`);
          if (response.ok) {
            const data = await response.json();
            setWorld(data.world);
          } else if (response.status === 404) {
            router.push('/');
          }
        } catch (error) {
          console.error('Error loading world:', error);
        } finally {
          setLoading(false);
        }
      })();
      // Inline loadAgents
      (async () => {
        try {
          const response = await fetch(`/api/worlds/${worldId}/agents`);
          if (response.ok) {
            const data = await response.json();
            setAgents(data.agents || []);
          }
        } catch (error) {
          console.error('Error loading agents:', error);
        }
      })();
    }
  }, [worldId, router]);


  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sending) return;

    setSending(true);
    const messageContent = message;
    setMessage('');

    // Add user message immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      content: messageContent,
      sender: 'human',
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      // Streaming mode by default
      const response = await fetch(`/api/worlds/${worldId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageContent,
          streaming: true,
        }),
      });

      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'message' && data.content) {
                  const agentMessage: Message = {
                    id: Date.now().toString() + Math.random(),
                    content: data.content,
                    sender: data.sender || 'agent',
                    timestamp: new Date().toISOString(),
                  };
                  setMessages(prev => [...prev, agentMessage]);
                }
              } catch {
                // Ignore JSON parse errors
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const createAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim()) return;

    setCreating(true);
    try {
      const response = await fetch(`/api/worlds/${worldId}/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newAgentName
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAgents([...agents, data.agent]);
        setNewAgentName('');
        setShowAgentForm(false);
      }
    } catch (error) {
      console.error('Error creating agent:', error);
    } finally {
      setCreating(false);
    }
  };

  // Save world data
  const saveWorld = async (data: Record<string, unknown>) => {
    setEditingSaving(true);
    try {
      const response = await fetch(`/api/worlds/${worldId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const updatedWorld = await response.json();
        setWorld(updatedWorld.world);
        setIsEditing(false);
      } else {
        throw new Error('Failed to save world');
      }
    } catch (error) {
      console.error('Error saving world:', error);
      // TODO: Show error message to user
    } finally {
      setEditingSaving(false);
    }
  };

  // Save agent data
  const saveAgent = async (data: Record<string, unknown>) => {
    if (!selectedAgent) return;
    
    setEditingSaving(true);
    try {
      const response = await fetch(`/api/worlds/${worldId}/agents/${selectedAgent.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const updatedAgent = await response.json();
        setAgents(agents.map(agent => 
          agent.id === selectedAgent.id ? updatedAgent.agent : agent
        ));
        setSelectedAgent(updatedAgent.agent);
        setIsEditing(false);
      } else {
        throw new Error('Failed to save agent');
      }
    } catch (error) {
      console.error('Error saving agent:', error);
      // TODO: Show error message to user
    } finally {
      setEditingSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center font-sans">
        <div className="text-lg text-muted-foreground">Loading world...</div>
      </div>
    );
  }

  if (!world) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center font-sans">
        <div className="text-lg text-muted-foreground">World not found</div>
      </div>
    );
  }

  // --- Tab labels and handlers ---
  const tabLabels = selectedAgent
    ? [selectedAgent.name, 'Agent Settings']
    : [world.name, 'World Settings'];

  // --- Tab click handler ---
  const handleTabClick = (tab: 'main' | 'settings') => {
    setActiveTab(tab);
  };

  // --- Agent selection handler ---
  const handleAgentSelect = (agent: Agent) => {
    setSelectedAgent(agent);
    setActiveTab('main');
    setIsEditing(false); // Reset editing state when switching agents
  };

  // --- Edit handlers ---
  const handleEdit = () => {
    setIsEditing(true);
    setActiveTab('settings');
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };




  return (
    <div className="min-h-screen bg-background flex font-sans mx-3 px-2">
      {/* Sidebar */}
      <div className="w-80 bg-card shadow-xl flex flex-col">
        {/* Header */}
        <div className="p-6 bg-card rounded-xl mb-4">
          <button
            onClick={() => router.push('/')}
            className="text-muted-foreground hover:underline text-sm font-medium mb-2"
          >
            ← Back to Worlds
          </button>
          <h1 className="text-2xl font-bold text-foreground font-sans">{world.name}</h1>
          {world.description && (
            <p className="text-muted-foreground text-sm mt-1 font-sans">{world.description}</p>
          )}
        </div>

        {/* Agents Section: header, form, and list all in one container */}
        <div className="flex-1 p-6 bg-card rounded-b-xl border-t border-gray-200 dark:border-gray-700">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-foreground font-sans">Agents</h2>
            <button
              onClick={() => setShowAgentForm(!showAgentForm)}
              className="bg-primary hover:bg-primary/80 text-primary-foreground px-3 py-1 rounded-lg text-sm transition-colors shadow-sm font-medium"
            >
              + Add
            </button>
          </div>
          {/* Create Agent Form (inline above list) */}
          {showAgentForm && (
            <div className="bg-muted rounded-xl p-4 mb-4 border border-primary/30">
              <form onSubmit={createAgent}>
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
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={creating}
                    className="bg-primary hover:bg-primary/80 disabled:bg-muted text-primary-foreground px-3 py-1 rounded-lg text-sm transition-colors shadow-sm font-medium"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAgentForm(false)}
                    className="bg-muted hover:bg-muted/80 text-foreground px-3 py-1 rounded-lg text-sm transition-colors shadow-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
          {/* Full-width divider above agent list */}
          <div className="-mx-6 border-t border-gray-200 dark:border-gray-700" />
          {/* Agents List */}
          <div className="pt-4 space-y-3">
            {agents.map((agent) => {
              // Get 2-letter abbreviation (first 2 uppercase letters of name, or fallback to 'AG')
              const abbr = (agent.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'AG';
              const isSelected = selectedAgent?.id === agent.id;
              return (
                <div
                  key={agent.id}
                  className={
                    `bg-muted rounded-xl py-3 cursor-pointer transition font-sans flex items-center gap-3` // removed ring
                  }
                  onClick={() => handleAgentSelect(agent)}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 flex items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-base shrink-0">
                    {abbr}
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-medium font-sans ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>{agent.name}</h3>
                    {agent.systemPrompt && (
                      <p className="text-muted-foreground text-sm mt-1 font-sans">{agent.systemPrompt}</p>
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
        <div className="bg-card px-6 pt-6 pb-0 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-end justify-between">
            <div className="flex items-end gap-6">
              {tabLabels.map((label, idx) => (
                <button
                  key={label}
                  className={`text-base pb-2 transition-colors font-sans ${((activeTab === 'main' && idx === 0) || (activeTab === 'settings' && idx === 1))
                    ? 'text-foreground'
                    : 'text-gray-400 hover:text-primary'
                    }`}
                  onClick={() => handleTabClick(idx === 0 ? 'main' : 'settings')}
                  tabIndex={0}
                >
                  {label}
                </button>
              ))}
            </div>
            
            <div className="flex items-center gap-3 pb-2">
              {/* Edit button - only show in settings tab and not in editing mode */}
              {activeTab === 'settings' && !isEditing && (
                <button
                  onClick={handleEdit}
                  className="text-gray-400 hover:text-primary transition-colors"
                  title={`Edit ${selectedAgent ? 'agent' : 'world'}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              
              {/* Show a close button if agent is selected */}
              {selectedAgent && (
                <button
                  className="text-gray-400 hover:text-primary transition-colors font-sans"
                  onClick={() => {
                    setSelectedAgent(null);
                    setIsEditing(false);
                  }}
                  title="Back to world view"
                  tabIndex={0}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'main' ? (
            // Main content: enhanced streaming chat
            <StreamChatBox
              messages={messages}
              selectedAgent={selectedAgent}
              message={message}
              setMessage={setMessage}
              onSendMessage={sendMessage}
              sending={sending}
            />
          ) : (
            // Settings tab content with markdown display and editing
            <div className="h-full overflow-y-auto p-6">
              {isEditing ? (
                // Edit mode - show MarkdownEditor
                selectedAgent ? (
                  <MarkdownEditor
                    initialData={{
                      name: selectedAgent.name,
                      type: selectedAgent.type,
                      systemPrompt: selectedAgent.systemPrompt || '',
                      description: selectedAgent.description || selectedAgent.memory || ''
                    }}
                    onSave={saveAgent}
                    onCancel={handleCancelEdit}
                    saving={editingSaving}
                    entityType="agent"
                  />
                ) : (
                  <MarkdownEditor
                    initialData={{
                      name: world!.name,
                      description: world!.description || world!.memory || ''
                    }}
                    onSave={saveWorld}
                    onCancel={handleCancelEdit}
                    saving={editingSaving}
                    entityType="world"
                  />
                )
              ) : (
                // View mode - show markdown memory and basic info
                <div className="space-y-6">
                  {selectedAgent ? (
                    <div>
                      <h3 className="text-xl font-semibold mb-4 font-sans">Agent: {selectedAgent.name}</h3>
                      
                      {/* Basic agent info */}
                      <div className="bg-muted rounded-lg p-4 mb-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium text-foreground">Type:</span>
                            <span className="ml-2 text-muted-foreground">{selectedAgent.type}</span>
                          </div>
                          {selectedAgent.systemPrompt && (
                            <div className="md:col-span-2">
                              <span className="font-medium text-foreground">System Prompt:</span>
                              <div className="ml-2 text-muted-foreground mt-1 p-2 bg-background rounded text-xs font-mono">
                                {selectedAgent.systemPrompt}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Agent memory/description as markdown */}
                      <MarkdownMemory 
                        content={selectedAgent.description || selectedAgent.memory || ''} 
                        title="Memory & Description"
                      />
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-xl font-semibold mb-4 font-sans">World: {world!.name}</h3>
                      
                      {/* Basic world info */}
                      <div className="bg-muted rounded-lg p-4 mb-6">
                        <div className="text-sm">
                          <span className="font-medium text-foreground">ID:</span>
                          <span className="ml-2 text-muted-foreground font-mono">{world!.id}</span>
                        </div>
                      </div>

                      {/* World description/memory as markdown */}
                      <MarkdownMemory 
                        content={world!.description || world!.memory || ''} 
                        title="Description & Memory"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div >
  );
}