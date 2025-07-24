/**
 * Test Scenarios for Agent World Test Suite
 * 
 * Provides reusable test scenarios for complex testing patterns across reorganized test files.
 * These scenarios represent real-world usage patterns and edge cases.
 */

import type { Agent, AgentMessage, World, WorldMessageEvent } from '../../../core/types';
import {
  AgentTestBuilder,
  WorldTestBuilder,
  MessageTestBuilder,
  WorldMessageEventTestBuilder,
  TestDataPresets
} from './test-data-builders';

/**
 * Agent-related test scenarios
 */
export class AgentScenarios {
  /**
   * Scenario: Agent with conversation history
   * Creates an agent with realistic conversation flow
   */
  static agentWithConversationHistory(): { agent: Agent; messages: AgentMessage[] } {
    const messages = [
      new MessageTestBuilder()
        .asSystemMessage('You are a helpful assistant.')
        .build(),
      new MessageTestBuilder()
        .asUserMessage('Hello, can you help me with a task?')
        .withSender('user')
        .build(),
      new MessageTestBuilder()
        .asAssistantMessage('Of course! I\'d be happy to help. What task would you like assistance with?')
        .withSender('test-agent')
        .build(),
      new MessageTestBuilder()
        .asUserMessage('I need to write a report about climate change.')
        .withSender('user')
        .build(),
      new MessageTestBuilder()
        .asAssistantMessage('I can help you with that! Let\'s start by outlining the key topics you\'d like to cover.')
        .withSender('test-agent')
        .build()
    ];

    const agent = new AgentTestBuilder()
      .withName('Research Assistant')
      .withType('assistant')
      .withMemory(messages)
      .withLLMCallCount(2)
      .build();

    return { agent, messages };
  }

  /**
   * Scenario: Agent reaching memory limit
   * Creates an agent that has reached its memory capacity
   */
  static agentAtMemoryLimit(): Agent {
    const maxMemory = 5;
    const messages = TestDataPresets.createConversation(maxMemory);

    return new AgentTestBuilder()
      .withName('Memory Limited Agent')
      .withMemory(messages)
      .withLLMCallCount(maxMemory - 1) // System message doesn't count
      .build();
  }

  /**
   * Scenario: Inactive agent with error state
   * Creates an agent that has encountered errors
   */
  static errorStateAgent(): Agent {
    return new AgentTestBuilder()
      .withName('Failed Agent')
      .withStatus('error')
      .withLLMCallCount(3)
      .build();
  }

  /**
   * Scenario: Agent with custom response queue
   * Creates an agent with predefined responses for testing
   */
  static agentWithResponseQueue(responses: string[]): Agent {
    return new AgentTestBuilder()
      .withName('Scripted Agent')
      .withMockResponses(responses)
      .build();
  }
}

/**
 * World-related test scenarios
 */
export class WorldScenarios {
  /**
   * Scenario: Active world with multiple agents
   * Creates a world with several active agents for testing interactions
   */
  static activeWorldWithMultipleAgents(): { world: World; agents: Agent[] } {
    const agents = [
      new AgentTestBuilder()
        .withId('agent-1')
        .withName('Agent Alpha')
        .withType('conversational')
        .withStatus('active')
        .build(),
      new AgentTestBuilder()
        .withId('agent-2')
        .withName('Agent Beta')
        .withType('analytical')
        .withStatus('active')
        .build(),
      new AgentTestBuilder()
        .withId('agent-3')
        .withName('Agent Gamma')
        .withType('creative')
        .withStatus('inactive')
        .build()
    ];

    const world = new WorldTestBuilder()
      .withName('Multi-Agent Test World')
      .withDescription('A world for testing agent interactions')
      .withAgents(agents)
      .withTurnLimit(20)
      .build();

    return { world, agents };
  }

  /**
   * Scenario: World at turn limit
   * Creates a world that has reached its conversation turn limit
   */
  static worldAtTurnLimit(): World {
    const turnLimit = 5;
    const world = new WorldTestBuilder()
      .withName('Limited Turn World')
      .withTurnLimit(turnLimit)
      .build();

    // Mock the turn count methods to simulate reaching limit
    world.getCurrentTurnCount = jest.fn().mockReturnValue(turnLimit);
    world.hasReachedTurnLimit = jest.fn().mockReturnValue(true);

    return world;
  }

  /**
   * Scenario: Empty world for initialization testing
   * Creates a minimal world for testing setup/teardown
   */
  static emptyWorld(): World {
    return new WorldTestBuilder()
      .withName('Empty Test World')
      .withDescription('Minimal world for testing')
      .withTurnLimit(1)
      .build();
  }
}

/**
 * Message-related test scenarios
 */
export class MessageScenarios {
  /**
   * Scenario: System configuration message
   * Creates a system message for agent configuration
   */
  static systemConfigMessage(): AgentMessage {
    return new MessageTestBuilder()
      .asSystemMessage('You are a helpful AI assistant. Be concise and accurate in your responses.')
      .build();
  }

  /**
   * Scenario: User question with context
   * Creates a realistic user question message
   */
  static userQuestionMessage(): AgentMessage {
    return new MessageTestBuilder()
      .asUserMessage('Can you explain the difference between machine learning and deep learning?')
      .withSender('curious-user')
      .build();
  }

  /**
   * Scenario: Assistant response with detailed explanation
   * Creates a comprehensive assistant response
   */
  static assistantExplanationMessage(): AgentMessage {
    return new MessageTestBuilder()
      .asAssistantMessage('Machine learning is a broader field that includes various algorithms for pattern recognition, while deep learning is a subset that specifically uses neural networks with multiple layers.')
      .withSender('expert-assistant')
      .build();
  }

  /**
   * Scenario: Complex conversation thread
   * Creates a realistic conversation flow with multiple message types
   */
  static complexConversationThread(): AgentMessage[] {
    return [
      MessageScenarios.systemConfigMessage(),
      MessageScenarios.userQuestionMessage(),
      MessageScenarios.assistantExplanationMessage(),
      new MessageTestBuilder()
        .asUserMessage('Could you provide a practical example?')
        .withSender('curious-user')
        .build(),
      new MessageTestBuilder()
        .asAssistantMessage('Certainly! Image recognition is a common deep learning application, while email spam detection often uses simpler machine learning techniques.')
        .withSender('expert-assistant')
        .build()
    ];
  }
}

/**
 * Event-related test scenarios
 */
export class EventScenarios {
  /**
   * Scenario: User message event
   * Creates a world message event from a user
   */
  static userMessageEvent(): WorldMessageEvent {
    return new WorldMessageEventTestBuilder()
      .withContent('Hello everyone! How is the discussion going?')
      .withSender('active-user')
      .withMessageId('user-msg-001')
      .build();
  }

  /**
   * Scenario: Agent response event
   * Creates a world message event from an agent
   */
  static agentResponseEvent(): WorldMessageEvent {
    return new WorldMessageEventTestBuilder()
      .withContent('The discussion is progressing well. We\'ve covered several important topics.')
      .withSender('discussion-moderator')
      .withMessageId('agent-msg-002')
      .build();
  }

  /**
   * Scenario: System notification event
   * Creates a system-generated message event
   */
  static systemNotificationEvent(): WorldMessageEvent {
    return new WorldMessageEventTestBuilder()
      .withContent('New participant has joined the conversation.')
      .withSender('system')
      .withMessageId('sys-msg-003')
      .build();
  }
}

/**
 * Integration test scenarios
 * Complex scenarios that combine multiple components
 */
export class IntegrationScenarios {
  /**
   * Scenario: Full conversation cycle
   * Creates a complete scenario with world, agents, and message flow
   */
  static fullConversationCycle(): {
    world: World;
    agents: Agent[];
    events: WorldMessageEvent[];
    expectedResponses: string[];
  } {
    const { world, agents } = WorldScenarios.activeWorldWithMultipleAgents();

    const events = [
      EventScenarios.userMessageEvent(),
      EventScenarios.agentResponseEvent(),
      EventScenarios.systemNotificationEvent()
    ];

    const expectedResponses = [
      'Welcome to our discussion!',
      'I can help analyze this topic.',
      'Let me add some creative perspective.'
    ];

    // Configure agents with expected responses
    agents.forEach((agent, index) => {
      if (expectedResponses[index]) {
        agent.generateResponse = jest.fn().mockResolvedValue(expectedResponses[index]);
      }
    });

    return { world, agents, events, expectedResponses };
  }

  /**
   * Scenario: Agent memory management cycle
   * Creates a scenario for testing memory operations
   */
  static memoryManagementCycle(): {
    agent: Agent;
    initialMessages: AgentMessage[];
    newMessages: AgentMessage[];
    expectedArchived: number;
  } {
    const initialMessages = TestDataPresets.createConversation(3);
    const newMessages = TestDataPresets.createConversation(2);

    const agent = new AgentTestBuilder()
      .withName('Memory Manager')
      .withMemory(initialMessages)
      .build();

    return {
      agent,
      initialMessages,
      newMessages,
      expectedArchived: 2 // Expect to archive 2 oldest messages
    };
  }

  /**
   * Scenario: Error handling and recovery
   * Creates a scenario for testing error conditions
   */
  static errorHandlingScenario(): {
    world: World;
    failingAgent: Agent;
    workingAgent: Agent;
    errorEvent: WorldMessageEvent;
  } {
    const failingAgent = AgentScenarios.errorStateAgent();
    failingAgent.generateResponse = jest.fn().mockRejectedValue(new Error('LLM API Error'));

    const workingAgent = new AgentTestBuilder()
      .withId('backup-agent')
      .withName('Backup Agent')
      .withStatus('active')
      .build();

    const world = new WorldTestBuilder()
      .withName('Error Test World')
      .withAgents([failingAgent, workingAgent])
      .build();

    const errorEvent = new WorldMessageEventTestBuilder()
      .withContent('This message should trigger an error in the failing agent')
      .withSender('test-user')
      .build();

    return { world, failingAgent, workingAgent, errorEvent };
  }
}

/**
 * Performance test scenarios
 * Scenarios designed for testing performance characteristics
 */
export class PerformanceScenarios {
  /**
   * Scenario: High message volume
   * Creates a scenario with many messages for performance testing
   */
  static highMessageVolume(messageCount: number = 100): {
    agent: Agent;
    messages: AgentMessage[];
  } {
    const messages = Array.from({ length: messageCount }, (_, i) =>
      new MessageTestBuilder()
        .withContent(`Performance test message ${i + 1}`)
        .withTimestamp(new Date(Date.now() + i * 100))
        .build()
    );

    const agent = new AgentTestBuilder()
      .withName('Performance Test Agent')
      .withMemory(messages)
      .withLLMCallCount(messageCount / 2)
      .build();

    return { agent, messages };
  }

  /**
   * Scenario: Many agents in world
   * Creates a world with many agents for scalability testing
   */
  static manyAgentsWorld(agentCount: number = 50): {
    world: World;
    agents: Agent[];
  } {
    const agents = Array.from({ length: agentCount }, (_, i) =>
      new AgentTestBuilder()
        .withId(`perf-agent-${i}`)
        .withName(`Performance Agent ${i + 1}`)
        .withStatus(i % 3 === 0 ? 'inactive' : 'active')
        .build()
    );

    const world = new WorldTestBuilder()
      .withName('Performance Test World')
      .withAgents(agents)
      .withTurnLimit(1000)
      .build();

    return { world, agents };
  }
}
