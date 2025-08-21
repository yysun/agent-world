import { jest } from '@jest/globals';
let openaiDirect: typeof import('../../core/openai-direct.js');
let llmManager: typeof import('../../core/llm-manager.js');

// Basic smoke tests for tool call handling paths
describe.skip('LLM tool call flows', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  beforeAll(async () => {
    // Prevent loading the real 'openai' package (heavy) when importing openai-direct or llm-manager
    await jest.unstable_mockModule('openai', () => ({ default: class MockOpenAI { } }));
    // Dynamically import modules after mocks are in place
    openaiDirect = await import('../../core/openai-direct.js');
    llmManager = await import('../../core/llm-manager.js');
  });

  test('non-streaming: executes tool and returns follow-up response', async () => {
    // Mock OpenAI client to return a message with tool_calls
    const fakeClient: any = {
      chat: {
        completions: {
          create: (jest.fn() as unknown as jest.MockedFunction<any>).mockResolvedValue({
            choices: [
              { message: { content: 'Here is a tool call', tool_calls: [{ id: 'tc1', function: { name: 'echo', arguments: JSON.stringify({ text: 'hello' }) } }] } }
            ]
          })
        }
      }
    };

    // Mock a tool that simply echoes
    const mcpTools: Record<string, any> = {
      echo: {
        description: 'Echo tool',
        execute: (jest.fn() as unknown as jest.MockedFunction<any>).mockResolvedValue({ echoed: 'hello' })
      }
    };

    // Spy on generateOpenAIResponse to call the real implementation with our fake client
    const spy = jest.spyOn(openaiDirect, 'generateOpenAIResponse');

    // Call generateOpenAIResponse directly to test the non-streaming path
    const result = await openaiDirect.generateOpenAIResponse(fakeClient, 'gpt-test', [], { id: 'agent1', temperature: 0.5, maxTokens: 100, provider: undefined } as any, mcpTools as any);

    expect(result).toEqual(expect.any(String));
    expect(mcpTools.echo.execute).toHaveBeenCalledTimes(1);
  });

  test('streaming: reconstructs fragmented function.arguments and executes tool once', async () => {
    // This test will exercise openai-direct streamOpenAIResponse reconstruction logic
    // We'll mock an OpenAI streaming client that yields chunks with tool_calls fragments

    const chunks = [
      { choices: [{ delta: { content: 'Result so far ' } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 't1', function: { name: 'sum', arguments: '{"a":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 't1', function: { arguments: '1, "b": 2}' } }] } }] }
    ];

    const fakeStream = (async function* () {
      for (const c of chunks) {
        yield c;
      }
    })();

    const fakeClient: any = {
      chat: {
        completions: {
          create: (jest.fn() as unknown as jest.MockedFunction<any>).mockReturnValue(fakeStream as unknown as any)
        }
      }
    };

    const mcpTools: Record<string, any> = {
      sum: {
        description: 'Sum tool',
        execute: (jest.fn() as unknown as jest.MockedFunction<any>).mockResolvedValue({ result: 3 } as unknown as any)
      }
    };

    const publish = jest.fn();

    const response = await openaiDirect.streamOpenAIResponse(fakeClient, 'gpt-test', [], { id: 'agent1', temperature: 0.5, maxTokens: 100, provider: undefined } as any, mcpTools as any, {} as any, publish, 'msg1');

    expect(mcpTools.sum.execute).toHaveBeenCalledTimes(1);
    expect(typeof response).toBe('string');
  });
});
