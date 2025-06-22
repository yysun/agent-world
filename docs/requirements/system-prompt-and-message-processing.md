# System Prompt and Message Processing Requirements

## 1. System Prompt Management
- **System prompt should be saved and maintained in a separate md file**
- Store agent system prompts as individual `.md` files for better readability and editing
- File structure: `data/worlds/{world-name}/agents/{agent-name}/system-prompt.md`
- Separate from config.json for easier prompt management

## 2. Message Processing Flow
The message processing system must follow this specific event-driven flow:

### 2.1 User Input Broadcasting
- **User input should be broadcasted as MESSAGE events**
- All user input from CLI should be published as MESSAGE events
- Events should contain worldId for proper routing

### 2.2 Agent Event Handling
- **Agents should handle the events to get messages**
- Agents subscribe to MESSAGE events for their world
- Filter messages based on mention logic or broadcast rules

### 2.3 LLM Processing with Context
- **Agents should send the message along with memory/history to LLM**
- Include conversation history and context when calling LLM
- Maintain agent memory for contextual responses

### 2.4 Streaming Response Handling
- **Agents should process the SSE data from LLM and send SSE events**
- Handle streaming responses from LLM providers
- Publish SSE events with streaming content for real-time display

### 2.5 CLI Display
- **CLI should display the SSE data**
- Subscribe to SSE events and display streaming responses
- Show real-time character-by-character output from agents

## Implementation Notes
- Maintain event-driven architecture throughout the flow
- Ensure proper event filtering by worldId and agent targeting
- Preserve streaming functionality for responsive user experience
- Keep system prompts editable as markdown files
