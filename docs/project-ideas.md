# Agent World

Build an AI agent world application that has the following ideas:

### Agents
- [ ] Create an AI agent using TypeScript and Node.js 
- [ ] Make a class that can be instantiated to a few more agent instances
- [ ] Configure agent to use OpenAI API or Anthropic API 
- [ ] Support LLM streaming 
- [ ] Each agent should have long term and short term memory
- [ ] Each agent should support function call tools support 
- [ ] Implement retry mechanisms for transient errors.

### World
- [ ] Create a world for the agent to interact with
- [ ] The world can spawn agents and kill agents
- [ ] Maintain agent states across restarts by persisting configurations
- [ ] Allow multiple agents to run concurrently without blocking the main thread
- [ ] Utilize asynchronous programming to manage agent interactions
- [ ] Consider using worker threads or separate processes for heavy operations if needed
- [ ] Use Node.js EventEmitter to handle agent events and enable better inter-agent communication
- [ ] Use logging libraries like winston for structured logging
- [ ] Create a simple CLI for the agent to interact with the world