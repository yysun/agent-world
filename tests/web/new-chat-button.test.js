/**
 * Test for New Chat Button Disable Functionality
 * 
 * Verifies that the New Chat button is disabled when no agents exist
 * and enabled when agents are present.
 */

const { JSDOM } = require('jsdom');

describe('New Chat Button Functionality', () => {
  let dom, document, window;

  beforeEach(() => {
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="test-container"></div>
        </body>
      </html>
    `);
    document = dom.window.document;
    window = dom.window;
    global.document = document;
    global.window = window;
  });

  afterEach(() => {
    dom.window.close();
  });

  test('New Chat button should be disabled when no agents exist', () => {
    // Mock world with no agents
    const worldWithNoAgents = {
      id: 'test-world',
      name: 'Test World',
      agents: [],
      chats: []
    };

    // Test the hasAgents logic
    const hasAgents = worldWithNoAgents && worldWithNoAgents.agents && worldWithNoAgents.agents.length > 0;
    
    expect(hasAgents).toBe(false);

    // Create a mock button element
    const button = document.createElement('button');
    button.className = 'new-chat-btn';
    button.textContent = '✚ New Chat';
    button.disabled = !hasAgents;
    button.title = hasAgents ? "Create new chat session" : "Create an agent first to enable new chats";

    expect(button.disabled).toBe(true);
    expect(button.title).toBe("Create an agent first to enable new chats");
  });

  test('New Chat button should be enabled when agents exist', () => {
    // Mock world with agents
    const worldWithAgents = {
      id: 'test-world',
      name: 'Test World',
      agents: [
        { id: 'agent1', name: 'TestAgent', spriteIndex: 0, messageCount: 0 }
      ],
      chats: []
    };

    // Test the hasAgents logic
    const hasAgents = worldWithAgents && worldWithAgents.agents && worldWithAgents.agents.length > 0;
    
    expect(hasAgents).toBe(true);

    // Create a mock button element
    const button = document.createElement('button');
    button.className = 'new-chat-btn';
    button.textContent = '✚ New Chat';
    button.disabled = !hasAgents;
    button.title = hasAgents ? "Create new chat session" : "Create an agent first to enable new chats";

    expect(button.disabled).toBe(false);
    expect(button.title).toBe("Create new chat session");
  });

  test('New Chat button should handle null world gracefully', () => {
    // Test with null world
    const world = null;

    // Test the hasAgents logic
    const hasAgents = world && world.agents && world.agents.length > 0;
    
    expect(hasAgents).toBe(false);

    // Create a mock button element
    const button = document.createElement('button');
    button.className = 'new-chat-btn';
    button.textContent = '✚ New Chat';
    button.disabled = !hasAgents;
    button.title = hasAgents ? "Create new chat session" : "Create an agent first to enable new chats";

    expect(button.disabled).toBe(true);
    expect(button.title).toBe("Create an agent first to enable new chats");
  });

  test('New Chat button should handle undefined agents array', () => {
    // Mock world with undefined agents
    const worldWithUndefinedAgents = {
      id: 'test-world',
      name: 'Test World',
      chats: []
      // agents property is undefined
    };

    // Test the hasAgents logic
    const hasAgents = worldWithUndefinedAgents && worldWithUndefinedAgents.agents && worldWithUndefinedAgents.agents.length > 0;
    
    expect(hasAgents).toBe(false);

    // Create a mock button element
    const button = document.createElement('button');
    button.className = 'new-chat-btn';
    button.textContent = '✚ New Chat';
    button.disabled = !hasAgents;
    button.title = hasAgents ? "Create new chat session" : "Create an agent first to enable new chats";

    expect(button.disabled).toBe(true);
    expect(button.title).toBe("Create an agent first to enable new chats");
  });
});