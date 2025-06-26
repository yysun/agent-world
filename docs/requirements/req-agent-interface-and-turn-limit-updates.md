# Agent Interface and Turn Limit Logic Requirements

## Overview
Update the Agent interface to remove metadata field and add LLM call tracking, then refactor turn limit logic to use LLM call count instead of message history analysis.

## Requirements

### 1. Agent Interface Changes
- **Remove**: `metadata?: Record<string, any>` field from Agent interface
- **Move**: Any existing metadata properties to Agent level (if any are commonly used)
- **Add**: New field to track LLM call count for turn limit logic

### 2. Turn Limit Logic Refactor
- **Current**: Uses message history analysis to detect consecutive agent messages
- **New**: Track number of LLM calls per agent and use count-based turn limit
- **Keep**: Reset logic and notification behavior unchanged
- **Keep**: Turn limit message publishing and ignore logic unchanged

### 3. Focus Areas
- What: Interface structure changes and call counting mechanism
- What: Turn limit detection based on LLM calls instead of message patterns
- What: Maintain existing reset and notification behavior
- Not How: Implementation details will be determined in the plan phase

## Key Considerations
- Maintain backward compatibility where possible
- Ensure turn limit notifications work the same way
- Keep existing reset mechanisms functional
- Track LLM calls accurately across agent lifecycle
