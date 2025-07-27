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
  const [streaming, setStreaming] = useState(false);
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentSystem, setNewAgentSystem] = useState('');
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
      if (streaming) {
        // Streaming mode
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
      } else {
        // Non-streaming mode
        await fetch(`/api/worlds/${worldId}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: messageContent,
            streaming: false,
          }),
        });
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
          name: newAgentName,
          system: newAgentSystem,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAgents([...agents, data.agent]);
        setNewAgentName('');
        setNewAgentSystem('');
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading world...</div>
      </div>
    );
  }

  if (!world) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg text-gray-600">World not found</div>
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
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-80 bg-white shadow-lg flex flex-col">
        {/* Header */}
        <div className="p-6 border-b">
          <button
            onClick={() => router.push('/')}
            className="text-blue-600 hover:text-blue-800 mb-4 text-sm"
          >
            ← Back to Worlds
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{world.name}</h1>
          {world.description && (
            <p className="text-gray-600 text-sm mt-1">{world.description}</p>
          )}
        </div>

        {/* Agents Section */}
        <div className="flex-1 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Agents</h2>
            <button
              onClick={() => setShowAgentForm(!showAgentForm)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors"
            >
              + Add
            </button>
          </div>

          {/* Create Agent Form */}
          {showAgentForm && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <form onSubmit={createAgent}>
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={newAgentName}
                    onChange={(e) => setNewAgentName(e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Agent name..."
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    System Prompt
                  </label>
                  <textarea
                    value={newAgentSystem}
                    onChange={(e) => setNewAgentSystem(e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="System prompt..."
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={creating}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-3 py-1 rounded text-sm transition-colors"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAgentForm(false)}
                    className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Agents List */}
          <div className="space-y-3">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className={`bg-gray-50 rounded-lg p-3 cursor-pointer transition border ${selectedAgent?.id === agent.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent'}`}
                onClick={() => handleAgentSelect(agent)}
                tabIndex={0}
                role="button"
                aria-pressed={selectedAgent?.id === agent.id}
              >
                <h3 className="font-medium text-gray-900">{agent.name}</h3>
                {agent.systemPrompt && (
                  <p className="text-gray-600 text-sm mt-1">{agent.systemPrompt}</p>
                )}
              </div>
            ))}
            {agents.length === 0 && (
              <p className="text-gray-500 text-sm">No agents yet</p>
            )}
          </div>
        </div>

        {/* Chat Settings */}
        <div className="p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Streaming</span>
            <button
              onClick={() => setStreaming(!streaming)}
              className={`${streaming ? 'bg-blue-600' : 'bg-gray-300'
                } relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}
            >
              <span
                className={`${streaming ? 'translate-x-6' : 'translate-x-1'
                  } inline-block h-4 w-4 transform bg-white rounded-full transition-transform`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header with Tabs */}
        <div className="bg-white border-b px-6 pt-6 pb-0">
          <div className="flex items-end gap-6">
            {tabLabels.map((label, idx) => (
              <button
                key={label}
                className={`text-lg font-semibold pb-2 border-b-2 transition-colors ${
                  (activeTab === 'main' && idx === 0) || (activeTab === 'settings' && idx === 1)
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-blue-600'
                }`}
                onClick={() => handleTabClick(idx === 0 ? 'main' : 'settings')}
                tabIndex={0}
                // aria-selected removed for button
              >
                {label}
              </button>
            ))}
            {/* Show a close button if agent is selected */}
            {selectedAgent && (
              <button
                className="ml-4 text-gray-400 hover:text-gray-700 text-sm border border-gray-200 rounded px-2 py-1"
                onClick={() => setSelectedAgent(null)}
                title="Back to world view"
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
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${msg.sender === 'human'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white shadow border'
                      }`}
                  >
                    <div className="text-sm">
                      <strong>{msg.sender === 'human' ? 'You' : msg.sender}</strong>
                    </div>
                    <div className="mt-1">{msg.content}</div>
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
                  <h3 className="text-xl font-semibold mb-2">Agent Settings</h3>
                  <div className="mb-2"><span className="font-medium">Name:</span> {selectedAgent.name}</div>
                  <div className="mb-2"><span className="font-medium">Type:</span> {selectedAgent.type}</div>
                  {selectedAgent.systemPrompt && (
                    <div className="mb-2"><span className="font-medium">System Prompt:</span> {selectedAgent.systemPrompt}</div>
                  )}
                  {/* Add more agent settings here if needed */}
                </div>
              ) : (
                <div>
                  <h3 className="text-xl font-semibold mb-2">World Settings</h3>
                  <div className="mb-2"><span className="font-medium">Name:</span> {world.name}</div>
                  {world.description && (
                    <div className="mb-2"><span className="font-medium">Description:</span> {world.description}</div>
                  )}
                  {/* Add more world settings here if needed */}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Message Input (only show in main tab) */}
        {activeTab === 'main' && (
          <div className="border-t bg-white p-6">
            <form onSubmit={sendMessage} className="flex gap-3">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Type your message..."
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !message.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}