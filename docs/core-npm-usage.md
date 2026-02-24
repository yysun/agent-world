# Using `agent-world/core` from npm

This guide explains how to use the published core library (`agent-world/core`) in another application.

## Install

```bash
npm install agent-world
```

## What to import

Use the `core` subpath export:

```ts
import {
  createWorld,
  createAgent,
  getWorld,
  publishMessage,
  LLMProvider,
  configureLLMProvider
} from 'agent-world/core';
```

## Server Usage (Node.js)

Use this when your app runs on a backend (recommended for OpenAI/Anthropic/Google keys).

### 1. Configure providers at startup

```ts
import { configureLLMProvider, LLMProvider } from 'agent-world/core';

export function configureProvidersFromEnv(): void {
  if (process.env.OPENAI_API_KEY) {
    configureLLMProvider(LLMProvider.OPENAI, {
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  if (process.env.ANTHROPIC_API_KEY) {
    configureLLMProvider(LLMProvider.ANTHROPIC, {
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  if (process.env.GOOGLE_API_KEY) {
    configureLLMProvider(LLMProvider.GOOGLE, {
      apiKey: process.env.GOOGLE_API_KEY
    });
  }
}
```

### 2. Create world + agent + publish message

```ts
import {
  createWorld,
  createAgent,
  getWorld,
  publishMessage,
  LLMProvider
} from 'agent-world/core';

const world = await createWorld({ name: 'demo-world' });
if (!world) throw new Error('Failed to create world');

await createAgent(world.id, {
  name: 'assistant',
  type: 'assistant',
  provider: LLMProvider.OPENAI,
  model: 'gpt-4o-mini'
});

const runtimeWorld = await getWorld(world.id);
if (!runtimeWorld) throw new Error('World not found');

publishMessage(runtimeWorld, 'Hello', 'human');
```

### 3. Optional storage configuration

By default, Node.js uses SQLite at `~/agent-world/database.db`.

```bash
AGENT_WORLD_STORAGE_TYPE=sqlite
AGENT_WORLD_SQLITE_DATABASE=/absolute/path/to/database.db
```

Or use memory/file storage:

```bash
AGENT_WORLD_STORAGE_TYPE=memory
# or
AGENT_WORLD_STORAGE_TYPE=file
AGENT_WORLD_DATA_PATH=./data/worlds
```

## Browser Usage

`core` can run in browser environments, but there are important constraints.

### 1. Security recommendation

Do not expose private provider API keys in production browser code.  
For production, call your backend API and keep keys server-side.

### 2. Browser demo/local usage

```ts
import {
  configureLLMProvider,
  createWorld,
  createAgent,
  getWorld,
  publishMessage,
  LLMProvider
} from 'agent-world/core';

configureLLMProvider(LLMProvider.OPENAI, {
  apiKey: '<temporary-or-proxied-key>'
});

const world = await createWorld({ name: 'browser-demo' });
if (!world) throw new Error('Failed to create world');

await createAgent(world.id, {
  name: 'assistant',
  type: 'assistant',
  provider: LLMProvider.OPENAI,
  model: 'gpt-4o-mini'
});

const runtimeWorld = await getWorld(world.id);
if (!runtimeWorld) throw new Error('World not found');

publishMessage(runtimeWorld, 'Hello from browser', 'human');
```

### 3. Browser storage behavior

In browser environments, storage falls back to in-memory mode.  
Data is not persisted across page reloads unless you implement your own persistence layer.

## Notes

- `createAgent()` stores provider/model metadata only.
- Provider credentials are required later when an LLM call is made.
- If a provider is not configured, the runtime throws: `No configuration found for <provider> provider`.
- Ollama is configured by default with `http://localhost:11434/v1`.
