# @agent-world/opik

This package provides Opik observability integration for Agent World.

## Features

- **Automatic Tracing**: Maps Agent World events (Tool Start/Result, LLM Streaming) to Opik Spans.
- **Project Organization**: Supports configuring Opik Workspace and Project names via environment variables.
- **Conditional Activation**: Only active when `OPIK_API_KEY` is present.

## Configuration

The package relies on environment variables for configuration:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `OPIK_API_KEY` | Your Opik API Key | Yes | - |
| `OPIK_WORKSPACE` | Your Opik Workspace name | No | `default` |
| `OPIK_PROJECT` | Target Project name in Opik | No | `agent-world-default` |

## Usage

This package is designed to be used by the `agent-world` CLI and Server. It attaches to the core `World` event emitter.

```typescript
import { OpikTracer } from '@agent-world/opik';

// Attach to an existing world instance
const tracer = new OpikTracer();
tracer.attachToWorld(world);
```
