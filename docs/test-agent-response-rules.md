# Agent Response Rules - Automated E2E Testing

## Overview

Automated integration tests for validating agent response behavior rules using real LLM API calls.

Previously, these scenarios were only documented in [tests/manual/rule-test.md](../tests/manual/rule-test.md) and required manual execution via the web UI. Now they are fully automated.

## What Was Created

### 1. Main Test File
**Location**: `tests/e2e/test-agent-response-rules.ts`

Comprehensive E2E test covering:
- ✅ **Broadcast Rule**: All agents respond to initial human message
- ✅ **Direct Mention Rule**: Only @mentioned agent responds  
- ✅ **Paragraph Mention Rule**: Only paragraph-beginning mention triggers response
- ✅ **Mid-Text Mention Rule**: Mention stored in memory, no immediate response
- ✅ **Turn Limit Rule**: Maximum 5 agent turns enforced

### 2. Documentation
**Location**: `tests/e2e/README.md`

Complete guide covering:
- Prerequisites and setup
- All available E2E tests
- Auto vs interactive modes
- Expected results and troubleshooting
- Best practices

### 3. NPM Scripts
Added to `package.json`:
```json
"test:e2e": "npx tsx tests/e2e/test-agent-response-rules.ts",
"test:e2e:interactive": "npx tsx tests/e2e/test-agent-response-rules.ts -i"
```

## Quick Start

### Prerequisites
1. Create `.env` file with API key:
   ```bash
   ANTHROPIC_API_KEY=your_key_here
   ```

2. Ensure Default World exists with agents `a1`, `a2`, `a3`
   OR use `--create-world` flag to create temporary test world

### Run Tests

```bash
# Auto mode (recommended for CI/CD)
npm run test:e2e

# Interactive mode (pause at each step)
npm run test:e2e:interactive

# Auto mode with temporary test world
npx tsx tests/e2e/test-agent-response-rules.ts --create-world

# Specify custom model/provider
TEST_PROVIDER=anthropic TEST_MODEL=claude-3-5-sonnet-20241022 \
  npx tsx tests/e2e/test-agent-response-rules.ts --create-world
```

## Test Architecture

Each test follows this pattern:

1. **Setup**: 
   - Load Default World or create test world
   - Subscribe to world events
   - Verify agents exist

2. **Execute Test Scenario**:
   - Create new chat
   - Publish message
   - Wait for agent responses
   - Verify response behavior

3. **Verify Results**:
   - Count agent responses
   - Check which agents responded
   - Validate against expected behavior

4. **Cleanup**:
   - Delete test chat
   - Unsubscribe from world

## Expected Results

All 5 tests should pass when agent response rules work correctly:

```
═══════════════════════════════════════════════════════════════════
  Test Results Summary
═══════════════════════════════════════════════════════════════════
Total Tests: 5
Passed: 5 ✅
Failed: 0 ❌
Pass Rate: 100.0%

═══════════════════════════════════════════════════════════════════
  ✅ All tests passed!
═══════════════════════════════════════════════════════════════════
```

## Comparison: Manual vs Automated

### Before (Manual Testing)
- ❌ Required manual execution via web UI
- ❌ Time-consuming (15-30 minutes per full run)
- ❌ Inconsistent results (human error)
- ❌ No CI/CD integration
- ❌ Difficult to reproduce issues

### After (Automated Testing)
- ✅ Fully automated execution
- ✅ Fast (2-5 minutes per full run)
- ✅ Consistent, repeatable results
- ✅ CI/CD ready
- ✅ Easy issue reproduction
- ✅ Regression testing enabled

## Integration with CI/CD

These tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run E2E Agent Response Tests
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  run: |
    npm run test:e2e
```

**Note**: Consider costs of real LLM API calls in CI/CD. May want to:
- Run on main branch only
- Use in nightly builds
- Create dedicated test budget

## Troubleshooting

### Common Issues

1. **"Failed to load Default World"**
   - Use `--create-world` flag
   - Or create Default World via web UI

2. **Test timeouts**
   - LLM responses vary in speed
   - Wait times are generous (10-45s)
   - Check network/API service status

3. **Unexpected agent responses**
   - LLM behavior can vary
   - Review agent system prompts
   - Check latest response rules in `.docs/concepts.md`

4. **API rate limits**
   - Space out test runs
   - Use different API key for testing
   - Some providers have rate limits

## Future Enhancements

Potential additions to test suite:

- [ ] Multi-agent collaboration sequences (hand-off patterns)
- [ ] World pass command testing
- [ ] Agent ignore rules (agents don't respond to each other)
- [ ] Complex mention patterns
- [ ] Tool approval integration with response rules
- [ ] Performance benchmarks (response latency)
- [ ] Cross-provider consistency tests

## Related Documentation

- [tests/manual/rule-test.md](../tests/manual/rule-test.md) - Original manual test scenarios
- [tests/e2e/README.md](../tests/e2e/README.md) - Complete E2E test documentation
- [tests/README.md](../tests/README.md) - Full test suite overview
- [docs/concepts.md](./concepts.md) - Agent World concepts and rules
