# WorldClass - Object-Oriented World Management

The `WorldClass` provides an object-oriented wrapper around the functional world management API from `core/index.js`. This allows for cleaner, more intuitive code when working with worlds in an object-oriented style.

> **Updated**: Documentation now reflects the actual implementation with simplified constructor (worldId only), automatic path management via storage factory, and streamlined chat operations.

## Installation

The `WorldClass` is exported from the core module:

```typescript
import { WorldClass } from './core/index.js';
```

## Usage

### Creating a WorldClass Instance

```typescript
import { WorldClass, createWorld } from './core/index.js';

// First create a world using the functional API
const world = await createWorld({
  name: 'My World',
  description: 'A world for my agents'
});

// Then wrap it with WorldClass for OOP operations
const worldClass = new WorldClass(world.id);
```

### Basic Operations

```typescript
// World operations
await worldClass.delete();                    // deleteWorld(worldId)
await worldClass.update({ turnLimit: 10 });  // updateWorld(worldId, updates)
await worldClass.reload();                    // getWorld(worldId)
await worldClass.exportToMarkdown();          // exportWorldToMarkdown(worldId)

// Properties
console.log(worldClass.id);                  // Get world ID
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
await worldClass.restoreChat('chat-id');             // Load specific chat
const chats = await worldClass.listChats();          // List all chats
await worldClass.deleteChat('chat-id');              // Delete chat

// Create chat with optional current setting
await worldClass.newChat(false);                     // Create new chat without setting as current
await worldClass.restoreChat('chat-id', false);      // Load chat without setting as current
```

## API Reference

### Constructor

```typescript
constructor(worldId: string)
```

The constructor takes only the world ID. The root path is handled automatically by the storage factory.

### World Operations

| Method               | Description                | Equivalent Function              |
| -------------------- | -------------------------- | -------------------------------- |
| `delete()`           | Delete world and all data  | `deleteWorld(worldId)`           |
| `update(updates)`    | Update world configuration | `updateWorld(worldId, updates)`  |
| `reload()`           | Get fresh world data       | `getWorld(worldId)`              |
| `exportToMarkdown()` | Export to markdown         | `exportWorldToMarkdown(worldId)` |
| `save()`             | No-op (stateless design)   | -                                |

### Agent Operations

| Method                       | Description        | Equivalent Function                   |
| ---------------------------- | ------------------ | ------------------------------------- |
| `createAgent(params)`        | Create new agent   | `createAgent(worldId, params)`        |
| `getAgent(name)`             | Get agent by name  | `getAgent(worldId, name)`             |
| `updateAgent(name, updates)` | Update agent       | `updateAgent(worldId, name, updates)` |
| `deleteAgent(name)`          | Delete agent       | `deleteAgent(worldId, name)`          |
| `listAgents()`               | List all agents    | `listAgents(worldId)`                 |
| `clearAgentMemory(name)`     | Clear agent memory | `clearAgentMemory(worldId, name)`     |

### Chat Operations

| Method                               | Description     | Equivalent Function                                |
| ------------------------------------ | --------------- | -------------------------------------------------- |
| `listChats()`                        | List all chats  | `listChats(worldId)`                               |
| `deleteChat(chatId)`                 | Delete chat     | `deleteChat(worldId, chatId)`                      |
| `newChat(setAsCurrent?)`             | Create new chat | `newChat(worldId, setAsCurrent)`                   |
| `restoreChat(chatId, setAsCurrent?)` | Load chat       | `restoreChat(worldId, chatId)` or verify existence |

### Utility Methods

| Method       | Description             |
| ------------ | ----------------------- |
| `id`         | Get world ID (readonly) |
| `toString()` | String representation   |
| `toJSON()`   | JSON representation     |

## Comparison: Functional vs OOP

### Functional API (Current)
```typescript
import { deleteWorld, createAgent, listAgents } from './core/index.js';

await deleteWorld(worldId);
await createAgent(worldId, agentParams);
const agents = await listAgents(worldId);
```

### OOP API (New)
```typescript
import { WorldClass } from './core/index.js';

const world = new WorldClass(worldId);
await world.delete();
await world.createAgent(agentParams);
const agents = await world.listAgents();
```

## Design Philosophy

- **Stateless**: Each method call fetches fresh data from storage
- **Consistency**: Returns same types as functional API
- **Clean**: No need to pass `worldId` to every method
- **Type-safe**: Full TypeScript support with proper type inference
- **Backwards Compatible**: Functional API remains unchanged
- **Path Management**: Storage factory handles root path automatically

## Examples

See `/examples/world-class-usage.ts` for comprehensive usage examples and comparisons.

## Testing

Basic tests are available in `/tests/core/world-class.test.ts` to verify functionality and consistency with the functional API.
