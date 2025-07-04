# AI World Simulation

## Overview
A multi-agent AI simulation exploring collaboration, learning, and competition between autonomous agents. Designed for rapid prototyping and exploration of emergent behaviors.

## Agent Architecture
**Each agent is a folder containing:**
- **System prompts** - Goals, tasks, and behavioral guidance
- **Memory** - Conversation history and experiences
- **Config** - LLM settings, status (active/inactive)
- **Tools/MCPs** - Callable functions

**Agent behavior:**
- Function-based implementation with mention-based message filtering
- Sequential LLM calls (one at a time) with multi-provider support (OpenAI, Anthropic, Azure, Google, XAI, Ollama)
- Tool execution when needed
- Memory updates after interactions
- Public message broadcasting through event system

## Event-Driven Messaging System
All communication flows through a unified public event system. Privacy achieved through natural language patterns (@mentions) rather than message classification.

### System Components


**Agent System**
- Function-based agent implementation with message processing as main entry point
- Integrates with LLM providers, event system, and storage modules
- Uses mention-based message filtering to prevent loops
- Supports multiple LLM providers (OpenAI, Anthropic, Azure, Google, XAI, Ollama)

**World Management**
- Function-based world state management with Map-based in-memory storage
- Core operations: world creation, agent management, agent listing and removal
- Integrates with event system for publishing world events
- Supports basic persistence via JSON file storage

**Event System**
- Centralized event handling for messages, world events, and Server-Sent Events
- Core operations: message publishing, world event publishing, message subscriptions

**Storage System**
- Function-based persistence for agent memory and data
- Core operations: agent memory loading and saving

### Message Flow
1. **Human/Agent** creates message
2. **EventManager** broadcasts to all agents
3. **Agents** decide whether to respond based on rules
4. **LLMQueue** processes responses sequentially
5. **Responses** broadcast back through system

### Response Decision Logic
Agents respond based on:
- **Always respond:** Human messages (no mentions), system messages, messages mentioning them
- **Always ignore:** Own messages, inactive status, agent messages without mentions

### Privacy Model
- **Public messages:** No @mentions → all active agents can respond
- **Private messages:** @mentions → only mentioned agents respond
- **Loop prevention:** Agents ignore messages from other agents unless mentioned

## Key Features
- **Event-driven architecture** for scalable agent communication
- **Mention-based privacy** without explicit message routing
- **Sequential LLM processing** to prevent conflicts
- **File-based agent persistence** for easy debugging
- **Real-time updates** via Server-Sent Events

## Future Exploration
- Agent learning from experiences
- Behavioral adaptation based on interactions
- Dynamic system prompt evolution
- Memory-based decision making