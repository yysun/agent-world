/**
 * Test for WebSocket Command Response Correlation
 * 
 * This test verifies that the server properly sends requestId in command responses
 * and that the client can correlate responses with requests.
 */

import { WebSocket } from 'ws';

async function testCommandResponseCorrelation() {
  console.log('Testing WebSocket Command Response Correlation...');

  // Connect to WebSocket server
  const ws = new WebSocket('ws://localhost:3000/ws');

  return new Promise((resolve, reject) => {
    let connected = false;
    const testRequestId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    ws.on('open', () => {
      connected = true;
      console.log('✓ Connected to WebSocket server');

      // Send a test command request
      const testRequest = {
        id: testRequestId,
        type: 'getWorlds',
        timestamp: new Date().toISOString()
      };

      const message = {
        type: 'system',
        payload: {
          eventType: 'command-request',
          request: testRequest
        }
      };

      console.log(`Sending test command with requestId: ${testRequestId}`);
      ws.send(JSON.stringify(message));
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        console.log('Received response:', JSON.stringify(response, null, 2));

        // Check if this is a command response
        if (response.type === 'system' &&
          response.payload?.eventType === 'command-response') {

          const commandResponse = response.payload.response;

          // Verify requestId correlation
          if (commandResponse.requestId === testRequestId) {
            console.log('✓ Command response correlation successful!');
            console.log(`✓ RequestId matches: ${commandResponse.requestId}`);
            console.log(`✓ Response success: ${commandResponse.success}`);
            console.log(`✓ Response type: ${commandResponse.type}`);

            ws.close();
            resolve(true);
          } else {
            console.log(`✗ RequestId mismatch. Expected: ${testRequestId}, Got: ${commandResponse.requestId}`);
            ws.close();
            reject(new Error('RequestId mismatch'));
          }
        }
      } catch (error) {
        console.error('Error parsing response:', error);
        ws.close();
        reject(error);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      reject(error);
    });

    ws.on('close', () => {
      if (!connected) {
        reject(new Error('Failed to connect to WebSocket server'));
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (connected) {
        ws.close();
        reject(new Error('Test timeout - no response received'));
      }
    }, 10000);
  });
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testCommandResponseCorrelation()
    .then(() => {
      console.log('✓ All tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('✗ Test failed:', error.message);
      process.exit(1);
    });
}

export { testCommandResponseCorrelation };
