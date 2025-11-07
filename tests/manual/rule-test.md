# Manual E2E Test Plan — Agent World Rules

These manual end-to-end scenarios validate the Agent World runtime rules using the dedicated test world that contains three assistant agents: **a1**, **a2**, and **a3**.

## Prerequisites

1. Start the Agent World web server locally.
2. In a browser, navigate to `http://localhost:8080/World` 
3. Find and enter the “Test World”.
4. If not present, create a new world named **Test World** and add three agents:
   - **a1**: `ollama/llama3.1:8b`
   - **a2**: `ollama/llama3.1:8b`
   - **a3**: `ollama/llama3.1:8b`
4. Confirm that agents `a1`, `a2`, and `a3` are listed in the world roster.
5. Before running each scenario, create a **new chat** from the chat selector to ensure isolation.

---

## Scenario 1 — Broadcast Human Message

1. Create a new chat.
2. Send `Hello team!`

**Expected result:** The initial human message is broadcast to every agent; **a1**, **a2**, and **a3** each respond once.

---

## Scenario 2 — Direct Mention at Message Start

1. Create a new chat.
2. Send `@a1 Please summarize our objectives.`

**Expected result:** Only **a1** responds. Agents **a2** and **a3** stay silent because the human message directly addressed **a1** at the start of the paragraph.

---

## Scenario 3 — Paragraph Mention

1. Create a new chat.
2. Send:
   ```
   Here is the latest status update.
   @a2 Please provide a short reaction.
   ```

**Expected result:** Only **a2** responds. Placing the mention at the start of its own paragraph restricts the reply to the addressed agent.

---

## Scenario 4 — Mid-Text Mention Becomes Memory

1. Create a new chat.
2. Send `Great work so far—let's loop in @a3 later.`

**Expected result:** No agent responds immediately. The mid-sentence mention is stored in memory for later retrieval instead of triggering a reply.

---

## Scenario 5 — Agents Ignore Each Other Unless Mentioned

1. Create a new chat.
2. Send `@a1 Share a brief idea without asking the others to reply.`
3. After **a1** replies, wait 30 seconds without sending another message.

**Expected result:** The conversation remains idle—**a1** does not respond to its own message, and **a2**/**a3** remain silent because they were neither addressed nor mentioned.

---

## Scenario 6 — Mention-Driven Multi-Agent Collaboration

1. Create a new chat.
2. Send `@a1 Kick off a plan and invite @a2 to add a risk check.`
3. When **a1** finishes, send `@a2 Provide your risk check and hand off to @a3 for next steps.`
4. After **a2** responds, send `@a3 Wrap up the plan.`

**Expected result:** Only the agent mentioned in each human message responds. The hand-off order should progress **a1 → a2 → a3**, demonstrating coordinated multi-agent behaviour via explicit mentions.

---

## Scenario 7 — World Pass Command

1. Create a new chat.
2. Send `<world>pass</world>`.

**Expected result:** The world stops without agent replies. The chat UI shows the conversation returning control to the human.

---

## Scenario 8 — Turn Limit Enforcement

1. Create a new chat.
2. Send `Team, give me consecutive one-line status updates until you are forced to stop.`
3. Allow the agents to respond without further human input.

**Expected result:** After at most **five** agent turns, the world automatically halts additional agent replies and yields control to the human, indicating the turn limit has been reached.

---

## Scenario 9 — Tool Approval (shell_cmd)

1. Create a new chat.
2. Send `@a1 Please list the files in the '~/tmp' directory.`
3. Wait for the tool approval dialog for the `shell_cmd` invocation.
4. Approve the tool execution.

**Expected result:** The tool approval modal appears, the request requires manual confirmation, and the command result is streamed back into the chat after approval.
