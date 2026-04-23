# Agent World

<p align="center">
  <img src="electron/assets/icons/agent-world-icon.svg" alt="Agent World Logo" width="120" />
</p>

*Prompt-defined agent runtime for orchestrating models, tools, skills, MCP servers, and external agent CLIs.*

<p align="center">
  <a href="https://github.com/yysun/agent-world/releases/latest" aria-label="Download Agent World for macOS">
    <img src="https://img.shields.io/badge/Download%20for-macOS-111111?style=for-the-badge&logo=apple&logoColor=white" alt="Download for macOS" />
  </a>
  <a href="https://github.com/yysun/agent-world/releases/latest" aria-label="Download Agent World for Windows">
    <img src="https://img.shields.io/badge/Download%20for-Windows-0078D4?style=for-the-badge&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4OCA4OCI%2BPHBhdGggZmlsbD0iI2ZmZiIgZD0iTTAgMTIuNDAyIDM1LjY4NyA3LjU0djM0LjE1OEgwVjEyLjQwMnptMzkuOTk1LTUuNDQ4TDg4IDB2NDEuMzk4SDM5Ljk5NVY2Ljk1NHpNMCA0Ni4zMDJoMzUuNjg3djM0LjIwNUwwIDc1LjY0NVY0Ni4zMDJ6bTM5Ljk5NSAwSDg4djQxLjM5OGwtNDguMDA1LTYuNzZWNDYuMzAyeiIvPjwvc3ZnPg%3D%3D" alt="Download for Windows" />
  </a>
</p>
<p align="center">Packaged desktop releases are available from GitHub Releases for macOS and Windows.</p>

## Why Agent World

Agent World is an **Agent Harness**, **Agent OS**, and **Agent Runtime** for prompt-defined multi-agent systems.

![Agent World screenshot](docs/Screenshot-agents.png)

You define a world, define agents, give them tools and workflow rules, and run them through Web, CLI, or Electron. The runtime handles message routing, streaming, tool lifecycle, approvals, queueing, and multi-agent coordination for you.

### What It Promotes

- **Prompt-defined agent runtime**: use prompts as the primary control plane for roles, routing, guardrails, and workflow state.
- **Agent Skills**: discover compact skill summaries first, then progressively load full `SKILL.md` instructions only when needed.
- **MCP server support**: attach MCP servers per world for search, browser control, file tools, code execution, and other external capabilities.
- **Model and CLI orchestration**: combine hosted providers, local Ollama models, built-in tools, and shell-driven external agent CLIs in one runtime.
- **Workflow patterns**: run sequential pipelines, routers, debate loops, fan-out/fan-in collectors, and orchestrator-worker flows.
- **Real-world work**: build coding, support, research, and ops workflows without inventing a separate runtime for each one.
- **Marketplace-style imports**: bring in worlds, agents, and skills from local folders or curated GitHub sources.

## Core Capabilities

- Prompt-defined agents with shared world context and deterministic mention-based routing
- Progressive Agent Skills via `load_skill`
- Built-in tools for files, web fetch, shell, messaging, agent creation, and human intervention
- MCP integration with `stdio` and `http` transports
- Multi-provider runtime support: OpenAI, Anthropic, Google, Azure OpenAI, xAI, OpenAI-compatible endpoints, and Ollama
- Local-model friendly defaults with `OLLAMA_BASE_URL`
- World-level tool permission modes: `Read`, `Ask`, `Auto`
- Cross-client HITL approvals in Web, CLI, and Electron
- Restore-aware recovery for interrupted chats, approvals, and tool-driven turns
- Tool results can show inline previews for files and rich content
- Per-chat queue-backed send flow with concurrent chat execution, heartbeat scheduling, and stop/resume controls
- Real-time streaming with tool lifecycle visibility and per-chat isolation
- Packaged Electron desktop app with built-in update checks
- Marketplace-style imports for worlds, agents, and skills
- Web app, CLI, Electron desktop app, and core npm package

## Prompt-Defined Runtime

Agent World is best understood as:

> prompt-defined state machine + message passing + tools + approvals

A world prompt and a set of agent prompts define:

- who responds
- when they respond
- how work is routed
- when humans approve
- which tools or skills get loaded
- how results are merged back together

Minimal example:

```text
You are running a coding workflow.

@orchestrator:
- Triage the request.
- If the task needs parallel analysis, fan out to @research, @coder, and @reviewer.
- Merge results and reply to the human.
- Use skills before ad hoc tool use when a skill matches.

@research:
- Gather context, docs, and constraints.

@coder:
- Make targeted changes with tools.

@reviewer:
- Check for regressions and missing tests.
```

## Workflow Patterns

Agent World already supports prompt-driven workflow shapes such as:

- **Sequential pipeline**: spec -> implement -> test -> deliver
- **Intent router**: dispatch requests to the right specialist
- **FSM controller**: carry workflow state inside the transcript
- **Debate loop**: red-team vs blue-team or design critique
- **Fan-out**: parallel lanes for research, code, security, or alternatives
- **Fan-in**: collector agent merges and finalizes lane outputs
- **Orchestrator-worker**: planner delegates, workers execute, collector returns result
- **Tool proxy agent**: wrap shell tools or CLIs behind an agent role
- **Approval gate**: stop at plan/review/deploy boundaries and wait for human choice

For the full pattern catalog, see [docs/Agent World Patterns.md](docs/Agent%20World%20Patterns.md).

## Real-World Workflows

### Coding

- Repo-aware orchestrator + coder + reviewer flows
- Shell-driven workflows for Git, Docker, migrations, builds, and test runs
- Skills for standardized development processes
- MCP servers for browser automation, filesystem access, and structured tooling

### Support

- Triage -> specialist -> manager escalation
- Approval gates for sensitive actions
- Shared transcript and queue-backed follow-up handling

### Research

- Fan out multiple researchers
- Use MCP search/browser tools or `web_fetch`
- Fan in to a collector that synthesizes a final answer

### Ops

- Incident triage, runbooks, shell execution, and approval checkpoints
- Local CLI orchestration for deployment, diagnostics, and log collection

## Agent Skills

Agent Skills are reusable capability packs stored as `SKILL.md` files.

- Skills are discovered from:
  - canonical project root: `./.agent-world/skills`
  - canonical user root: `~/.agent-world/skills`
- The runtime injects compact skill summaries into the prompt
- Agents call `load_skill` only when full instructions are needed
- `load_skill` loads instructions and static skill context only; it does not execute skill scripts
- If a task requires script execution, the agent must make a later explicit tool call such as `shell_cmd`
- Project-based skills follow the active world's working folder and are only discovered from `./.agent-world/skills`
- The Electron desktop app includes a skill editor with file browsing, preview/import flows, explicit `Project` vs `Global` install scope selection, and delete actions
- Interactive skill activation is approval-gated
- Skill-linked scripts are scope-validated and follow the same shell safety rules as built-in tool execution

## MCP Server Support

Each world can define MCP servers in `mcpConfig`. Agent World starts them on demand and exposes their tools to the runtime.

- Supports `stdio` and `http` transports
- Per-world configuration
- Registry, health, and restart support in the server runtime
- Works alongside built-in tools and Agent Skills

## Models, Tools, and External Agent CLIs

Agent World is not limited to a single provider or a single tool surface.

Note: Agent World's current `llm-runtime` host integration does not use provider-native `webSearch` support. For web research, use `web_fetch` or MCP-provided search/browser tools instead.

- Use hosted models from OpenAI, Anthropic, Google, Azure OpenAI, xAI, or other OpenAI-compatible endpoints
- Use local models through Ollama
- Use built-in tools for common runtime operations
- Use MCP servers when you want protocol-based external tools
- Use `shell_cmd` when you want to orchestrate local CLIs directly

That makes it practical to build workflows that combine:

- local reasoning models
- external search/browser/file tools
- repo tooling like `git`, `npm`, `docker`
- external agent CLIs used as worker executors

## Built-In Tools

Available built-ins include:

- `read_file`, `list_files`, `grep`
- `write_file`
- `web_fetch`
- `send_message`
- `create_agent`
- `shell_cmd`
- `load_skill`
- `ask_user_input` / `human_intervention_request`

`web_fetch` is the supported built-in path for fetching web content. Agent World does not currently expose provider-native `webSearch` through the `llm-runtime` host boundary.

World owners can set tool access to:

- `Read`: inspection only
- `Ask`: approval-gated writes and execution
- `Auto`: automatic execution inside trusted scope

Tool results are shown in a cleaner format so chats stay readable. When a tool creates something you can view directly, Agent World can preview it inline in the web and desktop apps, including markdown, HTML, SVG, images, audio, video, and PDFs.

### `shell_cmd`

The `shell_cmd` tool is the bridge for local automation and CLI orchestration.

- Enforces trusted working-directory scope
- Validates command and path arguments
- Tracks lifecycle and supports session-scoped cancellation
- Streams output back into the active runtime


## How Agents Communicate

Each world has a shared event system. Agents respond based on public messages and paragraph-start mentions.

### Message Rules

| Message Shape | Example | Who Responds |
|--------------|---------|--------------|
| Public human or world message | `Hello everyone!` | All active agents |
| Paragraph-start mention | `@alice Can you help?` | Only mentioned agents |
| Paragraph-start mention after text | `Please review this:\n@alice` | Only mentioned agents |
| Mid-text mention only | `I think @alice should help` | Nobody |
| Stop World | `<world>pass</world>` | No agents |

### Behavior Guarantees

- Agents respond to public messages with no paragraph-start mention
- Agents respond to direct paragraph-start mentions
- Agents do not respond to their own messages
- Mid-text mentions do not trigger replies
- Turn limits prevent runaway loops

## Installation and Quick Start

### Prerequisites

- Node.js 20+
- API keys for any hosted providers you want to use

Use npm package invocations. GitHub shorthand commands such as `npx agent-world/agent-world` are not supported entrypoints.

### Desktop App

Download the latest packaged desktop app from the GitHub Releases page.

Packaged desktop builds:

- are available for macOS and Windows
- check GitHub Releases for updates on startup
- can download updates automatically while keeping install/restart as an explicit user action
- support stable-by-default updates with optional prerelease opt-in

Source and dev runs remain separate from the packaged updater flow.

### Web

```bash
npx agent-world@latest
```

### CLI

Interactive mode:

```bash
npx -p agent-world@latest agent-world-cli
```

Command mode:

```bash
npx -p agent-world@latest agent-world-cli -w default-world "hi"
```

Pipeline mode:

```bash
echo "hi" | npx -p agent-world@latest agent-world-cli -w default-world
```

### Electron Desktop Development (repo)

```bash
npm run electron:dev
```

## Development

### Project Structure

- `core/` - runtime, storage, tools, skills, MCP integration, and event flow
- `server/` - REST API and SSE transport
- `web/` - browser app
- `electron/` - desktop app
- `cli/` - terminal interface

### Development Scripts

```bash
npm run dev
npm run web:dev
npm run cli:dev
npm run electron:dev
```

### Production Scripts

```bash
npm start
npm run web:start
npm run cli:start
npm run electron:start
```

### Build and Check

```bash
npm run build
npm run check
```

### Desktop Packaging

```bash
npm run release:prepare
npm run electron:dist:mac
npm run electron:dist:win
```

## Environment Setup

For Azure OpenAI, all four `AZURE_OPENAI_*` variables are required together.

```bash
export OPENAI_API_KEY="your-key-here"
export ANTHROPIC_API_KEY="your-key-here"
export GOOGLE_API_KEY="your-key-here"
export AZURE_OPENAI_API_KEY="your-key-here"
export AZURE_OPENAI_RESOURCE_NAME="your-resource-name"
export AZURE_OPENAI_DEPLOYMENT_NAME="your-deployment-name"
export AZURE_OPENAI_API_VERSION="2024-10-21-preview"
export XAI_API_KEY="your-key-here"

# Local models
export OLLAMA_BASE_URL="http://localhost:11434"
```

Or create a `.env` file:

```bash
OPENAI_API_KEY=your-key-here
ANTHROPIC_API_KEY=your-key-here
GOOGLE_API_KEY=your-key-here
AZURE_OPENAI_API_KEY=your-key-here
AZURE_OPENAI_RESOURCE_NAME=your-resource-name
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
AZURE_OPENAI_API_VERSION=2024-10-21-preview
XAI_API_KEY=your-key-here
OLLAMA_BASE_URL=http://localhost:11434
```

## Optional Opik Layer

Opik is optional and fully gated.

```bash
OPIK_ENABLED=false
OPIK_SAFETY_ENABLED=false
OPIK_EVAL_ENABLED=false
OPIK_API_KEY=
OPIK_WORKSPACE=
OPIK_PROJECT=agent-world-debugging
```

Rules:
- `OPIK_ENABLED=false`: all Opik integration/safety/eval paths are inert.
- `OPIK_ENABLED=true`: tracing can attach only if `OPIK_API_KEY` + `OPIK_WORKSPACE` are set.
- Safety and eval still require their sub-flags (`OPIK_SAFETY_ENABLED`, `OPIK_EVAL_ENABLED`).

#### Fallback Behavior

When Opik is enabled but something is missing, startup always continues normally — no crashes.

| Condition | Result | Log |
|-----------|--------|-----|
| `OPIK_ENABLED=false` | No Opik code runs | none |
| Enabled but `OPIK_API_KEY` or `OPIK_WORKSPACE` missing | Tracer skipped | warning: `Opik enabled but required env is missing` |
| Enabled + config present but `packages/opik` not installed | Tracer skipped | warning: `Opik enabled but optional dependency is unavailable` |
| Enabled + config present + module loaded but tracer init fails | Tracer skipped | warning: `Opik module loaded but tracer initialization failed` |
| Enabled + config present + module loaded + tracer created | Tracer attaches to world | info: `Opik tracer attached` |

Opik is storage-agnostic — it attaches to `world.eventEmitter` and works identically with sqlite, file, or memory storage backends.

## Testing

Run all tests:

```bash
npm test
npm run test:watch
npm run test:ui
npm run test:coverage
npm run test:coverage:gate
```

Run specific tests:

```bash
npm test -- tests/core/events/
npm test -- message-saving
```

Integration tests:

```bash
npm run test:integration
npm run ci:test
```

Coverage thresholds enforced by `npm run test:coverage:gate`:

- core statements >= 68%
- core branches >= 56%
- core functions >= 75%
- core lines >= 69%

## Logging and Debugging

Agent World uses scenario-based logging so you can enable only the categories you need.

Examples:

```bash
LOG_STORAGE_MIGRATION=info npm run web:dev
LOG_MCP=debug npm run web:dev
LOG_EVENTS_AGENT=debug LOG_LLM=debug npm run web:dev
LOG_CHAT_RESTORE=debug LOG_CHAT_RESTORE_RESUME=debug LOG_CHAT_RESTORE_RESUME_TOOLS=debug LOG_HITL=debug npm run web:dev
```

See [docs/logging-guide.md](docs/logging-guide.md) for the full guide.

## Storage Configuration

By default, worlds are stored in SQLite under `~/agent-world`.

To change the SQLite database path:

```bash
export AGENT_WORLD_SQLITE_DATABASE=~/agent-world/database.db
```

To use file storage instead:

```bash
export AGENT_WORLD_STORAGE_TYPE=file
export AGENT_WORLD_DATA_PATH=./data/worlds
```

## Learn More

- [docs/docs-home.md](docs/docs-home.md) - documentation hub
- [docs/Building Agents with Just Words.md](docs/Building%20Agents%20with%20Just%20Words.md) - broader concepts and examples
- [docs/Agent World Patterns.md](docs/Agent%20World%20Patterns.md) - supported workflow patterns
- [docs/shell-cmd-tool.md](docs/shell-cmd-tool.md) - shell tool details
- [docs/hitl-approval-flow.md](docs/hitl-approval-flow.md) - approval model
- [docs/core-npm-usage.md](docs/core-npm-usage.md) - integrate the core runtime from npm
- [docs/electron-desktop.md](docs/electron-desktop.md) - desktop workflow
- [docs/electron-release-process.md](docs/electron-release-process.md) - desktop packaging and publish flow
- [docs/electron-release-contract.md](docs/electron-release-contract.md) - desktop versioning and updater contract
- [docs/Tool Results Contract.md](docs/Tool%20Results%20Contract.md) - tool envelope and artifact preview behavior
- [openapi.yaml](openapi.yaml) - REST API spec
- [CHANGELOG.md](CHANGELOG.md) - release history

## Contributing

Agent World benefits from new workflow examples, bug reports, docs improvements, and runtime/tooling contributions.

## License

MIT License

Copyright © 2025 Yiyi Sun
