# WorldClass - Object-Oriented World Management

The `WorldClass` provides an object-oriented wrapper around the functional world management API from `core/index.js`. This allows for cleaner, more intuitive code when working with worlds in an object-oriented style.

## Installation

The `WorldClass` is exported from the core module:

```typescript
import { WorldClass } from './core/index.js';
```

## Usage

### Creating a WorldClass Instance

```typescript
import { WorldClass, createWorld } from './core/index.js';
import { getDefaultRootPath } from './core/storage-factory.js';

// First create a world using the functional API
const world = await createWorld(getDefaultRootPath(), {
  name: 'My World',
  description: 'A world for my agents'
});

// Then wrap it with WorldClass for OOP operations
const worldClass = new WorldClass(getDefaultRootPath(), world.id);
```

### Basic Operations

```typescript
// World operations
await worldClass.delete();                    // deleteWorld(rootPath, worldId)
await worldClass.update({ turnLimit: 10 });  // updateWorld(rootPath, worldId, updates)
await worldClass.reload();                    // getWorld(rootPath, worldId)
await worldClass.exportToMarkdown();          // exportWorldToMarkdown(rootPath, worldId)

// Properties
console.log(worldClass.id);                  // Get world ID
console.log(worldClass.path);                // Get root path
console.log(worldClass.toString());          // WorldClass(world-id)
```

### Agent Management

```typescript
// Create agent
const agent = await worldClass.createAgent({
  name: 'Assistant',
  type: 'helper',
  provider: 'openai',
  model: 'gpt-4',
  systemPrompt: 'You are a helpful assistant'
});

// Manage agents
const agents = await worldClass.listAgents();
const agent = await worldClass.getAgent('agent-name');
await worldClass.updateAgent('agent-name', { temperature: 0.8 });
await worldClass.clearAgentMemory('agent-name');
await worldClass.deleteAgent('agent-name');
```

### Chat Management

```typescript
// Chat operations
await worldClass.newChat();                           // Create new chat
await worldClass.loadChatById('chat-id');            // Load specific chat
const chats = await worldClass.listChats();          // List all chats
const chat = await worldClass.getChatData('chat-id'); // Get chat data
await worldClass.deleteChatData('chat-id');          // Delete chat

// Create chat with custom data
const chatData = await worldClass.createChatData({
  name: 'Important Conversation',
  description: 'Discussion about project requirements'
});
```

## API Reference

### Constructor

```typescript
constructor(rootPath: string, worldId: string)
```

### World Operations

| Method | Description | Equivalent Function |
|--------|-------------|-------------------|
| `delete()` | Delete world and all data | `deleteWorld(rootPath, worldId)` |
| `update(updates)` | Update world configuration | `updateWorld(rootPath, worldId, updates)` |
| `reload()` | Get fresh world data | `getWorld(rootPath, worldId)` |
| `exportToMarkdown()` | Export to markdown | `exportWorldToMarkdown(rootPath, worldId)` |
| `save()` | No-op (stateless design) | - |

### Agent Operations

| Method | Description | Equivalent Function |
|--------|-------------|-------------------|
| `createAgent(params)` | Create new agent | `createAgent(rootPath, worldId, params)` |
| `getAgent(name)` | Get agent by name | `getAgent(rootPath, worldId, name)` |
| `updateAgent(name, updates)` | Update agent | `updateAgent(rootPath, worldId, name, updates)` |
| `deleteAgent(name)` | Delete agent | `deleteAgent(rootPath, worldId, name)` |
| `listAgents()` | List all agents | `listAgents(rootPath, worldId)` |
| `clearAgentMemory(name)` | Clear agent memory | `clearAgentMemory(rootPath, worldId, name)` |

### Chat Operations

| Method | Description | Equivalent Function |
|--------|-------------|-------------------|
| `createChatData(params)` | Create chat data | `createChatData(rootPath, worldId, params)` |
| `getChatData(chatId)` | Get chat by ID | `getChatData(rootPath, worldId, chatId)` |
| `listChats()` | List all chats | `listChatHistories(rootPath, worldId)` |
| `deleteChatData(chatId)` | Delete chat | `deleteChatData(rootPath, worldId, chatId)` |
| `newChat(setAsCurrent?)` | Create new chat | `newChat(rootPath, worldId, setAsCurrent)` |
| `loadChatById(chatId, setAsCurrent?)` | Load chat | `loadChatById(rootPath, worldId, chatId, setAsCurrent)` |

### Utility Methods

| Method | Description |
|--------|-------------|
| `id` | Get world ID (readonly) |
| `path` | Get root path (readonly) |
| `toString()` | String representation |
| `toJSON()` | JSON representation |

## Comparison: Functional vs OOP

### Functional API (Current)
```typescript
import { deleteWorld, createAgent, listAgents } from './core/index.js';

await deleteWorld(rootPath, worldId);
await createAgent(rootPath, worldId, agentParams);
const agents = await listAgents(rootPath, worldId);
```

### OOP API (New)
```typescript
import { WorldClass } from './core/index.js';

const world = new WorldClass(rootPath, worldId);
await world.delete();
await world.createAgent(agentParams);
const agents = await world.listAgents();
```

## Design Philosophy

- **Stateless**: Each method call fetches fresh data from storage
- **Consistency**: Returns same types as functional API
- **Clean**: No need to pass `rootPath` and `worldId` to every method
- **Type-safe**: Full TypeScript support with proper type inference
- **Backwards Compatible**: Functional API remains unchanged

## Examples

See `/examples/world-class-usage.ts` for comprehensive usage examples and comparisons.

## Testing

Basic tests are available in `/tests/core/world-class.test.ts` to verify functionality and consistency with the functional API.
