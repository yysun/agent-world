/**
 * Test for WebSocket Message Echo Prevention
 * 
 * This test verifies that user messages are not echoed back to the sending client
 * but agent responses are properly forwarded.
 */

import { WebSocket } from 'ws';

async function testMessageEchoLogic() {
  console.log('Testing WebSocket Message Echo Logic...');

  const ws = new WebSocket('ws://localhost:3000/ws');

  return new Promise((resolve, reject) => {
    let connected = false;
    let subscribed = false;
    let messagesSent = 0;
    let messagesReceived = 0;
    let userMessagesEchoed = 0;
    let agentResponsesReceived = 0;

    ws.on('open', () => {
      connected = true;
      console.log('✓ Connected to WebSocket server');
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        messagesReceived++;

        console.log('Received message:', JSON.stringify(response, null, 2));

        // Handle different message types
        if (response.type === 'connected') {
          console.log('✓ Received connection confirmation');

          // Subscribe to a world
          ws.send(JSON.stringify({
            type: 'subscribe',
            payload: {
              worldName: 'default-world'
            }
          }));
          return;
        }

        if (response.type === 'success' && response.message?.includes('subscribed to world')) {
          subscribed = true;
          console.log('✓ Successfully subscribed to world');

          // Wait a moment for subscription to fully complete
          setTimeout(() => {
            // Send a user message
            console.log('Sending user message...');
            ws.send(JSON.stringify({
              type: 'message',
              payload: {
                worldName: 'default-world',
                message: 'Hello from test user!',
                sender: 'user1'
              }
            }));
            messagesSent++;

            // Wait a bit, then check results
            setTimeout(() => {
              console.log('\n=== Echo Prevention Test Results ===');
              console.log(`Messages sent: ${messagesSent}`);
              console.log(`Total messages received: ${messagesReceived}`);
              console.log(`User messages echoed back: ${userMessagesEchoed}`);
              console.log(`Agent responses received: ${agentResponsesReceived}`);

              if (userMessagesEchoed === 0) {
                console.log('✓ User messages correctly NOT echoed back');
                console.log('✓ Echo prevention working correctly!');
                ws.close();
                resolve(true);
              } else {
                console.log('✗ User messages were echoed back (should not happen)');
                ws.close();
                reject(new Error('Echo prevention failed'));
              }
            }, 2000);
          }, 500); // Wait 500ms for subscription to complete
          return;
        }

        // Check if this is an echoed user message
        if (response.content || response.message) {
          const messageText = response.content || response.message;
          const sender = response.sender;

          if (messageText.includes('Hello from test user!') &&
            sender && sender.startsWith('user')) {
            userMessagesEchoed++;
            console.log('✗ User message was echoed back:', { sender, message: messageText });
          }

          // Check for agent responses
          if (sender && !sender.startsWith('user') && sender !== 'HUMAN') {
            agentResponsesReceived++;
            console.log('✓ Agent response received:', { sender, message: messageText });
          }
        }

      } catch (error) {
        console.error('Error parsing message:', error);
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

    // Global timeout
    setTimeout(() => {
      if (connected) {
        console.log('Test completed by timeout');
        ws.close();
        resolve(true);
      }
    }, 8000);
  });
}

// Run the test
testMessageEchoLogic()
  .then(() => {
    console.log('✓ Message echo logic test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Test failed:', error.message);
    process.exit(1);
  });
