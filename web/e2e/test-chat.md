## Test World Deletion, Creation, Agent Creation, and Chat Flow

Use Playwright Tools to test the following steps:

- [x] Navigate to http://localhost:8080.
- [x] Locate "test world" in the world selection list.
- [x] Click the delete (×) button for "test world."
- [x] Confirm deletion in the dialog by clicking "Delete."
- [x] Verify that "test world" was removed from the list.
- [x] Click the "+" button to create a new world.
- [x] Enter "test world" as the new world name.
- [x] Enter a description for the new world.
- [x] Create the world.
- [x] Wait for the world to be created and loaded.
- [x] Click "Create Agent" in "test world."
- [x] Enter "a1" as the agent name 
- [x] Enter "ollama" as the provider, and "llama3.2:3b" as the model.
- [x] Click "Create"
- [x] Create agent "a2" with provider "google", and model "gemini-2.5-pro".
- [x] Create agent "a3" with provider "azure", model "gpt-5-mini", and temperature 1.
- [x] Type "hi" in the chat message box and click "Send."
- [x] Click the "✚ New Chat" button.
- [x] Type "who are you" in the chat message box and click "Send."
- [x] Click on the "who are you" chat history entry to view the conversation.
- [x] Verify that the assistant's response is correct.
- [x] Go back to the home page