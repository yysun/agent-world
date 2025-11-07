- Use the playwright tool to navigate to http://localhost:8080/World/Test%20World
- Create a new chat
- Send a message: @a1 Share a brief idea without asking the others to reply.
- After a1 replies, wait 30 seconds without sending another message.
- Expected result: The conversation remains idle—a1 does not respond to its own message, and a2/a3 remain silent because they were neither addressed nor mentioned.

Notes:
- Ensure the web server is running and you have the Test World roster visible before starting.
