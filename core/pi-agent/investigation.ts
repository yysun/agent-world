/**
 * Pi-Agent Investigation Script
 * 
 * Tests basic functionality of @mariozechner/pi-agent-core to understand:
 * - How to integrate with Agent-World's architecture
 * - Event handling and streaming
 * - Tool execution
 * - Multi-provider support
 * 
 * Run with: npx tsx core/pi-agent/investigation.ts
 */

import { Agent, type AgentTool } from '@mariozechner/pi-agent-core';
import { getModel, StringEnum } from '@mariozechner/pi-ai';
import { Type } from '@sinclair/typebox';

async function testBasicExecution() {
  console.log('\n=== Test 1: Basic OpenAI Execution ===');
  
  const agent = new Agent({
    initialState: {
      systemPrompt: 'You are a helpful assistant. Be concise.',
      model: getModel('openai', 'gpt-4o-mini'),
      thinkingLevel: 'off',
      tools: [],
      messages: [],
      isStreaming: false,
      streamMessage: null,
      pendingToolCalls: new Set(),
    },
    convertToLlm: (messages) => messages.filter(m => 
      m.role === 'user' || m.role === 'assistant' || m.role === 'toolResult'
    ),
  });

  console.log('Agent created, sending prompt...');
  
  agent.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
    if (event.type === 'agent_end') {
      console.log('\nAgent completed');
    }
  });

  try {
    await agent.prompt('What is 2+2? Reply in one sentence.');
    console.log('✓ Basic execution successful');
  } catch (error) {
    console.error('✗ Basic execution failed:', error);
  }
}

async function testToolCalling() {
  console.log('\n=== Test 2: Tool Calling ===');
  
  const calculatorTool: AgentTool = {
    name: 'calculate',
    label: 'Calculator',
    description: 'Perform basic math calculations',
    parameters: Type.Object({
      operation: Type.String({ description: 'The operation: add, subtract, multiply, divide' }),
      a: Type.Number({ description: 'First number' }),
      b: Type.Number({ description: 'Second number' }),
    }),
    execute: async (toolCallId, params) => {
      console.log(`\n[Tool executing: ${params.operation}(${params.a}, ${params.b})]`);
      
      let result: number;
      switch (params.operation) {
        case 'add': result = params.a + params.b; break;
        case 'subtract': result = params.a - params.b; break;
        case 'multiply': result = params.a * params.b; break;
        case 'divide': result = params.a / params.b; break;
        default: throw new Error('Invalid operation');
      }
      
      return {
        content: [{ type: 'text', text: String(result) }],
        details: { result },
      };
    },
  };

  const agent = new Agent({
    initialState: {
      systemPrompt: 'You are a helpful assistant with access to a calculator.',
      model: getModel('openai', 'gpt-4o-mini'),
      thinkingLevel: 'off',
      tools: [calculatorTool],
      messages: [],
      isStreaming: false,
      streamMessage: null,
      pendingToolCalls: new Set(),
    },
    convertToLlm: (messages) => messages.filter(m => 
      m.role === 'user' || m.role === 'assistant' || m.role === 'toolResult'
    ),
  });

  agent.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
    if (event.type === 'tool_execution_start') {
      console.log(`\n[Tool starting: ${event.toolName}]`);
    }
    if (event.type === 'tool_execution_end') {
      console.log(`[Tool completed: ${event.toolName}, isError: ${event.isError}]`);
    }
  });

  try {
    await agent.prompt('What is 15 multiplied by 23?');
    console.log('\n✓ Tool calling successful');
  } catch (error) {
    console.error('\n✗ Tool calling failed:', error);
  }
}

async function testMultiProviders() {
  console.log('\n=== Test 3: Multiple Providers ===');
  
  const providers = [
    { name: 'openai', model: 'gpt-4o-mini' },
    { name: 'anthropic', model: 'claude-sonnet-4-20250514' },
    { name: 'google', model: 'gemini-2.0-flash' },
  ];

  for (const { name, model } of providers) {
    console.log(`\nTesting ${name}/${model}...`);
    
    try {
      const agent = new Agent({
        initialState: {
          systemPrompt: 'Be very concise.',
          model: getModel(name as any, model as any),
          thinkingLevel: 'off',
          tools: [],
          messages: [],
          isStreaming: false,
          streamMessage: null,
          pendingToolCalls: new Set(),
        },
        convertToLlm: (messages) => messages,
      });

      await agent.prompt('Say "hello" and nothing else.');
      console.log(`✓ ${name} successful`);
    } catch (error: any) {
      console.error(`✗ ${name} failed:`, error.message);
    }
  }
}

async function testConversationHistory() {
  console.log('\n=== Test 4: Conversation History ===');
  
  const agent = new Agent({
    initialState: {
      systemPrompt: 'You are a helpful assistant.',
      model: getModel('openai', 'gpt-4o-mini'),
      thinkingLevel: 'off',
      tools: [],
      messages: [],
      isStreaming: false,
      streamMessage: null,
      pendingToolCalls: new Set(),
    },
    convertToLlm: (messages) => messages,
  });

  let messageCount = 0;
  agent.subscribe((event) => {
    if (event.type === 'message_end') {
      messageCount++;
    }
  });

  try {
    await agent.prompt('My name is Alice.');
    await agent.prompt('What is my name?');
    
    console.log(`\nTotal messages in history: ${messageCount}`);
    console.log('✓ Conversation history successful');
  } catch (error) {
    console.error('\n✗ Conversation history failed:', error);
  }
}

async function main() {
  console.log('Pi-Agent Investigation Script');
  console.log('============================');
  
  // Check environment variables
  if (!process.env.OPENAI_API_KEY) {
    console.error('\n⚠ OPENAI_API_KEY not set - OpenAI tests will fail');
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('\n⚠ ANTHROPIC_API_KEY not set - Anthropic tests will be skipped');
  }
  if (!process.env.GOOGLE_API_KEY) {
    console.warn('\n⚠ GOOGLE_API_KEY not set - Google tests will be skipped');
  }

  await testBasicExecution();
  await testToolCalling();
  await testMultiProviders();
  await testConversationHistory();

  console.log('\n=== Investigation Complete ===\n');
}

main().catch(console.error);
