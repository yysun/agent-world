# Message Privacy and Conversation Management - Requirements

## Vision

Create an intelligent conversation management system that enables natural agent interactions while preventing chaos, maintaining privacy, and ensuring human oversight remains accessible.

## Core Problems to Solve

### 1. Message Chaos Prevention
**Problem**: Agents can overwhelm the system with endless back-and-forth conversations.
**Goal**: Prevent infinite loops while allowing meaningful multi-agent collaboration.

### 2. Privacy and Relevance
**Problem**: All agents receive all messages, creating noise and privacy concerns.
**Goal**: Ensure agents only participate in conversations where they're needed or mentioned.

### 3. Human Control and Accessibility
**Problem**: Agents can get stuck in loops with no easy way for humans to regain control.
**Goal**: Provide simple mechanisms for agents to hand control back to humans.

### 4. Natural Mention-Based Interaction
**Problem**: Current system lacks intuitive ways to direct messages to specific agents.
**Goal**: Support natural @mention syntax for targeted communication.

## Desired Behaviors

### Agent Conversation Flow
- **Natural Collaboration**: Agents can mention each other for collaborative problem-solving
- **Controlled Interactions**: Prevent runaway conversations that exclude human oversight
- **Graceful Handoffs**: Agents can recognize when to pass control back to humans
- **Context Awareness**: Agents understand when they're being addressed directly vs. part of a group discussion

### Human Experience
- **Clear Control**: Humans can easily direct conversations to specific agents
- **Automatic Safeguards**: System automatically prevents agent conversations from becoming unmanageable
- **Easy Recovery**: Simple ways to regain control when agent interactions become unproductive
- **Privacy Respect**: Private conversations with specific agents remain private

### System Behavior
- **Smart Routing**: Messages reach only the agents that need to see them
- **Loop Prevention**: Automatic detection and intervention for repetitive conversations
- **Graceful Degradation**: When limits are reached, system gracefully redirects to human control
- **Topic Isolation**: Different types of messages (system, user, streaming) handled appropriately

## Key Concepts

### Message Privacy Levels
- **Public Conversations**: Open discussions visible to all agents in the world
- **Private Conversations**: Targeted discussions using @mentions, visible only to mentioned participants
- **System Messages**: Administrative messages that don't trigger agent responses

### Conversation Control Mechanisms
- **Turn Limiting**: Prevent endless back-and-forth between agents (20 consecutive agent message limit per world)
- **Pass Commands**: Allow agents to explicitly hand control to humans using `<world>pass</world>` syntax
- **Auto-Intervention**: System automatically intervenes when conversations become unproductive
- **Reset Triggers**: Human or system messages that reset conversation counters to zero

### Agent Mention System
- **Natural Syntax**: Use familiar @agentName pattern for directing messages (e.g., @alice, @assistant)
- **Name-Based Only**: Use agent names only (not IDs) for human-friendly interactions
- **Auto-Response**: Mentioned agents automatically add @mentions when replying to other agents
- **Case-Insensitive**: Support both @Alice and @alice mention formats

## Scope and Boundaries

### In Scope
- **Message Topic**: Focus on user message conversations only
- **Agent Interactions**: How agents respond to each other and humans
- **Conversation Limits**: Preventing infinite loops and ensuring human accessibility
- **Privacy Controls**: Ensuring targeted messages reach intended recipients only

### Out of Scope
- **System Messages**: Leave existing system/administrative message handling unchanged
- **Streaming Data**: Keep current real-time data streaming behavior
- **Performance Optimization**: Focus on behavior, not performance tuning
- **Error Handling**: Focus on happy path scenarios first

## Success Vision

### What Good Looks Like
1. **Natural Conversations**: Users can easily direct agents using @mentions
2. **Productive Collaboration**: Agents can work together without human micromanagement
3. **No Chaos**: Conversations never spiral out of control or become unmanageable
4. **Privacy Respected**: Private discussions stay private
5. **Human Control**: Users always have clear paths to regain conversation control
6. **Predictable Behavior**: System behavior is consistent and understandable

### Behavioral Outcomes
- Agents only respond when they should (mentioned or in public discussions)
- Conversations automatically pause and redirect to humans when limits are reached
- Private conversations with specific agents remain private from other agents
- Agents naturally mention each other when collaborating
- Human users feel in control of the conversation flow

## Implementation Philosophy

### Incremental Approach
Start with agent-level improvements before building system-level infrastructure.

### Simplicity First
Prefer simple solutions that solve 90% of use cases over complex solutions that handle every edge case.

### Human-Centric Design
Always prioritize human user experience and control over system efficiency.

### Graceful Failure
When things go wrong, the system should degrade gracefully and return control to humans.

## Open Questions

1. Should there be different turn limits for different types of agent conversations?
2. How should the system handle agents that don't respond when mentioned?
3. Should agents be able to mention humans using @human, or is that reserved for system use?
4. What should happen when an agent mentions a non-existent agent name?
5. Should private conversations be logged differently than public ones?

## Technical Specifications

### Implementation Approach
- **Phase 1**: Enhance agent-level message filtering and response logic
- **Phase 2**: Add event-bus level selective routing for performance optimization
- **Rationale**: Agent-level changes are less risky and can be implemented incrementally

### Turn Limiting Details
- **Limit**: 20 consecutive messages from any agents in a world
- **Counter Storage**: In-memory per world (non-persistent initially)
- **Reset Conditions**: Any message from human or system resets counter to 0
- **Violation Behavior**: Block agent response, inject @human redirect message

### Pass Command Details
- **Syntax**: Agent responses containing `<world>pass</world>` anywhere in content
- **Behavior**: Replace agent response with "@human [Agent Name] is passing control to you"
- **Counter Reset**: Pass commands reset turn counter to 0

### Error Handling
- **Malformed @mentions**: Ignore (@@agent, @nonexistent, @)
- **Non-existent agents**: Treat as public message (no routing to non-existent agent)
- **Self-mentions**: Agents ignore @mentions of themselves
- **System recovery**: Always provide path back to human control
