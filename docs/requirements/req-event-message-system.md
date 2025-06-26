# Event and Message Processing System - Requirements

## Vision

Create a robust, event-driven communication system that enables seamless interaction between humans, agents, and system components while maintaining conversation quality, preventing chaos, and providing real-time feedback.

## Core Requirements

### 1. Event-Driven Architecture

**R1.1 Multi-Topic Event System**
- The system SHALL support distinct event topics for different types of communication
- Event topics MUST include: messages (conversation), sse (streaming), system (debug), world (management)
- Each event topic SHALL have strongly-typed payload structures
- The system SHALL support both local and distributed event processing

**R1.2 Asynchronous Event Processing**
- All event publishing SHALL be asynchronous to prevent blocking
- Event consumers SHALL be able to subscribe to specific topics with optional filtering
- The system SHALL maintain event history for debugging and monitoring purposes
- Event processing SHALL be fault-tolerant with graceful error handling

### 2. Message Communication System

**R2.1 Human-Agent Communication**
- Humans SHALL be able to broadcast messages to all agents in a world
- Humans SHALL be able to send direct messages to specific agents using @mention syntax
- The system SHALL support natural language @mention patterns (@agentName)
- @mentions SHALL be case-insensitive and support agent names with hyphens/underscores

**R2.2 Agent Response Management**
- Agents SHALL only respond to messages when appropriate based on routing rules
- Agents SHALL never respond to their own messages
- The system SHALL implement mention-based message routing for privacy
- Public messages (no mentions) SHALL reach all agents when sent by humans
- Private messages (with mentions) SHALL only trigger responses from mentioned agents

**R2.3 Conversation Quality Control**
- The system SHALL prevent endless agent-to-agent conversations through turn limiting
- Turn limits SHALL be based on LLM call count per agent with a default maximum of 5 consecutive LLM calls
- When turn limits are reached, the system SHALL automatically redirect control to humans
- Turn limits SHALL reset automatically when human or system messages are received
- Agents SHALL be able to explicitly pass control to humans using pass commands

### 3. Real-Time Streaming System

**R3.1 Live Response Display**
- The system SHALL provide real-time streaming of agent responses as they generate
- Streaming SHALL support multiple concurrent agents responding simultaneously
- Each agent's streaming response SHALL be visually distinct and positioned independently
- The system SHALL display progress indicators during response generation

**R3.2 Token Usage Tracking**
- The system SHALL estimate and display input token usage from conversation context
- The system SHALL count and display output tokens in real-time during streaming
- Token information SHALL be presented with clear visual indicators (↑ input, ↓ output)
- Token counting SHALL be accurate for billing and performance monitoring

**R3.3 Content Preview and Final Display**
- During streaming, the system SHALL show truncated content previews on single lines
- After streaming completion, the system SHALL display full multi-line content
- Preview updates SHALL not interfere with ongoing user input or other agent streams
- The system SHALL gracefully handle streaming errors with appropriate visual feedback

### 4. Agent Intelligence and Filtering

**R4.1 Smart Message Routing**
- Agents SHALL analyze message content to determine if they should respond
- The system SHALL implement first-mention-only logic to reduce response noise
- Only the first mentioned agent in a message SHALL respond to prevent multiple responses
- Malformed mentions SHALL be ignored and treated as public messages

**R4.2 Context-Aware Decision Making**
- Agents SHALL consider conversation history when deciding whether to respond
- The system SHALL detect conversation patterns that indicate turn limits are needed
- Agents SHALL have access to sufficient context for meaningful responses
- System messages SHALL always be processed by all agents regardless of mentions

**R4.3 Automatic Control Mechanisms**
- Agents SHALL automatically add @mentions when replying to other agents
- The system SHALL detect pass commands in agent responses and hand control to humans
- Turn counters SHALL reset automatically when humans or system send messages
- The system SHALL prevent agent responses when LLM call limits are exceeded
- LLM call counts SHALL be tracked per agent and incremented before each LLM invocation

### 5. Memory and Persistence

**R5.1 Conversation Memory**
- Each agent SHALL maintain persistent conversation history in standard LLM format
- Memory files SHALL be compatible with LLM provider APIs (role, content, timestamp)
- The system SHALL automatically save new conversation turns to agent memory
- Memory SHALL be accessible for context loading and conversation history display

**R5.2 Passive Memory Collection**
- All agents SHALL save all incoming messages to their memory regardless of mention status
- Message saving SHALL be independent of LLM processing decisions
- Agents SHALL maintain complete conversation context for better future responses
- Own messages SHALL NOT be saved to prevent memory duplication
- Passive memory SHALL use standard user message format with sender attribution

**R5.3 System State Management**
- The system SHALL maintain world state and agent configurations persistently
- Event history SHALL be preserved for debugging and system monitoring
- Configuration changes SHALL be persisted across system restarts
- The system SHALL support backup and recovery of conversation data
- Agent LLM call counts and timestamps SHALL be persisted and tracked

### 6. User Experience

**R6.1 Intuitive Interaction**
- Users SHALL interact with agents using natural @mention syntax
- The system SHALL provide clear visual feedback for all user actions
- Command responses SHALL be immediate and informative
- Error messages SHALL be helpful and guide users toward correct usage

**R6.2 Real-Time Feedback**
- Users SHALL see immediate indication when agents begin responding
- Progress indicators SHALL show which agents are active and their response progress
- Token usage SHALL be visible to help users understand system resource consumption
- Debug information SHALL be available but not intrusive to normal operation

**R6.3 Conversation Flow Control**
- Users SHALL always have clear paths to regain control of conversations
- The system SHALL prevent agent conversations from becoming unmanageable
- Users SHALL be able to see conversation history and understand agent decision-making
- Recovery from error states SHALL be automatic and transparent

### 7. System Reliability

**R7.1 Error Handling and Recovery**
- The system SHALL gracefully handle LLM timeouts and connection failures
- Streaming errors SHALL be visually indicated without breaking the user interface
- Invalid input SHALL be handled gracefully with helpful error messages
- The system SHALL automatically recover from transient failures

**R7.2 Performance Requirements**
- Event processing SHALL not introduce noticeable latency in user interactions
- Streaming updates SHALL appear within 100ms of content generation
- Multiple concurrent agent responses SHALL not degrade system performance
- Memory usage SHALL remain bounded during long conversations

**R7.3 Scalability**
- The system SHALL support multiple worlds with independent agent populations
- Event processing SHALL scale to handle increased agent and user activity
- The architecture SHALL support future distributed deployment scenarios
- Resource cleanup SHALL prevent memory leaks during extended operation

### 8. Integration and Extensibility

**R8.1 LLM Provider Integration**
- The system SHALL support multiple LLM providers (OpenAI, Anthropic, Google, etc.)
- Provider switching SHALL be seamless without conversation disruption
- API key management SHALL be secure and configurable
- Different agents SHALL be able to use different LLM providers simultaneously

**R8.2 CLI and Interface Support**
- The system SHALL provide both interactive CLI and programmatic interfaces
- CLI commands SHALL be consistent and discoverable through help systems
- Piped input SHALL be supported for automation and scripting
- Background processing SHALL not interfere with interactive usage

**R8.3 Monitoring and Debugging**
- The system SHALL provide comprehensive debug logging through the event system
- Debug information SHALL be structured and filterable
- System administrators SHALL have visibility into agent decision-making processes
- Performance metrics SHALL be available for system optimization

## Success Criteria

### Functional Success
- Users can naturally direct conversations to specific agents using @mentions
- Agents collaborate effectively without creating conversation chaos
- System automatically prevents runaway agent conversations through LLM call limiting
- Real-time streaming provides immediate feedback on agent responses
- Turn limits and pass commands provide reliable human control mechanisms
- All agents maintain complete conversation context through passive memory
- Agent responses show improved context awareness from conversation history

### Performance Success
- Sub-100ms response time for streaming content updates
- Zero noticeable latency for event processing
- Stable memory usage during extended conversations
- Reliable operation under concurrent multi-agent scenarios

### User Experience Success
- Intuitive @mention syntax feels natural to users
- Visual indicators clearly communicate system state and progress
- Error recovery is automatic and transparent
- Debug information aids troubleshooting without cluttering normal use

### Technical Success
- Event-driven architecture supports future distributed deployment
- Standard LLM message format ensures provider compatibility
- Comprehensive test coverage validates all core functionality
- System architecture supports extensibility and maintenance
- LLM call-based turn limiting provides accurate conversation control
- Passive memory system maintains agent context without performance impact
- Agent state persistence includes LLM usage tracking for monitoring

## Out of Scope

### Current Release Exclusions
- Advanced agent orchestration and workflow management
- Multi-user collaborative environments
- Voice or video communication interfaces
- Advanced AI reasoning or planning capabilities
- Enterprise-grade user authentication and authorization
- Custom agent programming or scripting languages

### Future Considerations
- Web-based user interfaces
- Mobile application support
- Advanced analytics and conversation insights
- Integration with external systems and APIs
- Multi-tenant deployments
- Advanced security and compliance features

## Constraints and Assumptions

### Technical Constraints
- Node.js/TypeScript runtime environment
- Local file system for initial storage (future distributed storage support)
- Terminal-based user interface for CLI interactions
- EventEmitter-based event system with future Dapr support capability

### Operational Assumptions
- Single-user operation for initial deployment
- Trusted local environment for API key storage
- Reliable internet connectivity for LLM provider access
- Sufficient local storage for conversation history and system state

### Design Assumptions
- Users prefer natural language interaction over complex command structures
- Agent responses should be immediate and visible to maintain engagement
- Conversation privacy can be achieved through mention-based routing
- LLM call-based turn limits are more accurate than message pattern analysis
- Standard LLM message formats provide sufficient conversation context
- Passive memory collection improves agent context without affecting performance
- All agents benefit from observing complete conversation history

This requirements specification defines the essential functionality needed for a robust event-driven agent communication system while maintaining flexibility for future enhancements and scalability.
