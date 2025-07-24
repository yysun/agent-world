# Cross-Agent Message Detection Feature

## Overview
The WorldChat component now detects and visually distinguishes messages where the original sender differs from the agent whose memory the message came from. This is useful for identifying cross-agent conversations and references in agent memories.

## Implementation

### Message Structure
Each message now includes:
- `sender`: The original sender of the message (preserved from agent memory)
- `fromAgentId`: The ID of the agent whose memory this message was loaded from

### Detection Logic
The `hasSenderAgentMismatch()` function detects cross-agent messages by:
1. Checking if the message has a `fromAgentId` (came from agent memory)
2. Excluding HUMAN/USER and system messages (normal for any agent's memory)
3. Using heuristics to detect when sender name doesn't match the agent ID

### Visual Styling
Cross-agent messages receive:
- CSS class `cross-agent-message` for custom styling
- Source agent indicator showing the originating agent ID
- Tooltip showing "From agent: {agentId}"

## Example Scenarios

### Scenario 1: Normal Agent Message
- Message from Agent A in Agent A's memory
- `sender`: "Agent A"
- `fromAgentId`: "agent-a"
- **Result**: No special styling (sender matches agent)

### Scenario 2: Cross-Agent Reference
- Message from Agent B found in Agent A's memory
- `sender`: "Agent B" 
- `fromAgentId`: "agent-a"
- **Result**: Special styling with "(agent-a)" indicator

### Scenario 3: Human Message
- User message found in any agent's memory
- `sender`: "HUMAN"
- `fromAgentId`: "agent-a"
- **Result**: No special styling (normal for user messages to be in agent memory)

## CSS Classes Available

The following CSS styles have been implemented in `/web/src/styles.css`:

```css
.cross-agent-message {
  /* Orange left border and light background for cross-agent messages */
  border-left: 3px solid #ff9800;
  background-color: rgba(255, 152, 0, 0.1);
  position: relative;
}

.source-agent-indicator {
  /* Styling for the agent ID indicator */
  font-size: 0.8em;
  color: #666;
  font-style: italic;
  margin-left: 0.5rem;
  opacity: 0.8;
}

.source-agent-indicator:hover {
  /* More visible on hover */
  opacity: 1;
}

.cross-agent-message::before {
  /* Link icon in top-right corner */
  content: "🔗";
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  font-size: 0.8rem;
  opacity: 0.6;
}
```

## Benefits
1. **Transparency**: Users can see when agents reference messages from other agents
2. **Context**: Understanding which agent's perspective/memory a message comes from
3. **Debugging**: Easier to track message flow between agents
4. **Conversation Analysis**: Better understanding of inter-agent communication patterns

## Testing the Feature

To see cross-agent messages in action:

1. Start the application: `npm run dev`
2. Navigate to a world with multiple agents
3. Send messages that mention different agents to create cross-agent conversations
4. Look for messages with:
   - Orange left border and light orange background
   - Agent ID in parentheses next to the sender name
   - Link icon (🔗) in the top-right corner
   - Tooltip showing "From agent: {agentId}" on hover

Cross-agent messages occur when Agent A's memory contains a message originally sent by Agent B, which can happen through agent-to-agent communication or shared conversations.
