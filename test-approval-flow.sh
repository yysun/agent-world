#!/bin/bash

# Test Runner for WebSocket Approval Flow Integration Test
#
# This script helps run the approval flow integration test by checking prerequisites
# and providing clear instructions for manual setup.

echo "🔧 WebSocket Approval Flow Integration Test Runner"
echo "=================================================="
echo

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "tests/integration" ]; then
    echo "❌ Error: Please run this script from the agent-world root directory"
    exit 1
fi

# Check if the test file exists
if [ ! -f "tests/integration/approval-flow-ws.test.ts" ]; then
    echo "❌ Error: Approval flow test file not found"
    exit 1
fi

echo "📋 Prerequisites Check:"
echo

# Check if WebSocket server is running
if lsof -i :3001 >/dev/null 2>&1; then
    echo "✅ WebSocket server detected on port 3001"
    WS_RUNNING=true
else
    echo "❌ WebSocket server not running on port 3001"
    WS_RUNNING=false
fi

# Check if queue processor could be running (this is optional)
if pgrep -f "queue-processor" >/dev/null 2>&1; then
    echo "✅ Queue processor detected"
else
    echo "ℹ️  Queue processor not running (some tests will be skipped)"
fi

echo

if [ "$WS_RUNNING" = false ]; then
    echo "🚀 Setup Instructions:"
    echo
    echo "1. Start WebSocket server in Terminal 1:"
    echo "   cd $(pwd)"
    echo "   AGENT_WORLD_STORAGE_TYPE=memory npm run ws:watch"
    echo
    echo "2. (Optional) Start queue processor in Terminal 2:"
    echo "   cd $(pwd)"
    echo "   npm run queue-processor"
    echo
    echo "3. Run this script again to execute the test"
    echo
    exit 1
fi

echo "🧪 Running Approval Flow Integration Test:"
echo

# Run the integration test
npx vitest run tests/integration/approval-flow-ws.test.ts --config vitest.integration.config.ts

# Check the exit code
if [ $? -eq 0 ]; then
    echo
    echo "✅ All tests passed! Approval flow is working correctly."
else
    echo
    echo "❌ Some tests failed. Check the output above for details."
    echo
    echo "Common issues:"
    echo "- WebSocket server not responding (restart with AGENT_WORLD_STORAGE_TYPE=memory npm run ws:watch)"
    echo "- Queue processor not running (start with npm run queue-processor)"
    echo "- LLM model not available (ensure ollama is running with llama3.2:3b)"
fi

echo
echo "🔍 Test Details:"
echo "- Test file: tests/integration/approval-flow-ws.test.ts"
echo "- Server: ws://localhost:3001"
echo "- Storage: memory (ephemeral)"
echo "- Model: ollama/llama3.2:3b"