/**
 * Manual test for enhanced tool result display
 * 
 * Tests that tool results show the tool name and arguments instead of just the tool_call_id.
 * This is a simplified test that just checks the formatting logic.
 * 
 * Run with: npx tsx tests/manual/test-tool-result-display.ts
 */

import type { AgentMessage } from '../../core/types.js';

// Simulate the tool result display logic from export.ts
function formatToolResult(
  toolMessage: AgentMessage,
  index: number,
  consolidatedMessages: AgentMessage[]
): string {
  const toolCallId = (toolMessage as any).tool_call_id || 'unknown';

  // Find the tool call details from previous assistant messages
  let toolName = 'unknown';
  let toolArgs = '';
  for (let i = index - 1; i >= 0; i--) {
    const prevMsg = consolidatedMessages[i];
    if (prevMsg.role === 'assistant' && prevMsg.tool_calls) {
      const toolCall = prevMsg.tool_calls.find((tc: any) => tc.id === toolCallId);
      if (toolCall) {
        toolName = toolCall.function?.name || 'unknown';
        try {
          const args = JSON.parse(toolCall.function?.arguments || '{}');
          const argKeys = Object.keys(args);
          if (argKeys.length > 0) {
            // Show first 2-3 arguments with truncated values
            const argSummary = argKeys.slice(0, 3).map(key => {
              const val = args[key];
              const strVal = typeof val === 'string' ? val : JSON.stringify(val);
              return `${key}: ${strVal.length > 50 ? strVal.substring(0, 47) + '...' : strVal}`;
            }).join(', ');
            toolArgs = argKeys.length > 3 ? ` (${argSummary}, ...)` : ` (${argSummary})`;
          }
        } catch {
          toolArgs = '';
        }
        break;
      }
    }
  }

  return `[Tool: ${toolName}${toolArgs}]`;
}

async function testToolResultDisplay() {
  console.log('Testing enhanced tool result display...\n');

  // Test data
  const messages: AgentMessage[] = [
    // User message
    {
      role: 'user',
      content: 'List the files in the current directory',
      messageId: 'msg-1'
    },
    // Assistant message with tool call
    {
      role: 'assistant',
      content: '',
      messageId: 'msg-2',
      tool_calls: [
        {
          id: 'call_abc123',
          type: 'function',
          function: {
            name: 'run_command',
            arguments: JSON.stringify({
              command: 'ls -la',
              cwd: '/home/user/project',
              timeout: 30000
            })
          }
        }
      ]
    },
    // Tool result
    {
      role: 'tool',
      content: 'total 48\ndrwxr-xr-x  12 user staff   384 Nov 11 16:00 .',
      tool_call_id: 'call_abc123',
      messageId: 'msg-3'
    },
    // Assistant response with multiple tool calls
    {
      role: 'assistant',
      content: '',
      messageId: 'msg-4',
      tool_calls: [
        {
          id: 'call_def456',
          type: 'function',
          function: {
            name: 'read_file',
            arguments: JSON.stringify({
              filePath: '/very/long/path/to/some/file/with/a/really/long/name/that/should/be/truncated/in/display.txt',
              offset: 0,
              limit: 100
            })
          }
        },
        {
          id: 'call_ghi789',
          type: 'function',
          function: {
            name: 'grep_search',
            arguments: JSON.stringify({
              query: 'function.*export',
              isRegexp: true,
              includePattern: '**/*.ts',
              maxResults: 50
            })
          }
        }
      ]
    },
    // Tool results for multiple calls
    {
      role: 'tool',
      content: 'File contents here...',
      tool_call_id: 'call_def456',
      messageId: 'msg-5'
    },
    {
      role: 'tool',
      content: 'Search results...',
      tool_call_id: 'call_ghi789',
      messageId: 'msg-6'
    }
  ];

  // Test each tool result
  const results: string[] = [];
  messages.forEach((msg, idx) => {
    if (msg.role === 'tool') {
      results.push(formatToolResult(msg, idx, messages));
    }
  });

  console.log('--- Tool Result Display Tests ---\n');

  // Test 1: run_command with simple arguments
  console.log('Test 1: run_command tool result');
  console.log('Expected: [Tool: run_command (command: ls -la, cwd: /home/user/project, ...)]');
  console.log('Actual:  ', results[0]);
  const test1Pass = results[0].includes('[Tool: run_command') &&
    results[0].includes('command: ls -la') &&
    results[0].includes('cwd: /home/user/project');
  console.log(`Result: ${test1Pass ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 2: read_file with long path (should truncate)
  console.log('Test 2: read_file with long path (truncation test)');
  console.log('Expected: [Tool: read_file (filePath: /very/long/path/to/some/file/wit..., offset: 0, limit: 100)]');
  console.log('Actual:  ', results[1]);
  const test2Pass = results[1].includes('[Tool: read_file') &&
    results[1].includes('...');
  console.log(`Result: ${test2Pass ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 3: grep_search with multiple args and "..." suffix
  console.log('Test 3: grep_search with 4+ arguments (should show "..." suffix)');
  console.log('Expected: [Tool: grep_search (query: function.*export, isRegexp: true, includePattern: **/*.ts, ...)]');
  console.log('Actual:  ', results[2]);
  const test3Pass = results[2].includes('[Tool: grep_search') &&
    results[2].includes('(') &&
    results[2].includes(', ...)');
  console.log(`Result: ${test3Pass ? '✅ PASS' : '❌ FAIL'}\n`);

  // Overall result
  const allPassed = test1Pass && test2Pass && test3Pass;

  console.log('--- Summary ---');
  console.log(`Total: 3 tests`);
  console.log(`Passed: ${[test1Pass, test2Pass, test3Pass].filter(Boolean).length}`);
  console.log(`Failed: ${[test1Pass, test2Pass, test3Pass].filter(x => !x).length}`);
  console.log('\n' + (allPassed ? '✅ All tests passed!' : '❌ Some tests failed'));

  return allPassed;
}

// Run the test
testToolResultDisplay().then(passed => {
  process.exit(passed ? 0 : 1);
}).catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
