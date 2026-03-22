/**
 * Shell Command Tool Unit Tests
 * Tests for shell command execution with streaming support
 * 
 * Features tested:
 * - Basic command execution
 * - Streaming callbacks for stdout and stderr
 * - Backwards compatibility (without callbacks)
 * - Error handling
 * - Output accumulation
 * 
 * Changes:
 * - 2026-03-22: Added regression coverage so top-level JSON stdout with nested markdown markers does not get classified as directly displayable shell content.
 * - 2026-03-22: Added targeted coverage for both shell executable resolution paths: direct calls stay cwd-relative, skill-originated script calls resolve to `<skill_root>`.
 * - 2026-03-22: Added regression coverage for skill-relative executable resolution (`./scripts/...`) from active load_skill contexts.
 * - 2026-03-12: Added black-box durable approval prompt/resolution coverage for denied shell risk approvals.
 * - 2026-03-05: Added deterministic timeout outcome coverage (timed_out) for long-running commands and quick-success non-timeout assertions.
 * - 2026-02-28: Added skill-aware script path resolution tests for `resolveSkillScriptParameters`.
 * - 2026-02-28: Added deterministic risk-tier tests for `allow`, `hitl_required`, and `block` shell command classification outcomes.
 * - 2026-02-15: Added coverage for core execute-time cwd boundary enforcement via `trustedWorkingDirectory`.
 * - 2026-02-15: Added single-command contract tests and shell control-syntax blocking (`&&`, pipes, redirects, substitution, backgrounding).
 * - 2026-02-14: Added inline-script guard coverage (`sh -c`) and short-option path-prefix checks (`-I/path`).
 * - 2026-02-14: Added scope-regression tests for relative escape paths (`./../../...`) and option assignment paths (`--flag=/...`).
 * - 2026-02-13: Added directory-request scope validation coverage (inside world cwd allowed, outside rejected).
 * - 2026-02-08: Initial test suite for streaming callback functionality
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockRequestWorldOption = vi.hoisted(() => vi.fn());

vi.mock('../../core/hitl.js', async () => {
  const actual = await vi.importActual<typeof import('../../core/hitl.js')>('../../core/hitl.js');
  return {
    ...actual,
    requestWorldOption: mockRequestWorldOption,
  };
});

import {
  createShellCmdToolDefinition,
  executeShellCommand,
  formatPreviewShellResultForLLM,
  formatResultForLLM,
  validateShellDirectoryRequest,
  validateShellCommandScope,
  classifyShellCommandRisk,
  resolveSkillScriptCommand,
  resolveSkillScriptParameters
} from '../../core/shell-cmd-tool.js';
import {
  classifyDirectDisplayContent,
  parseToolExecutionEnvelopeContent,
  serializeToolExecutionEnvelope,
} from '../../core/tool-execution-envelope.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockRequestWorldOption.mockResolvedValue({
    requestId: 'req-1',
    worldId: 'world-1',
    chatId: 'chat-1',
    optionId: 'approve',
    source: 'user',
  });
});

describe('shell command execution', () => {
  test('should not classify top-level json stdout as directly displayable when nested strings contain markdown markers', () => {
    const jsonWithMarkdownLikeFields = JSON.stringify({
      summary: '**Build complete.**',
      notes: '- first item',
      htmlLike: '<div>still json</div>',
    }, null, 2);

    expect(classifyDirectDisplayContent(jsonWithMarkdownLikeFields)).toBeNull();
  });

  test('should execute command and return result', async () => {
    const result = await executeShellCommand('echo', ['test'], './');

    expect(result.command).toBe('echo');
    expect(result.parameters).toEqual(['test']);
    expect(result.stdout).toContain('test');
    expect(result.exitCode).toBe(0);
    expect(result.error).toBeUndefined();
  });

  test('should capture stderr output', async () => {
    // Use a command that writes to stderr - ls with non-existent file
    const result = await executeShellCommand('ls', ['/this-does-not-exist-xyz'], './');

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  test('should work without callbacks (backwards compatibility)', async () => {
    const result = await executeShellCommand('echo', ['test'], './');

    expect(result.stdout).toContain('test');
    expect(result.exitCode).toBe(0);
  });

  test('should reject execution directory outside trusted working directory', async () => {
    const result = await executeShellCommand('echo', ['test'], './', {
      trustedWorkingDirectory: './tests'
    });

    expect(result.error).toContain('outside trusted working directory');
    expect(result.exitCode).toBeNull();
  });

  test('should keep timedOut false for quick successful command', async () => {
    const result = await executeShellCommand('echo', ['quick-ok'], './', {
      timeout: 2000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).not.toBe(true);
    expect(result.error).toBeUndefined();
  });

  test('should mark timeout deterministically for long-running command', async () => {
    const result = await executeShellCommand('sh', ['-c', 'sleep 2'], './', {
      timeout: 50,
    });

    expect(result.timedOut).toBe(true);
    expect(result.error).toContain('Command execution timed out after 50ms');
    expect(result.exitCode).not.toBe(0);
  });
});

describe('shell command durable approvals', () => {
  test('persists durable approval prompt and resolution messages when risky command is denied', async () => {
    mockRequestWorldOption.mockImplementationOnce(async (_world, request) => ({
      requestId: String(request?.requestId || ''),
      worldId: 'world-1',
      chatId: 'chat-1',
      optionId: 'deny',
      source: 'user',
    }));

    const messages: Array<Record<string, unknown>> = [];
    const tool = createShellCmdToolDefinition();

    await expect(
      tool.execute(
        {
          command: 'rm',
          parameters: ['-rf', './build'],
        },
        undefined,
        undefined,
        {
          world: { id: 'world-1', variables: 'working_directory=/tmp/project' },
          workingDirectory: '/tmp/project',
          chatId: 'chat-1',
          agentName: 'test-agent',
          toolCallId: 'shell-call-1',
          messages: messages as any,
        },
      ),
    ).rejects.toThrow('not approved');

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: 'assistant',
      sender: 'test-agent',
      tool_calls: [
        expect.objectContaining({ id: 'shell-call-1::approval' }),
      ],
    });

    const promptArgs = JSON.parse(String((messages[0] as any).tool_calls[0].function.arguments));
    expect(promptArgs).toMatchObject({
      title: 'Approve risky shell command?',
      defaultOptionId: 'deny',
      metadata: {
        tool: 'shell_cmd',
        toolCallId: 'shell-call-1',
      },
    });
    expect(promptArgs.options).toEqual([
      {
        id: 'approve',
        label: 'Approve',
        description: 'Run this command once.',
      },
      {
        id: 'deny',
        label: 'Deny',
        description: 'Do not run this command.',
      },
    ]);

    expect(JSON.parse(String(messages[1].content))).toMatchObject({
      requestId: 'shell-call-1::approval',
      toolCallId: 'shell-call-1',
      tool: 'shell_cmd',
      status: 'denied',
      reason: 'user_denied',
    });
  });
});

describe('shell command skill-context resolution', () => {
  test('keeps direct tool-call relative executables resolved against cwd', async () => {
    const tool = createShellCmdToolDefinition();
    const result = await tool.execute(
      {
        command: './echo',
        parameters: ['cwd executable'],
        output_detail: 'full',
      },
      undefined,
      undefined,
      {
        world: {
          id: 'world-1',
          variables: 'working_directory=/bin',
        },
        workingDirectory: '/bin',
        chatId: 'chat-1',
        agentName: 'test-agent',
        messages: [],
      },
    );

    expect(String(result)).toContain('**Command:** `./echo "cwd executable"`');
    expect(String(result)).toContain('cwd executable');
    expect(String(result)).not.toContain('/Users/esun/.agents/skills');
  });

  test('resolves ./scripts executables from the active load_skill skill_root', async () => {
    mockedGetSkillSourcePath.mockImplementation((skillId) =>
      skillId === 'search'
        ? '/bin/SKILL.md'
        : undefined
    );
    mockedExistsSync.mockImplementation((candidatePath) =>
      String(candidatePath) === '/bin/echo'
    );

    const tool = createShellCmdToolDefinition();
    const result = await tool.execute(
      {
        command: './echo',
        parameters: ['skill-root executable'],
        output_detail: 'full',
      },
      undefined,
      undefined,
      {
        world: {
          id: 'world-1',
          variables: 'working_directory=/Users/esun/Documents/Projects/test-agent-world',
        },
        workingDirectory: '/Users/esun/Documents/Projects/test-agent-world',
        chatId: 'chat-1',
        agentName: 'test-agent',
        messages: [
          {
            role: 'tool',
            chatId: 'chat-1',
            content: serializeToolExecutionEnvelope({
              __type: 'tool_execution_envelope',
              version: 1,
              tool: 'load_skill',
              status: 'completed',
              preview: null,
              result: [
                '<skill_context id="search">',
                '  <instructions>Use the local search executable.</instructions>',
                '  <active_resources>',
                '    <skill_root>/bin</skill_root>',
                '  </active_resources>',
                '</skill_context>',
              ].join('\n'),
            }),
          },
        ],
      },
    );

    expect(String(result)).toContain('**Command:** `/bin/echo "skill-root executable"`');
    expect(String(result)).toContain('skill-root executable');
    expect(String(result)).not.toContain('`./echo skill-root executable`');
  });

  test('resolves bare script paths from the active load_skill skill_root', async () => {
    mockedGetSkillSourcePath.mockImplementation((skillId) =>
      skillId === 'music-to-svg'
        ? '/Users/esun/.agents/skills/music-to-svg/SKILL.md'
        : undefined
    );
    mockedExistsSync.mockImplementation((candidatePath) =>
      String(candidatePath) === '/Users/esun/.agents/skills/music-to-svg/scripts/convert.py'
    );

    const tool = createShellCmdToolDefinition();
    const result = await tool.execute(
      {
        command: 'echo',
        parameters: ['scripts/convert.py'],
        output_detail: 'full',
      },
      undefined,
      undefined,
      {
        world: {
          id: 'world-1',
          variables: 'working_directory=/Users/esun/Documents/Projects/test-agent-world',
        },
        workingDirectory: '/Users/esun/Documents/Projects/test-agent-world',
        chatId: 'chat-1',
        agentName: 'test-agent',
        messages: [
          {
            role: 'tool',
            chatId: 'chat-1',
            content: serializeToolExecutionEnvelope({
              __type: 'tool_execution_envelope',
              version: 1,
              tool: 'load_skill',
              status: 'completed',
              preview: null,
              result: [
                '<skill_context id="music-to-svg">',
                '  <instructions>Use the converter script.</instructions>',
                '  <active_resources>',
                '    <skill_root>/Users/esun/.agents/skills/music-to-svg</skill_root>',
                '    <script_manifest>',
                '      <script path="scripts/convert.py" />',
                '    </script_manifest>',
                '  </active_resources>',
                '</skill_context>',
              ].join('\n'),
            }),
          },
        ],
      },
    );

    expect(String(result)).toContain('/Users/esun/.agents/skills/music-to-svg/scripts/convert.py');
    expect(String(result)).not.toContain('`echo scripts/convert.py`');
  });

  test('does not enable bare script resolution from failed load_skill envelopes', async () => {
    mockedGetSkillSourcePath.mockImplementation((skillId) =>
      skillId === 'music-to-svg'
        ? '/Users/esun/.agents/skills/music-to-svg/SKILL.md'
        : undefined
    );
    mockedExistsSync.mockImplementation((candidatePath) =>
      String(candidatePath) === '/Users/esun/.agents/skills/music-to-svg/scripts/convert.py'
    );

    const tool = createShellCmdToolDefinition();
    const result = await tool.execute(
      {
        command: 'echo',
        parameters: ['scripts/convert.py'],
        output_detail: 'full',
      },
      undefined,
      undefined,
      {
        world: {
          id: 'world-1',
          variables: 'working_directory=/Users/esun/Documents/Projects/test-agent-world',
        },
        workingDirectory: '/Users/esun/Documents/Projects/test-agent-world',
        chatId: 'chat-1',
        agentName: 'test-agent',
        messages: [
          {
            role: 'tool',
            chatId: 'chat-1',
            content: serializeToolExecutionEnvelope({
              __type: 'tool_execution_envelope',
              version: 1,
              tool: 'load_skill',
              status: 'failed',
              preview: null,
              result: [
                '<skill_context id="music-to-svg">',
                '  <error>User declined HITL approval for skill "music-to-svg".</error>',
                '  <active_resources>',
                '    <skill_root>/Users/esun/.agents/skills/music-to-svg</skill_root>',
                '  </active_resources>',
                '</skill_context>',
              ].join('\n'),
            }),
          },
        ],
      },
    );

    expect(String(result)).toContain('scripts/convert.py');
    expect(String(result)).not.toContain('/Users/esun/.agents/skills/music-to-svg/scripts/convert.py');
  });

  test('does not trust non-load_skill envelopes to authorize a skill-root directory', async () => {
    const tool = createShellCmdToolDefinition();

    await expect(tool.execute(
      {
        command: 'echo',
        parameters: ['ok'],
        directory: '/Users/esun/.agents/skills/music-to-svg',
      },
      undefined,
      undefined,
      {
        world: {
          id: 'world-1',
          variables: 'working_directory=/Users/esun/Documents/Projects/test-agent-world',
        },
        workingDirectory: '/Users/esun/Documents/Projects/test-agent-world',
        chatId: 'chat-1',
        agentName: 'test-agent',
        messages: [
          {
            role: 'tool',
            chatId: 'chat-1',
            content: serializeToolExecutionEnvelope({
              __type: 'tool_execution_envelope',
              version: 1,
              tool: 'web_fetch',
              status: 'completed',
              preview: null,
              result: [
                '<skill_context id="music-to-svg">',
                '  <active_resources>',
                '    <skill_root>/Users/esun/.agents/skills/music-to-svg</skill_root>',
                '  </active_resources>',
                '</skill_context>',
              ].join('\n'),
            }),
          },
        ],
      },
    )).rejects.toThrow('outside world working directory');
  });

  test('persists the same envelope contract for direct and skill-script calls while minimal and verbose change only the result payload', async () => {
    mockedGetSkillSourcePath.mockImplementation((skillId) =>
      skillId === 'search'
        ? '/bin/SKILL.md'
        : undefined
    );
    mockedExistsSync.mockImplementation((candidatePath) =>
      String(candidatePath) === '/bin/echo'
    );

    const tool = createShellCmdToolDefinition();
    const baseContext = {
      world: {
        id: 'world-1',
        variables: 'working_directory=/Users/esun/Documents/Projects/test-agent-world',
      },
      workingDirectory: '/Users/esun/Documents/Projects/test-agent-world',
      chatId: 'chat-1',
      agentName: 'test-agent',
    };

    const directMinimalEnvelope = parseToolExecutionEnvelopeContent(await tool.execute(
      {
        command: 'echo',
        parameters: ['direct-envelope'],
      },
      undefined,
      undefined,
      {
        ...baseContext,
        toolCallId: 'tool-direct-minimal',
        llmResultMode: 'minimal',
        persistToolEnvelope: true,
        messages: [],
      },
    ));

    const directVerboseEnvelope = parseToolExecutionEnvelopeContent(await tool.execute(
      {
        command: 'echo',
        parameters: ['direct-envelope'],
      },
      undefined,
      undefined,
      {
        ...baseContext,
        toolCallId: 'tool-direct-verbose',
        llmResultMode: 'verbose',
        persistToolEnvelope: true,
        messages: [],
      },
    ));

    const skillMinimalEnvelope = parseToolExecutionEnvelopeContent(await tool.execute(
      {
        command: './echo',
        parameters: ['skill-envelope'],
      },
      undefined,
      undefined,
      {
        ...baseContext,
        toolCallId: 'tool-skill-minimal',
        llmResultMode: 'minimal',
        persistToolEnvelope: true,
        messages: [
          {
            role: 'tool',
            chatId: 'chat-1',
            content: serializeToolExecutionEnvelope({
              __type: 'tool_execution_envelope',
              version: 1,
              tool: 'load_skill',
              status: 'completed',
              preview: null,
              result: [
                '<skill_context id="search">',
                '  <active_resources>',
                '    <skill_root>/bin</skill_root>',
                '  </active_resources>',
                '</skill_context>',
              ].join('\n'),
            }),
          },
        ],
      },
    ));

    const skillVerboseEnvelope = parseToolExecutionEnvelopeContent(await tool.execute(
      {
        command: './echo',
        parameters: ['skill-envelope'],
      },
      undefined,
      undefined,
      {
        ...baseContext,
        toolCallId: 'tool-skill-verbose',
        llmResultMode: 'verbose',
        persistToolEnvelope: true,
        messages: [
          {
            role: 'tool',
            chatId: 'chat-1',
            content: serializeToolExecutionEnvelope({
              __type: 'tool_execution_envelope',
              version: 1,
              tool: 'load_skill',
              status: 'completed',
              preview: null,
              result: [
                '<skill_context id="search">',
                '  <active_resources>',
                '    <skill_root>/bin</skill_root>',
                '  </active_resources>',
                '</skill_context>',
              ].join('\n'),
            }),
          },
        ],
      },
    ));

    expect(directMinimalEnvelope).not.toBeNull();
    expect(directVerboseEnvelope).not.toBeNull();
    expect(skillMinimalEnvelope).not.toBeNull();
    expect(skillVerboseEnvelope).not.toBeNull();

    expect(directMinimalEnvelope?.tool).toBe('shell_cmd');
    expect(skillMinimalEnvelope?.tool).toBe('shell_cmd');
    expect(JSON.stringify(directMinimalEnvelope?.preview || null)).toContain('Command Execution');
    expect(JSON.stringify(skillMinimalEnvelope?.preview || null)).toContain('Command Execution');
    expect(JSON.stringify(skillMinimalEnvelope?.preview || null)).toContain('/bin/echo');
    expect(directMinimalEnvelope?.display_content).toBeUndefined();
    expect(skillMinimalEnvelope?.display_content).toBeUndefined();

    expect(String(directMinimalEnvelope?.result || '')).toContain('status: success');
    expect(String(directMinimalEnvelope?.result || '')).toContain('stdout_preview:');
    expect(String(directMinimalEnvelope?.result || '')).not.toContain('### Command Execution');
    expect(String(directVerboseEnvelope?.result || '')).toContain('### Command Execution');
    expect(String(directVerboseEnvelope?.result || '')).toContain('### Standard Output');

    expect(String(skillMinimalEnvelope?.result || '')).toContain('status: success');
    expect(String(skillMinimalEnvelope?.result || '')).toContain('stdout_preview:');
    expect(String(skillMinimalEnvelope?.result || '')).not.toContain('### Command Execution');
    expect(String(skillVerboseEnvelope?.result || '')).toContain('### Command Execution');
    expect(String(skillVerboseEnvelope?.result || '')).toContain('/bin/echo skill-envelope');
  });

  test('keeps persisted human preview sizing separate from minimal llm preview sizing', () => {
    const longStdout = 'A'.repeat(800);
    const result = {
      executionId: 'exec-preview-sizing',
      command: 'echo',
      parameters: ['preview-sizing'],
      stdout: longStdout,
      stderr: '',
      exitCode: 0,
      signal: null,
      executedAt: new Date('2026-03-22T00:00:00.000Z'),
      duration: 12,
    };

    const llmPreview = formatPreviewShellResultForLLM(result);
    const humanPreview = formatResultForLLM(result, { detail: 'minimal' });

    expect(llmPreview).toContain(longStdout);
    expect(llmPreview).not.toContain('stdout_truncated: true');
    expect(humanPreview).toContain('### Standard Output (preview)');
    expect(humanPreview).toContain('Output truncated to minimum necessary preview');
    expect(humanPreview).not.toContain(longStdout);
  });
});

describe('shell command streaming callbacks', () => {
  test('should invoke onStdout callback with output chunks', async () => {
    const stdoutChunks: string[] = [];

    const result = await executeShellCommand('echo', ['test'], './', {
      onStdout: (chunk) => stdoutChunks.push(chunk)
    });

    expect(stdoutChunks.length).toBeGreaterThan(0);
    expect(stdoutChunks.join('')).toContain('test');
    expect(result.stdout).toContain('test');
  });

  test('should invoke onStderr callback when command writes to stderr', async () => {
    const stderrChunks: string[] = [];

    const result = await executeShellCommand('ls', ['/this-does-not-exist-xyz'], './', {
      onStderr: (chunk) => stderrChunks.push(chunk)
    });

    expect(stderrChunks.length).toBeGreaterThan(0);
    expect(stderrChunks.join('').length).toBeGreaterThan(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  test('should accumulate full output even with streaming callbacks', async () => {
    const stdoutChunks: string[] = [];

    const result = await executeShellCommand('echo', ['line1'], './', {
      onStdout: (chunk) => stdoutChunks.push(chunk)
    });

    // Verify callbacks received data
    expect(stdoutChunks.length).toBeGreaterThan(0);

    // Verify full output is accumulated in result
    expect(result.stdout).toContain('line1');

    // Verify chunks match accumulated output
    const chunksJoined = stdoutChunks.join('');
    expect(result.stdout).toBe(chunksJoined);
  });

  test('should handle both stdout and stderr callbacks simultaneously', async () => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    // Command that outputs to both stdout and stderr
    // Using sh -c to ensure both streams are used
    const result = await executeShellCommand('sh', [
      '-c',
      'echo "to stdout"; echo "to stderr" >&2'
    ], './', {
      onStdout: (chunk) => stdoutChunks.push(chunk),
      onStderr: (chunk) => stderrChunks.push(chunk)
    });

    expect(stdoutChunks.join('')).toContain('to stdout');
    expect(stderrChunks.join('')).toContain('to stderr');
    expect(result.stdout).toContain('to stdout');
    expect(result.stderr).toContain('to stderr');
  });

  test('should work with only onStdout callback', async () => {
    const stdoutChunks: string[] = [];

    const result = await executeShellCommand('echo', ['test'], './', {
      onStdout: (chunk) => stdoutChunks.push(chunk)
      // No onStderr callback
    });

    expect(stdoutChunks.length).toBeGreaterThan(0);
    expect(result.stdout).toContain('test');
  });

  test('should work with only onStderr callback', async () => {
    const stderrChunks: string[] = [];

    const result = await executeShellCommand('ls', ['/this-does-not-exist-xyz'], './', {
      // No onStdout callback
      onStderr: (chunk) => stderrChunks.push(chunk)
    });

    expect(stderrChunks.length).toBeGreaterThan(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});

describe('shell command error handling with streaming', () => {
  test('should handle command errors with streaming callbacks', async () => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const result = await executeShellCommand('ls', ['/invalid-path-xyz'], './', {
      onStdout: (chunk) => stdoutChunks.push(chunk),
      onStderr: (chunk) => stderrChunks.push(chunk)
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.error).toBeDefined();
    expect(stderrChunks.length).toBeGreaterThan(0);
  });

  test('should complete execution even if callback throws', async () => {
    // This test ensures that errors in callbacks don't break execution
    const result = await executeShellCommand('echo', ['test'], './', {
      onStdout: () => {
        // Simulate callback error
        throw new Error('Callback error');
      }
    });

    // Execution should complete despite callback error
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('test');
  });
});

describe('shell command directory request validation', () => {
  test('should allow requested directory inside world working_directory', () => {
    const result = validateShellDirectoryRequest(
      '/tmp/project/subdir',
      '/tmp/project'
    );

    expect(result.valid).toBe(true);
  });

  test('should reject requested directory outside world working_directory', () => {
    const result = validateShellDirectoryRequest(
      '/Users/esun',
      '/Users/esun/Documents/Projects/test-agent-world'
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('outside world working directory');
    }
  });

  test('should allow requested directory inside an additional trusted skill root', () => {
    const result = validateShellDirectoryRequest(
      '/Users/esun/.agents/skills/music-to-svg',
      '/Users/esun/Documents/Projects/test-agent-world',
      ['/Users/esun/.agents/skills/music-to-svg'],
    );

    expect(result.valid).toBe(true);
  });
});

describe('shell command argument scope validation', () => {
  test('should reject command strings with inline arguments instead of argv tokens', () => {
    const result = validateShellCommandScope(
      'ls -la',
      [],
      '/tmp/project'
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('single executable');
    }
  });

  test('should reject shell chaining syntax in command', () => {
    const result = validateShellCommandScope(
      'ls && pwd',
      [],
      '/tmp/project'
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('shell control syntax');
    }
  });

  test('should reject shell control syntax in parameters (pipe)', () => {
    const result = validateShellCommandScope(
      'echo',
      ['hello|wc'],
      '/tmp/project'
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('Invalid parameter');
    }
  });

  test('should reject shell control syntax in parameters (command substitution)', () => {
    const result = validateShellCommandScope(
      'echo',
      ['$(pwd)'],
      '/tmp/project'
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('Invalid parameter');
    }
  });

  test('should reject relative escape path tokens like ./../../etc', () => {
    const result = validateShellCommandScope(
      'ls',
      ['./../../etc'],
      '/tmp/project'
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('outside world working directory');
    }
  });

  test('should reject option assignment path tokens like --output=/tmp/outside', () => {
    const result = validateShellCommandScope(
      'echo',
      ['--output=/tmp/outside'],
      '/tmp/project'
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('outside world working directory');
    }
  });

  test('should reject short-option prefixed path tokens like -I/tmp/include', () => {
    const result = validateShellCommandScope(
      'clang',
      ['-I/tmp/include'],
      '/tmp/project'
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('outside world working directory');
    }
  });

  test('should reject inline script execution patterns like sh -c', () => {
    const result = validateShellCommandScope(
      'sh',
      ['-c', 'cat /etc/passwd'],
      '/tmp/project'
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('inline script execution');
    }
  });
});

describe('shell command risk classification', () => {
  test('should classify safe read commands as allow', () => {
    const result = classifyShellCommandRisk('ls', ['-la', './src']);

    expect(result.tier).toBe('allow');
    expect(result.reason).toBe('low_risk_command');
  });

  test('should classify destructive in-scope delete commands as hitl_required', () => {
    const result = classifyShellCommandRisk('rm', ['-rf', './build']);

    expect(result.tier).toBe('hitl_required');
    expect(result.reason).toContain('destructive_delete');
  });

  test('should classify catastrophic delete targets as block', () => {
    const result = classifyShellCommandRisk('rm', ['-rf', '/']);

    expect(result.tier).toBe('block');
    expect(result.reason).toBe('catastrophic_delete_target');
  });
});

vi.mock('../../core/skill-registry.js', () => ({
  getSkillSourcePath: vi.fn(),
  getSkills: vi.fn(() => []),
  syncSkills: vi.fn(),
  getSkill: vi.fn(),
  getSkillSourceScope: vi.fn(),
  getSkillsForSystemPrompt: vi.fn(() => []),
  clearSkillsForTests: vi.fn(),
  waitForInitialSkillSync: vi.fn(() => Promise.resolve()),
  skillRegistry: {},
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
  };
});

import { getSkillSourcePath, getSkills } from '../../core/skill-registry.js';
import { existsSync, readdirSync } from 'fs';
const mockedGetSkillSourcePath = vi.mocked(getSkillSourcePath);
const mockedGetSkills = vi.mocked(getSkills);
const mockedExistsSync = vi.mocked(existsSync);
const mockedReaddirSync = vi.mocked(readdirSync);

describe('resolveSkillScriptParameters', () => {
  beforeEach(() => {
    mockedGetSkillSourcePath.mockReset();
    mockedGetSkills.mockReset();
    mockedExistsSync.mockReset();
    mockedReaddirSync.mockReset();
    mockedGetSkills.mockReturnValue([]);
    mockedExistsSync.mockReturnValue(false);
    mockedReaddirSync.mockReturnValue([] as any);
  });

  test('should resolve skill-id/scripts/file.py to absolute path when skill exists', () => {
    mockedGetSkillSourcePath.mockReturnValue('/Users/tester/.agents/skills/music-to-svg/SKILL.md');
    const { resolvedParameters, skillRoots } = resolveSkillScriptParameters([
      'music-to-svg/scripts/convert.py', '--file', 'input.musicxml'
    ]);
    expect(resolvedParameters[0]).toBe('/Users/tester/.agents/skills/music-to-svg/scripts/convert.py');
    expect(resolvedParameters[1]).toBe('--file');
    expect(resolvedParameters[2]).toBe('input.musicxml');
    expect(skillRoots).toEqual(['/Users/tester/.agents/skills/music-to-svg']);
  });

  test('should leave parameters unchanged when skill is not found', () => {
    mockedGetSkillSourcePath.mockReturnValue(undefined);
    const { resolvedParameters, skillRoots } = resolveSkillScriptParameters([
      'unknown-skill/scripts/run.sh'
    ]);
    expect(resolvedParameters[0]).toBe('unknown-skill/scripts/run.sh');
    expect(skillRoots).toEqual([]);
  });

  test('should resolve non-scripts paths under explicit skill-id prefix', () => {
    mockedGetSkillSourcePath.mockReturnValue('/home/user/.agents/skills/my-skill/SKILL.md');
    const { resolvedParameters, skillRoots } = resolveSkillScriptParameters([
      'my-skill/data/file.txt'
    ]);
    expect(resolvedParameters[0]).toBe('/home/user/.agents/skills/my-skill/data/file.txt');
    expect(skillRoots).toEqual(['/home/user/.agents/skills/my-skill']);
  });

  test('should resolve .agents/skills/<skill-id>/scripts/file.py prefix', () => {
    mockedGetSkillSourcePath.mockReturnValue('/Users/tester/.agents/skills/music-to-svg/SKILL.md');
    const { resolvedParameters, skillRoots } = resolveSkillScriptParameters([
      '.agents/skills/music-to-svg/scripts/convert.py', '--file', 'tmp_input.musicxml'
    ]);
    expect(resolvedParameters[0]).toBe('/Users/tester/.agents/skills/music-to-svg/scripts/convert.py');
    expect(resolvedParameters[1]).toBe('--file');
    expect(resolvedParameters[2]).toBe('tmp_input.musicxml');
    expect(skillRoots).toEqual(['/Users/tester/.agents/skills/music-to-svg']);
  });

  test('should resolve skills/<skill-id>/scripts/file.py prefix', () => {
    mockedGetSkillSourcePath.mockReturnValue('/Users/tester/.agents/skills/pdf-extract/SKILL.md');
    const { resolvedParameters, skillRoots } = resolveSkillScriptParameters([
      'skills/pdf-extract/scripts/run.sh'
    ]);
    expect(resolvedParameters[0]).toBe('/Users/tester/.agents/skills/pdf-extract/scripts/run.sh');
    expect(skillRoots).toEqual(['/Users/tester/.agents/skills/pdf-extract']);
  });

  test('should resolve .agents/skills/<skill-id>/non-scripts paths', () => {
    mockedGetSkillSourcePath.mockReturnValue('/Users/tester/.agents/skills/my-tool/SKILL.md');
    const { resolvedParameters, skillRoots } = resolveSkillScriptParameters([
      '.agents/skills/my-tool/data/input.json'
    ]);
    expect(resolvedParameters[0]).toBe('/Users/tester/.agents/skills/my-tool/data/input.json');
    expect(skillRoots).toEqual(['/Users/tester/.agents/skills/my-tool']);
  });

  test('should resolve bare relative path by scanning registered skills', () => {
    mockedGetSkills.mockReturnValue([
      { skill_id: 'music-to-svg', description: 'Convert music', hash: 'abc', lastUpdated: '2026-01-01' },
    ]);
    mockedGetSkillSourcePath.mockImplementation((skillId) =>
      skillId === 'music-to-svg'
        ? '/Users/tester/.agents/skills/music-to-svg/SKILL.md'
        : undefined
    );
    mockedExistsSync.mockImplementation((p) =>
      String(p) === '/Users/tester/.agents/skills/music-to-svg/scripts/convert.py'
    );
    const { resolvedParameters, skillRoots } = resolveSkillScriptParameters([
      'scripts/convert.py', '--file', 'input.musicxml'
    ], undefined, { allowBareScriptsResolution: true });
    expect(resolvedParameters[0]).toBe('/Users/tester/.agents/skills/music-to-svg/scripts/convert.py');
    expect(resolvedParameters[1]).toBe('--file');
    expect(resolvedParameters[2]).toBe('input.musicxml');
    expect(skillRoots).toEqual(['/Users/tester/.agents/skills/music-to-svg']);
  });

  test('should leave bare relative path unchanged when no skill has that file', () => {
    mockedGetSkills.mockReturnValue([
      { skill_id: 'other-skill', description: 'Other', hash: 'def', lastUpdated: '2026-01-01' },
    ]);
    mockedGetSkillSourcePath.mockImplementation((skillId) =>
      skillId === 'other-skill'
        ? '/Users/tester/.agents/skills/other-skill/SKILL.md'
        : undefined
    );
    mockedExistsSync.mockReturnValue(false);
    const { resolvedParameters, skillRoots } = resolveSkillScriptParameters([
      'scripts/convert.py'
    ], undefined, { allowBareScriptsResolution: true });
    expect(resolvedParameters[0]).toBe('scripts/convert.py');
    expect(skillRoots).toEqual([]);
  });

  test('should resolve bare relative path from runtime directory skillsRoot', () => {
    mockedGetSkills.mockReturnValue([]);
    mockedReaddirSync.mockReturnValue([
      {
        name: 'music-to-svg',
        isDirectory: () => true,
      },
    ] as any);
    mockedExistsSync.mockImplementation((p) =>
      String(p) === '/Users/esun/Documents/Projects/test-agent-world/.agents/skills'
      || String(p) === '/Users/esun/Documents/Projects/test-agent-world/.agents/skills/music-to-svg/convert.py'
    );

    const { resolvedParameters, skillRoots } = resolveSkillScriptParameters(
      ['scripts/convert.py', '--file', 'input_music.xml'],
      '/Users/esun/Documents/Projects/test-agent-world/.agents/skills',
      { allowBareScriptsResolution: true },
    );

    expect(resolvedParameters[0]).toBe('/Users/esun/Documents/Projects/test-agent-world/.agents/skills/music-to-svg/convert.py');
    expect(resolvedParameters[1]).toBe('--file');
    expect(resolvedParameters[2]).toBe('input_music.xml');
    expect(skillRoots).toEqual(['/Users/esun/Documents/Projects/test-agent-world/.agents/skills/music-to-svg']);
  });

  test('should resolve bare relative path when skill folder is a symlink', () => {
    mockedGetSkills.mockReturnValue([]);
    mockedReaddirSync.mockReturnValue([
      {
        name: 'music-to-svg',
        isDirectory: () => false,
        isSymbolicLink: () => true,
      },
    ] as any);
    mockedExistsSync.mockImplementation((p) =>
      String(p) === '/Users/esun/Documents/Projects/test-agent-world/.agents/skills'
      || String(p) === '/Users/esun/Documents/Projects/test-agent-world/.agents/skills/music-to-svg/convert.py'
    );

    const { resolvedParameters, skillRoots } = resolveSkillScriptParameters(
      ['scripts/convert.py'],
      '/Users/esun/Documents/Projects/test-agent-world/.agents/skills',
      { allowBareScriptsResolution: true },
    );

    expect(resolvedParameters[0]).toBe('/Users/esun/Documents/Projects/test-agent-world/.agents/skills/music-to-svg/convert.py');
    expect(skillRoots).toEqual(['/Users/esun/Documents/Projects/test-agent-world/.agents/skills/music-to-svg']);
  });

  test('should keep bare relative path unchanged when request is not skill-originated', () => {
    mockedGetSkills.mockReturnValue([
      { skill_id: 'music-to-svg', description: 'Convert music', hash: 'abc', lastUpdated: '2026-01-01' },
    ]);
    mockedGetSkillSourcePath.mockImplementation((skillId) =>
      skillId === 'music-to-svg'
        ? '/Users/tester/.agents/skills/music-to-svg/SKILL.md'
        : undefined
    );
    mockedExistsSync.mockReturnValue(true);

    const { resolvedParameters, skillRoots } = resolveSkillScriptParameters([
      'scripts/convert.py', '--file', 'input.musicxml'
    ]);

    expect(resolvedParameters[0]).toBe('scripts/convert.py');
    expect(resolvedParameters[1]).toBe('--file');
    expect(resolvedParameters[2]).toBe('input.musicxml');
    expect(skillRoots).toEqual([]);
  });

  test('should not treat dot-prefixed relative paths as skill-id paths', () => {
    mockedGetSkills.mockReturnValue([
      { skill_id: 'music-to-svg', description: 'Convert music', hash: 'abc', lastUpdated: '2026-01-01' },
    ]);
    mockedGetSkillSourcePath.mockImplementation((skillId) =>
      skillId === 'music-to-svg'
        ? '/Users/tester/.agents/skills/music-to-svg/SKILL.md'
        : undefined
    );
    mockedExistsSync.mockReturnValue(true);

    const { resolvedParameters, skillRoots } = resolveSkillScriptParameters([
      './../../etc',
      './this-directory-does-not-exist-xyz',
      '../outside'
    ]);

    expect(resolvedParameters).toEqual([
      './../../etc',
      './this-directory-does-not-exist-xyz',
      '../outside'
    ]);
    expect(skillRoots).toEqual([]);
  });

  test('should not treat option-like tokens with slashes as skill-id paths', () => {
    mockedGetSkills.mockReturnValue([
      { skill_id: 'music-to-svg', description: 'Convert music', hash: 'abc', lastUpdated: '2026-01-01' },
    ]);
    mockedGetSkillSourcePath.mockImplementation((skillId) =>
      skillId === 'music-to-svg'
        ? '/Users/tester/.agents/skills/music-to-svg/SKILL.md'
        : undefined
    );
    mockedExistsSync.mockReturnValue(true);

    const { resolvedParameters, skillRoots } = resolveSkillScriptParameters([
      '--output=/tmp/outside',
      '-I/tmp/include',
      '-L/opt/lib'
    ]);

    expect(resolvedParameters).toEqual([
      '--output=/tmp/outside',
      '-I/tmp/include',
      '-L/opt/lib'
    ]);
    expect(skillRoots).toEqual([]);
  });

  test('should resolve non-scripts folder path with generic prefix fallback', () => {
    mockedGetSkills.mockReturnValue([]);
    mockedReaddirSync.mockReturnValue([
      {
        name: 'music-to-svg',
        isDirectory: () => true,
      },
    ] as any);
    mockedExistsSync.mockImplementation((p) =>
      String(p) === '/Users/esun/Documents/Projects/test-agent-world/.agents/skills'
      || String(p) === '/Users/esun/Documents/Projects/test-agent-world/.agents/skills/music-to-svg/convert.py'
    );

    const { resolvedParameters, skillRoots } = resolveSkillScriptParameters(
      ['tools/convert.py', '--file', 'input_music.xml'],
      '/Users/esun/Documents/Projects/test-agent-world/.agents/skills',
      { allowBareScriptsResolution: true },
    );

    expect(resolvedParameters[0]).toBe('/Users/esun/Documents/Projects/test-agent-world/.agents/skills/music-to-svg/convert.py');
    expect(resolvedParameters[1]).toBe('--file');
    expect(resolvedParameters[2]).toBe('input_music.xml');
    expect(skillRoots).toEqual(['/Users/esun/Documents/Projects/test-agent-world/.agents/skills/music-to-svg']);
  });
});

describe('resolveSkillScriptCommand', () => {
  beforeEach(() => {
    mockedGetSkillSourcePath.mockReset();
    mockedGetSkills.mockReset();
    mockedExistsSync.mockReset();
    mockedReaddirSync.mockReset();
    mockedGetSkills.mockReturnValue([]);
    mockedExistsSync.mockReturnValue(false);
    mockedReaddirSync.mockReturnValue([] as any);
  });

  test('should resolve ./scripts executable from active skill root', () => {
    const activeSkillContexts = [{ skillId: 'search', skillRoot: '/Users/tester/.agents/skills/search' }];
    mockedExistsSync.mockImplementation((p) =>
      String(p) === '/Users/tester/.agents/skills/search/scripts/search.sh'
    );

    const { resolvedCommand, skillRoots } = resolveSkillScriptCommand(
      './scripts/search.sh',
      '/Users/tester/.agents/skills',
      {
        allowBareScriptsResolution: true,
        activeSkillContexts,
      },
    );

    expect(resolvedCommand).toBe('/Users/tester/.agents/skills/search/scripts/search.sh');
    expect(skillRoots).toEqual(['/Users/tester/.agents/skills/search']);
  });

  test('should leave direct relative executables unchanged without skill context', () => {
    const { resolvedCommand, skillRoots } = resolveSkillScriptCommand(
      './scripts/search.sh',
      '/Users/tester/.agents/skills',
      {
        allowBareScriptsResolution: false,
        activeSkillContexts: [],
      },
    );

    expect(resolvedCommand).toBe('./scripts/search.sh');
    expect(skillRoots).toEqual([]);
  });
});

describe('validateShellCommandScope with additional trusted roots', () => {
  test('should accept skill root paths via additionalTrustedRoots', () => {
    const result = validateShellCommandScope(
      'python3',
      ['/home/user/.agents/skills/music-to-svg/scripts/convert.py'],
      '/projects/myapp',
      ['/home/user/.agents/skills/music-to-svg']
    );
    expect(result.valid).toBe(true);
  });

  test('should reject unknown paths not in trusted roots or working dir', () => {
    const result = validateShellCommandScope(
      'python3',
      ['/etc/secret/file.py'],
      '/projects/myapp',
      ['/home/user/.agents/skills/music-to-svg']
    );
    expect(result.valid).toBe(false);
  });
});
