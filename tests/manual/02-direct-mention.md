- Use the playwright tool to navigate to http://localhost:8080/World/Test%20World
- Create a new chat
- Send a message: @a1 Please summarize our objectives.
- Expected result: Only a1 responds. Agents a2 and a3 stay silent because the human message directly addressed a1 at the start of the paragraph.

Notes:
- Ensure the web server is running and you have the Test World roster visible before starting.
