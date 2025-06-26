# Agent Passive Memory Requirements

## What
Update agent message event handling so that agents save all messages to memory (even when not mentioned) but only process with LLM when mentioned.

## Current Behavior
- Agents ignore messages where they are not mentioned
- Messages not mentioned are not saved to memory
- Messages not mentioned are not sent to LLM
- Agents have no context about conversations they didn't participate in

## Required Behavior
- All messages should be saved to agent memory as user messages
- Only messages where agent is mentioned should be sent to LLM for processing
- Agents maintain full conversation context for better responses when called upon
- Memory storage should be consistent across all agents in a world

## Example
Message: `@a1, you and @a2 are agents`

**Agent a1 behavior:**
- Save message to memory ✓
- Process with LLM ✓ (first mention)
- Generate response

**Agent a2 behavior:**
- Save message to memory ✓
- Process with LLM ✗ (not first mention)
- No response generated

Both agents now have the message in their conversation history for future context.

## Benefits
- Agents have complete conversation context
- Better responses when agents are mentioned after being silent
- Improved conversation flow and continuity
- Agents can reference previous conversations appropriately

## Scope
- Update agent message processing logic in agent.ts
- Modify shouldRespondToMessage function behavior
- Ensure memory saving happens independently of LLM processing
- Maintain existing mention-based response logic
