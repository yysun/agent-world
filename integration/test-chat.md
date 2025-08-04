---
cmd: npx tsx integration/test-chat.core.ts
---
# Test steps
- getFullWorld 'test-world'
- log current chat id
- new chat
- log current chat id
- sendMessage 'Hello, world!'
- getFullWorld 'test-world'
- log full the new chat