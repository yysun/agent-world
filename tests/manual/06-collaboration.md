- Use the playwright tool to navigate to http://localhost:8080/World/Test%20World
- Create a new chat
- Send a message: @a1 Kick off a plan and invite @a2 to add a risk check.
- When a1 finishes, send: @a2 Provide your risk check and hand off to @a3 for next steps.
- After a2 responds, send: @a3 Wrap up the plan.
- Expected result: Only the agent mentioned in each human message responds. The hand-off order should progress a1 → a2 → a3.

Notes:
- Ensure the web server is running and you have the Test World roster visible before starting.
