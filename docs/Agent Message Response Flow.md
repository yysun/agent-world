┌────────────────────────────┐
│ 1. Agent receives message  │
└────────────┬───────────────┘
             │
             ▼
┌────────────────────────────┐
│ 2. Skip if own message     │
└────────────┬───────────────┘
             │
             ▼
┌────────────────────────────┐
│ 3. Reset LLM call count if │
│    needed (for human/world)│
└────────────┬───────────────┘
             │
             ▼
┌────────────────────────────┐
│ 4. Save incoming message   │
│    to agent memory &       │
│    persist to storage      │
└────────────┬───────────────┘
             │
             ▼
┌────────────────────────────┐
│ 5. Check shouldAgentRespond│
└────────────┬───────────────┘
      Yes    │         │ No
             ▼         ▼
┌────────────────────────────┐
│ 6. Prepare LLM input       │
│    (history, prompt, etc.) │
└────────────┬───────────────┘
             │
             ▼
┌────────────────────────────┐
│ 7. Call LLM (stream/generate)│
└────────────┬───────────────┘
             │
             ▼
┌──────────────────────────────────────────────┐
│ 8. Post-process response:                    │
│    a. Remove self-mentions                   │
│    b. If shouldAutoMention() is true:        │
│         - Prepend @sender (auto-reply tag)   │
└────────────┬─────────────────────────────────┘
             │
             ▼
┌────────────────────────────┐
│ 9. Save response to memory │
│    & persist to storage    │
└────────────┬───────────────┘
             │
             ▼
┌────────────────────────────┐
│10. Publish response to     │
│    world                   │
└────────────────────────────┘