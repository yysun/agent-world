# Agent World

Build an AI agent world application that has the following ideas:

### Agents

- [X] Create an AI agent using TypeScript and Node.js 
- [X] Make a class that can be instantiated to a few more agent instances
- [X] Configure agent to use OpenAI API or Anthropic API 
- [X] Support LLM streaming 
- [X] Each agent should have long term and short term memory
- [X] Each agent should support function call tools support 
- [X] Implement retry mechanisms for transient errors.
- [X] add a `role` property to agent 
    - [X] use `role` to define the system message to LLM
    - [X] when creating a new agnet in CLI, ask for role
    - [X] use 'You are an AI assistent.' as the default

## Persistence

- [X] agenta should have a JSON file to persistent status and long term memory 
- [X] use agent name instead of id to name the agent JSON file, make file name safe to file system
- [X] don't save api key to the agent JSON file
- [X] agents should have an empty long term memory when created
- [X] agents should load long term memory from JSON file 
- [X] agents should have an empty short term memory when created
- [X] agents should have an empty short term memory when program restarts
- [X] agents should update memories after each interaction
    - [X] append chat messages (role and message) to short term and long term memory
    - [X] save the long term memory to JSON file 
    - [X] use last 10 short memory for chatting with LLM

### World

- [X] Create a world for the agent to interact with
- [X] The world can spawn agents and kill agents
- [X] Maintain agent states across restarts by persisting configurations
- [X] Allow multiple agents to run concurrently without blocking the main thread
- [X] Utilize asynchronous programming to manage agent interactions
- [X] Consider using worker threads or separate processes for heavy operations if needed
- [X] Use Node.js EventEmitter to handle agent events and enable better inter-agent communication
- [X] Use logging libraries like winston for structured logging
- [X] Create a simple CLI for the agent to interact with the world: 

```
Available commands:
  new <name> [provider]    - Create a new agent (provider: openai|anthropic, defaults to anthropic)
  list                     - List all active agents
  kill <name>              - Terminate an agent by name
  ask [name] <msg>         - Ask a question to an agent (or all agents if no name specified)
  status [name]            - Show agent status and memory (or all agents if no name specified)
  clear [name]             - Clear agent's short-term memory (or all agents if no name specified)
  help                     - Show this help message
  exit                     - Exit the program
```  

### Agent Management

One of the floowing ideas can be implemented to manage agents:

1. Orchestrator Pattern:
2. Agent Classification and Hierarchies:
3. Event-Driven Architecture:
4. Behavioral Coordination Strategies:
5. Middleware and Frameworks:
