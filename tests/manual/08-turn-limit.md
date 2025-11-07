- Use the playwright tool to navigate to http://localhost:8080/World/Test%20World
- Create a new chat
- Send a message: Team, give me consecutive one-line status updates until you are forced to stop.
- Allow the agents to respond without further human input.
- Expected result: After at most five agent turns, the world automatically halts additional agent replies and yields control to the human, indicating the turn limit has been reached.

Notes:
- Ensure the web server is running and you have the Test World roster visible before starting.
