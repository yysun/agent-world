# Use Name-Based Folder Structure

## Requirement
The world and agent systems should use name (in kebab-case) as folder names, not ID-based naming.

## Details
- **World folders**: Use kebab-case version of world name for directory structure
- **Agent folders**: Use kebab-case version of agent name for directory structure
- **Maintain existing kebab-case conversion logic** in world.ts and related modules
- **Do NOT simplify** the name-to-kebab-case path management as suggested in the simplification plan

## File Structure
```
data/worlds/
  ├── default-world/           # kebab-case of "Default World"
  │   ├── config.json
  │   └── agents/
  │       ├── test-agent/      # kebab-case of "Test Agent"
  │       │   └── config.json
  │       └── my-helper-bot/   # kebab-case of "My Helper Bot"
  │           └── config.json
  └── my-test-world/          # kebab-case of "My Test World"
      ├── config.json
      └── agents/
          └── chat-assistant/ # kebab-case of "Chat Assistant"
              └── config.json
```

## Impact on Simplification Plan
- **Step 1** must be modified to preserve kebab-case directory logic
- Keep `getWorldDir()`, `findWorldDir()`, and related path functions
- Maintain `toKebabCase()` utility function usage
- Preserve world directory scanning logic for name-based lookup

## Rationale
- Human-readable folder names for easier navigation
- Consistent naming convention across the system
- Better developer experience when browsing file system
- Maintains existing proven functionality
