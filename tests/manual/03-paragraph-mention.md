- Use the playwright tool to navigate to http://localhost:8080/World/Test%20World
- Create a new chat
- Send a message:
```
Here is the latest status update.
@a2 Please provide a short reaction.
```
- Expected result: Only a2 responds. Placing the mention at the start of its own paragraph restricts the reply to the addressed agent.

Notes:
- Ensure the web server is running and you have the Test World roster visible before starting.
