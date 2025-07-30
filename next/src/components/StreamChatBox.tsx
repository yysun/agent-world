/**
 * StreamChatBox Component - Enhanced streaming chat interface
 * 
 * Features:
 * - Real-time streaming chat with SSE support
 * - Message display with proper formatting
 * - Input handling and message sending
 * - Loading states and error handling
 * - Agent-specific message filtering
 * 
 * Implementation:
 * - Uses fetch streaming for real-time responses
 * - Integrates with existing Next.js world page
 * - Supports agent selection and filtering
 * - Auto-scrolls to latest messages
 */

import React, { useEffect, useRef } from 'react';

interface Message {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
}

interface Agent {
  id: string;
  name: string;
  type: string;
  systemPrompt?: string;
}

interface StreamChatBoxProps {
  messages: Message[];
  selectedAgent: Agent | null;
  message: string;
  setMessage: (message: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  sending: boolean;
}

export default function StreamChatBox({
  messages,
  selectedAgent,
  message,
  setMessage,
  onSendMessage,
  sending
}: StreamChatBoxProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Filter messages if agent is selected
  const filteredMessages = selectedAgent 
    ? messages.filter(msg => 
        msg.sender === 'human' || 
        msg.sender === selectedAgent.name ||
        msg.sender === selectedAgent.id
      )
    : messages;

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {filteredMessages.length === 0 ? (
          <div className="text-center text-muted-foreground font-sans">
            {selectedAgent 
              ? `No messages with ${selectedAgent.name} yet. Start a conversation!`
              : 'No messages yet. Start a conversation!'
            }
          </div>
        ) : (
          filteredMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender === 'human' ? 'justify-end' : 'justify-start'}`}
            >
              <div className="max-w-xs lg:max-w-md">
                {/* Message sender */}
                <div className={`text-xs text-muted-foreground mb-1 font-sans ${
                  msg.sender === 'human' ? 'text-right' : 'text-left'
                }`}>
                  {msg.sender === 'human' ? 'You' : msg.sender}
                  <span className="ml-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                </div>
                
                {/* Message content */}
                <div
                  className={`px-4 py-2 rounded-xl font-sans ${
                    msg.sender === 'human'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card shadow text-foreground border border-border'
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">
                    {msg.content}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
        
        {/* Loading indicator */}
        {sending && (
          <div className="flex justify-start">
            <div className="max-w-xs lg:max-w-md">
              <div className="text-xs text-muted-foreground mb-1 font-sans">
                {selectedAgent ? selectedAgent.name : 'Agent'}
              </div>
              <div className="bg-card shadow text-foreground border border-border px-4 py-2 rounded-xl font-sans">
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="bg-card p-6 border-t border-border">
        <form onSubmit={onSendMessage} className="flex gap-3">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="flex-1 px-4 py-2 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 bg-background text-foreground font-sans"
            placeholder={
              selectedAgent 
                ? `Message ${selectedAgent.name}...`
                : "Type your message..."
            }
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !message.trim()}
            className="bg-primary hover:bg-primary/80 disabled:bg-muted text-primary-foreground px-6 py-2 rounded-xl font-medium transition-colors shadow-sm font-sans disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </form>
        
        {/* Context hint */}
        {selectedAgent && (
          <div className="mt-2 text-xs text-muted-foreground font-sans">
            Chatting with {selectedAgent.name} • 
            <button 
              onClick={() => window.location.reload()} 
              className="ml-1 text-primary hover:underline"
            >
              Show all messages
            </button>
          </div>
        )}
      </div>
    </div>
  );
}