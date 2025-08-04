// npx tsx tests/integration/test-chat.integration.ts
// npx jest --config jest.integration.config.js --verbose tests/integration/test-chat.integration.test.ts
---
# Test steps
- getFullWorld 'test-world'
- log current chat id
- new chat
- log current chat id
- sendMessage 'Hello, world!'
- getFullWorld 'test-world'
- log full the new chat