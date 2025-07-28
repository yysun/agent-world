'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface World {
  id: string;
  name: string;
  description?: string;
}

interface Agent {
  id: string;
  name: string;
  type: string;
  systemPrompt?: string;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    scrollToBottom();
  }, [messages]);


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };


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
            {/* Show a close button if agent is selected */}
            {selectedAgent && (
              <button
                className={
                  `ml-4 text-base pb-2 transition-colors font-sans text-gray-400 hover:text-primary`
                }
                onClick={() => setSelectedAgent(null)}
                title="Back to world view"
                tabIndex={0}
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'main' ? (
            // Main content: chat messages
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'human' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-xl font-sans ${msg.sender === 'human'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card shadow text-foreground'
                      }`}
                  >
                    <div className="text-sm font-sans">
                      <strong>{msg.sender === 'human' ? 'You' : msg.sender}</strong>
                    </div>
                    <div className="mt-1 font-sans">{msg.content}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            // Settings tab content
            <div>
              {selectedAgent ? (
                <div>
                  <h3 className="text-xl font-semibold mb-2 font-sans">Agent Settings</h3>
                  <div className="mb-2 font-sans"><span className="font-medium">Name:</span> {selectedAgent.name}</div>
                  <div className="mb-2 font-sans"><span className="font-medium">Type:</span> {selectedAgent.type}</div>
                  {selectedAgent.systemPrompt && (
                    <div className="mb-2 font-sans"><span className="font-medium">System Prompt:</span> {selectedAgent.systemPrompt}</div>
                  )}
                  {/* Add more agent settings here if needed */}
                </div>
              ) : (
                <div>
                  <h3 className="text-xl font-semibold mb-2 font-sans">World Settings</h3>
                  <div className="mb-2 font-sans"><span className="font-medium">Name:</span> {world.name}</div>
                  {world.description && (
                    <div className="mb-2 font-sans"><span className="font-medium">Description:</span> {world.description}</div>
                  )}
                  {/* Add more world settings here if needed */}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Message Input (only show in main tab) */}
        {activeTab === 'main' && (
          <div className="bg-card p-6">
            <form onSubmit={sendMessage} className="flex gap-3">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="flex-1 px-4 py-2 rounded-xl border border-[color:var(--border)] focus:outline-none focus:ring-2 focus:ring-primary/40 bg-background text-foreground font-sans"
                placeholder="Type your message..."
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !message.trim()}
                className="bg-primary hover:bg-primary/80 disabled:bg-muted text-primary-foreground px-6 py-2 rounded-xl font-medium transition-colors shadow-sm font-sans"
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div >
  );
}