/**
 * Test file for tool call message formatting
 * 
 * Purpose: Verify that tool call messages include parameters
 * Features:
 * - Test single tool call with parameters
 * - Test multiple tool calls
 * - Test tool calls with long parameters
 * - Test tool calls with complex objects
 */

import { describe, it, expect } from 'vitest';

// Extract the formatting function for testing
function formatToolCallsMessage(toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>): string {
  const toolCount = toolCalls.length;

  if (toolCount === 1) {
    const tc = toolCalls[0];
    const toolName = tc.function.name;

    try {
      const args = JSON.parse(tc.function.arguments);
      const paramParts: string[] = [];

      // Format parameters - show up to 3 key parameters
      const keys = Object.keys(args).slice(0, 3);
      for (const key of keys) {
        let value = args[key];

        // Truncate long values
        if (typeof value === 'string' && value.length > 50) {
          value = value.substring(0, 47) + '...';
        } else if (typeof value === 'object') {
          value = JSON.stringify(value);
          if (value.length > 50) {
            value = value.substring(0, 47) + '...';
          }
        }

        paramParts.push(`${key}: ${JSON.stringify(value)}`);
      }

      if (Object.keys(args).length > 3) {
        paramParts.push('...');
      }

      return paramParts.length > 0
        ? `Calling tool: ${toolName} (${paramParts.join(', ')})`
        : `Calling tool: ${toolName}`;
    } catch (e) {
      // If arguments can't be parsed, just show the tool name
      return `Calling tool: ${toolName}`;
    }
  } else {
    // Multiple tools - just list the names
    const toolNames = toolCalls.map(tc => tc.function.name).join(', ');
    return `Calling ${toolCount} tools: ${toolNames}`;
  }
}

describe('Tool Call Message Formatting', () => {
  it('should format single tool call with simple parameters', () => {
    const toolCalls = [{
      id: 'call_1',
      type: 'function' as const,
      function: {
        name: 'shell_cmd',
        arguments: JSON.stringify({ command: 'echo test', directory: '/tmp' })
      }
    }];

    const result = formatToolCallsMessage(toolCalls);
    expect(result).toBe('Calling tool: shell_cmd (command: "echo test", directory: "/tmp")');
  });

  it('should format single tool call with one parameter', () => {
    const toolCalls = [{
      id: 'call_1',
      type: 'function' as const,
      function: {
        name: 'read_file',
        arguments: JSON.stringify({ filePath: '/path/to/file.ts' })
      }
    }];

    const result = formatToolCallsMessage(toolCalls);
    expect(result).toBe('Calling tool: read_file (filePath: "/path/to/file.ts")');
  });

  it('should truncate long parameter values', () => {
    const longValue = 'a'.repeat(100);
    const toolCalls = [{
      id: 'call_1',
      type: 'function' as const,
      function: {
        name: 'write_file',
        arguments: JSON.stringify({ content: longValue })
      }
    }];

    const result = formatToolCallsMessage(toolCalls);
    expect(result).toContain('Calling tool: write_file');
    expect(result).toContain('content:');
    expect(result).toContain('...');
    expect(result.length).toBeLessThan(150); // Should be truncated
  });

  it('should show up to 3 parameters and indicate more exist', () => {
    const toolCalls = [{
      id: 'call_1',
      type: 'function' as const,
      function: {
        name: 'complex_tool',
        arguments: JSON.stringify({
          param1: 'value1',
          param2: 'value2',
          param3: 'value3',
          param4: 'value4',
          param5: 'value5'
        })
      }
    }];

    const result = formatToolCallsMessage(toolCalls);
    expect(result).toBe('Calling tool: complex_tool (param1: "value1", param2: "value2", param3: "value3", ...)');
  });

  it('should format multiple tool calls without parameters', () => {
    const toolCalls = [
      {
        id: 'call_1',
        type: 'function' as const,
        function: {
          name: 'shell_cmd',
          arguments: JSON.stringify({ command: 'npm test' })
        }
      },
      {
        id: 'call_2',
        type: 'function' as const,
        function: {
          name: 'read_file',
          arguments: JSON.stringify({ filePath: 'test.ts' })
        }
      }
    ];

    const result = formatToolCallsMessage(toolCalls);
    expect(result).toBe('Calling 2 tools: shell_cmd, read_file');
  });

  it('should handle tool call with no parameters', () => {
    const toolCalls = [{
      id: 'call_1',
      type: 'function' as const,
      function: {
        name: 'get_status',
        arguments: JSON.stringify({})
      }
    }];

    const result = formatToolCallsMessage(toolCalls);
    expect(result).toBe('Calling tool: get_status');
  });

  it('should handle invalid JSON arguments gracefully', () => {
    const toolCalls = [{
      id: 'call_1',
      type: 'function' as const,
      function: {
        name: 'broken_tool',
        arguments: 'invalid json {'
      }
    }];

    const result = formatToolCallsMessage(toolCalls);
    expect(result).toBe('Calling tool: broken_tool');
  });

  it('should format object parameters with truncation', () => {
    const toolCalls = [{
      id: 'call_1',
      type: 'function' as const,
      function: {
        name: 'update_config',
        arguments: JSON.stringify({
          config: {
            very: 'long',
            nested: 'object',
            with: 'many',
            properties: 'that',
            should: 'be',
            truncated: 'properly'
          }
        })
      }
    }];

    const result = formatToolCallsMessage(toolCalls);
    expect(result).toContain('Calling tool: update_config');
    expect(result).toContain('config:');
    expect(result).toContain('...');
  });
});
