# Agent World 🌍🤖

*Build AI agent teams with just words—no coding required.*

---

## Why Agent World?

Traditional AI frameworks force you to write hundreds of lines of code just to make agents talk to each other. Agent World lets you create intelligent agent teams using nothing but plain English prompts.

**Other frameworks:**
- Install SDKs → write classes → handle loops → deploy containers
- 300+ lines of code before "Hello, world"

**Agent World:**
```text
You are @moderator. When someone says "start debate", 
ask for a topic, then tag @pro and @con to argue.
```
Paste that prompt. Agents come alive instantly.

---

## How Agents Communicate

Each Agent World has a collection of agents that can communicate through a shared event system. Agents follow simple rules:

### Message Rules

| Message Type | Example | Who Responds |
|--------------|---------|--------------|
| **Human message** | `Hello everyone!` | All active agents |
| **Direct mention** | `@alice Can you help?` | Only @alice |
| **Paragraph mention** | `@alice\nPlease review this` | Only @alice |
| **Mid-text mention** | `I think @alice should help` | Nobody (saved to memory) |

### Agent Behavior

**Agents always respond to:**
- Human messages (unless mentioned agents exist)
- Direct @mentions at paragraph start
- System messages

**Agents never respond to:**
- Their own messages
- Other agents (unless @mentioned), will save to memory though
- Mid-text mentions (but they remember them)

**Turn limits prevent loops:**
- Default: 5 responses per conversation thread
- Agents automatically pass control back to humans
- Configurable per world

---

## What You Can Build

### 🏛️ Debate Club
```text
@moderator: Manages rounds, keeps time
@pro: Argues for the topic  
@con: Argues against the topic
```

### 📰 Editorial Pipeline
```text
@planner: Assigns articles
@author: Writes drafts
@editor: Reviews and edits
@publisher: Formats and publishes
```

### 🎮 Game Master
```text
@gm: Runs the game, manages state
@player1, @player2: Take turns
@assistant: Helps with rules
```

### 🎭 Social Simulation
```text
@alice: Friendly neighbor
@bob: Practical problem-solver  
@charlie: Creative dreamer
```

### 💼 Customer Support
```text
@triage: Categorizes requests
@specialist: Handles technical issues
@manager: Escalates complaints
```

---

## Quick Start

```bash
# Get started in 30 seconds
git clone https://github.com/yysun/agent-world
cd agent-world && npm install
npm start
```

### Create Your First Agent

1. **Start the CLI:** `npm run cli`
2. **Add an agent:** `/add helper`
3. **Set the prompt:**
   ```text
   You are @helper, a friendly assistant.
   When someone asks for help, provide a brief, helpful response.
   ```
4. **Talk to your agent:** `@helper What's the weather like?`

### Create Agent Teams

```bash
# Add multiple agents
/add moderator
/add alice  
/add bob

# Set behaviors for each agent
# moderator: "You manage conversations..."
# alice: "You are optimistic and helpful..."
# bob: "You are practical and direct..."

# Watch them interact
Hello everyone, let's discuss weekend plans!
```

---

## Agent Prompt Structure

Every agent needs just **4 simple parts**:

```text
① Role: You are @agentname, a [description]

② When to respond:
- Respond when @mentioned
- Stay quiet during [specific situations]

③ How to behave:
- Keep responses under [X] words
- Always mention @othergent when [condition]
- Use [specific format or tone]

④ Tools (optional):
AllowedTools = ["search", "calculate"] - WIP
```

### Example: Debate Moderator

```text
You are @moderator, a neutral debate host.

When someone says "start debate":
1. Ask for a topic if none provided
2. Create a simple state tracker
3. Tag @pro: "Present your opening argument"
4. After @pro responds, tag @con: "Your turn to respond"  
5. Alternate for 3 rounds
6. Summarize both sides and declare debate closed

Stay neutral. Keep responses under 50 words.
If things get heated, remind everyone to stay respectful.
```

---

## Real-World Applications

### 🏢 Business Process Automation
- **Customer support:** Triage → Specialist → Manager escalation
- **Content creation:** Writer → Editor → Fact-checker → Publisher
- **Project management:** Planner → Developer → Tester → Reviewer

### 🎓 Education & Research
- **Classroom simulations:** Historical debates, scientific discussions
- **Social behavior research:** Study cooperation, competition, negotiation
- **Game theory experiments:** Prisoner's dilemma, auction strategies

### 🎮 Gaming & Entertainment
- **NPCs with personality:** Villagers, shopkeepers, quest givers
- **Multiplayer coordination:** Party formation, strategy discussion
- **Interactive storytelling:** Characters that respond and evolve

### 🔬 Prototype & Experimentation
- **Team dynamics:** Test different communication patterns
- **Workflow optimization:** Model and improve business processes
- **AI behavior study:** Observe emergent group behaviors

---

## Why It Works

**✅ No Code Required**
- Agents are defined entirely in natural language
- Change behavior by editing text, not code
- Non-programmers can create and modify agents

**✅ Natural Communication**
- @mentions work like social media
- Agents understand context and conversations
- Privacy through natural language patterns

**✅ Prevents Chaos**
- Built-in loop prevention
- Turn limits stop endless conversations
- Clear rules about when agents respond

**✅ Multiple AI Providers**
- OpenAI, Anthropic, Google, Azure, XAI, Ollama
- Switch providers without changing agent prompts
- Use different models for different agents

---

## Installation & Setup

### Prerequisites
- Node.js 18+ 
- An API key for your preferred LLM provider

### Environment Setup
```bash
# Required: Choose one or more
export OPENAI_API_KEY="your-key-here"
export ANTHROPIC_API_KEY="your-key-here"  
export GOOGLE_API_KEY="your-key-here"

# Optional: For local models
export OLLAMA_BASE_URL="http://localhost:11434"
```

### Environment Support

**Node.js Environment:**
- Full functionality including file system operations
- Complete world and agent persistence
- CLI and server modes
- All LLM providers supported

**Browser Environment:**
- Core agent communication and logic
- Memory-only operation (no file system persistence)
- Real-time agent interactions via WebSocket
- Limited storage operations (NoOp implementations)

**Note:** The core library is designed to work in both environments with runtime detection. Storage operations gracefully become NoOp in browsers while maintaining full API compatibility.

### Commands
```bash
# Start interactive CLI
npm run cli

# Start web server (localhost:3000)
npm run server

# Run tests
npm test
```

---

## Learn More

- **[Building Agents with Just Words](docs/Building%20Agents%20with%20Just%20Words.md)** - Complete guide with examples
- **[Architecture Overview](docs/ideas.md)** - How the system works
- **Example Worlds** - Ready-made agent teams in `/data/worlds/`

---

## Contributing

Agent World thrives on community examples and improvements:

1. **Share your agent teams** - Submit interesting prompt combinations
2. **Report bugs** - Help us improve the core system  
3. **Suggest features** - What would make agents more useful?
4. **Write docs** - Help others learn faster

---

## License

MIT License - Build amazing things and share them with the world!

Copyright © 2025 Yiyi Sun

---

*Agent World: Where AI agents come alive through the power of words.*
