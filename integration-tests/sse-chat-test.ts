/**
 * SSE Chat Integration Test
 * 
 * Tests the REST API + SSE chat functionality to ensure:
 * - Messages are sent correctly via POST /worlds/:worldName/chat
 * - SSE stream is properly established and processed
 * - Different SSE event types are handled correctly
 * - Connection cleanup works properly
 * - Error handling works as expected
 */

// Simple assertion helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Simplified sendChatMessage for testing (without import dependencies)
async function sendChatMessage(worldName: string, message: string, sender = 'user1') {
  const url = `http://localhost:3000/worlds/${encodeURIComponent(worldName)}/chat`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify({ message, sender }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response;
}

async function testSSEConnection() {
  console.log('🧪 Testing SSE connection and event handling...');

  const testWorldName = 'Default World';
  const testMessage = 'Hello, this is a test message for SSE';
  const receivedEvents: any[] = [];
  let connectionEnded = false;
  let completionReceived = false;

  try {
    const response = await sendChatMessage(testWorldName, testMessage);

    assert(response.status === 200, 'Response status should be 200');
    const contentType = response.headers.get('content-type');
    assert(contentType?.includes('text/event-stream') === true, 'Content type should be text/event-stream');

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Read SSE stream for up to 15 seconds
    const timeout = setTimeout(() => {
      reader.cancel();
      connectionEnded = true;
    }, 15000);

    try {
      while (!connectionEnded) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;

          if (line.startsWith('data: ')) {
            try {
              const dataContent = line.slice(6).trim();
              if (dataContent === '') continue;

              const data = JSON.parse(dataContent);
              receivedEvents.push(data);

              console.log(`📡 Received SSE event: ${data.type}${data.payload?.type ? ` (${data.payload.type})` : ''}`);

              if (data.type === 'complete') {
                completionReceived = true;
                connectionEnded = true;
                break;
              }
            } catch (parseError) {
              console.error('❌ Error parsing SSE data:', parseError, 'Line:', line);
            }
          }
        }
      }
    } finally {
      clearTimeout(timeout);
      reader.cancel();
    }

    // Verify we received events
    assert(receivedEvents.length > 0, 'Should receive at least one event');

    // Check for connection confirmation
    const connectedEvent = receivedEvents.find(event => event.type === 'connected');
    assert(connectedEvent !== undefined, 'Should receive connected event');
    assert(connectedEvent?.payload?.worldName === testWorldName, 'Connected event should contain correct world name');

    // Should receive completion event
    assert(completionReceived, 'Should receive completion event');

    // Check for completion event
    const completeEvent = receivedEvents.find(event => event.type === 'complete');
    assert(completeEvent !== undefined, 'Should receive complete event');
    assert(completeEvent?.payload?.reason !== undefined, 'Complete event should have reason');

    console.log(`✅ SSE test completed successfully. Received ${receivedEvents.length} events.`);

    // Log event types for debugging
    const eventTypes = receivedEvents.map(e => e.type);
    console.log(`📊 Event types received: ${[...new Set(eventTypes)].join(', ')}`);

  } catch (error) {
    console.error('❌ SSE test failed:', error);
    throw error;
  }
}

async function testInvalidWorldName() {
  console.log('🧪 Testing invalid world name handling...');

  const invalidWorldName = 'non-existent-world-12345';
  const testMessage = 'Test message';

  try {
    await sendChatMessage(invalidWorldName, testMessage);
    throw new Error('Should have thrown an error for invalid world name');
  } catch (error: any) {
    assert(error.message.includes('404'), 'Should return 404 for invalid world name');
    console.log('✅ Invalid world name handled correctly:', error.message);
  }
}

async function testEmptyMessage() {
  console.log('🧪 Testing empty message handling...');

  const testWorldName = 'Default World';

  try {
    await sendChatMessage(testWorldName, '');
    throw new Error('Should have thrown an error for empty message');
  } catch (error: any) {
    assert(error.message.includes('400'), 'Should return 400 for empty message');
    console.log('✅ Empty message handled correctly:', error.message);
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting SSE Chat Integration Tests...\n');

  try {
    await testSSEConnection();
    console.log('');
    await testInvalidWorldName();
    console.log('');
    await testEmptyMessage();
    console.log('\n🎉 All SSE tests passed!');
  } catch (error) {
    console.error('\n💥 Test suite failed:', error);
    process.exit(1);
  }
}

runTests();
