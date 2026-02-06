# End-to-End Tests with Real LLM Calls

This directory contains E2E tests that make actual LLM API calls to validate real-world behavior of Agent World.

## Prerequisites

1. **Environment Setup**: Create a `.env` file in project root with API keys:
   ```bash
   ANTHROPIC_API_KEY=your_key_here
   # OR
   OPENAI_API_KEY=your_key_here
   # OR
   GOOGLE_API_KEY=your_key_here
   ```

2. **Default World**: Most tests use the Default World. Ensure it exists with agents `a1`, `a2`, `a3`:
   ```bash
   # Start the server and create Default World via the web UI
   npm run server
   # Navigate to http://localhost:8080 and create agents
   ```

## Available Tests

### 1. Agent Response Rules (`test-agent-response-rules.ts`)

**Validates all agent response behavior rules with real LLM calls:**

- ✅ **Broadcast**: All agents respond to initial human message
- ✅ **Direct Mention**: Only @mentioned agent responds
- ✅ **Paragraph Mention**: Only paragraph-beginning mention triggers response
- ✅ **Mid-Text Mention**: Stored in memory, no immediate response
- ✅ **Turn Limit**: Maximum 5 agent turns enforced

**Run:**
```bash
# Auto mode (runs continuously)
npx tsx tests/e2e/test-agent-response-rules.ts
# OR use npm script
npm run test:e2e

# Interactive mode (pause at each step)
npx tsx tests/e2e/test-agent-response-rules.ts -i
# OR use npm script
npm run test:e2e:interactive

# Specify model and provider
TEST_PROVIDER=anthropic TEST_MODEL=claude-3-5-sonnet-20241022 npm run test:e2e
```

**Expected Results**: All tests should pass when agent response rules are working correctly.

## Test Modes

### Auto Mode (Default)
Tests run continuously with fixed wait periods. Best for CI/CD and quick validation.

### Interactive Mode (`-i`)
Tests pause at each step, waiting for user to press Enter. Useful for:
- Debugging test failures
- Understanding test flow
- Observing LLM responses in real-time
- Educational purposes

## Understanding Test Results

Each test outputs:
- ✅ **Passed tests**: Expected behavior observed
- ❌ **Failed tests**: Unexpected behavior with error details
- 📊 **Summary**: Pass rate and failed test details

Example output:
```
═══════════════════════════════════════════════════════════════════
  Test Results Summary
═════════════7
Passed: 7ts: 5
Passed: 5 ✅
Failed: 0 ❌
Pass Rate: 100.0%

═══════════════════════════════════════════════════════════════════
  ✅ All tests passed!
═══════════════════════════════════════════════════════════════════
```

## Troubleshooting
create test world"
- Ensure your database is accessible
- Check that the LLM provider (Ollama) is running
- Verify TEST_MODEL environment variable matches an available model
- Or use `--create-world` flag to create a temporary test world

### "API key not found" or 401 errors
- Check `.env` file has valid API key
- Verify key has sufficient credits/quota

### Tests timeout or hang
- LLM responses can be slow; wait times are generous but may need adjustment
- Check network connectivity
- Verify LLM service status

### Agents respond unexpectedly
- Check `.docs/concepts.md` for latest response rules
- Review agent system prompts in Default World configuration
- LLM behavior can vary; some tests (especially turn limit) allow margin for variance

## Best Practices

1. **Run tests individually** when debugging specific scenarios
2. **Use interactive mode** to understand test flow
3. **Check API costs** before running many times (these make real API calls)
4. **Create test worlds** with `--create-world` to avoid polluting Default World
5. **Review test output** carefully - LLM responses should align with test expectations

## Contributing

When adding new E2E tests:
1. Follow the existing pattern (setup, test scenarios, cleanup)
2. Support both auto and interactive modes
3. Track and report test results clearly
4. Document expected behavior and failure conditions
5. Clean up created resources (chats, worlds if temporary)
6. Update this README with new test documentation
