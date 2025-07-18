# Say Hello to **Agent World** 🌍🤖

*The first zero-code playground where AI agents talk, cooperate, and get real work done—powered only by plain-language prompts.*

---

## Why Agents Matter

AI agents promise to behave like tireless co-workers: triaging tickets, scaling servers, or even hosting an RPG campaign. Yet the road from idea to working prototype is still strewn with hurdles.

---

## 😣 The Big Headaches—A Real‐World Walk-Through

| Framework                         | What you actually do, step-by-step                                                                                                                                                     | Hidden Cost                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **OpenAI Assistants / Agent SDK** | Create venv → `pip install` ✕ 5 → write tool schema JSON → subclass executors → build async loop so agents don’t spam themselves → push to a queue/vector store                        | \~300 lines of Python before “Hello, world.”                                                  |
| **Microsoft AutoGen**             | Install VS Code, .NET & Python → `pip install ag2` → craft “group-chat manager” objects → register each agent’s `generate_reply()` → wire a controller around `.initiate_chat()` | Two codebases (Python orchestration **plus** tool plugins) to maintain.                       |
| **CrewAI**                        | Install CrewAI & LangChain → define every agent as a dataclass → wire tasks into a `Crew` object → sprinkle decorators so agents don’t loop → handle rate limits                       | Six abstractions (Agent, Task, Tool, Memory, VectorStore, Crew) just to ask Agent B for help. |

> **Bottom line:** Every mainstream framework forces you to spin up a coding environment, follow house conventions, and babysit infra before an agent can utter its first word.

---

## ✨ The Agent World Difference

1. **Describe the behaviour** in plain English.

   ```text
   You are @triage.  
   When a human ticket arrives, reply once with a category,  
   then tag @kb for knowledge-base lookup.
   ```

2. **(Optionally) grant tool access.**

   ```text
   AllowedTools = ["kb.search", "sentiment.analyse"]
   ```

Paste that prompt into the sandbox. Agents come alive—no SDKs, builds, or deploys.

---

## A Living Lab for Social & Behavioural Research

Because every rule and norm lives in text, you can **simulate entire societies**—family disputes, roommate negotiations, economic exchanges, or evolutionary games—by tweaking prompts instead of rewriting code.

* **Sociologists** can model cooperation vs. competition.
* **Educators** can build classroom role-plays that adapt on the fly.
* **Game designers** can prototype emergent NPC factions overnight.

Agent World isn’t just a dev tool; it’s a petri dish for studying how rules shape behaviour at scale.

---

## What You Can Build in Minutes

| Theme                                           | Agents in Play                                        | Why It’s Cool                                            |
| ----------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| **Tic-Tac-Toe → Connect-4 → Battleship**        | `@gm`, `@playerX`, `@playerO`                         | Swap one prompt block; the entire game changes.          |
| **Simultaneous-Order Diplomacy**                | Seven nation agents + `@gm`                           | Deterministic conflict resolution—zero code.             |
| **Customer-Support Pod**                        | `@triage`, `@kb`, `@sentiment`, `@supervisor`         | Live triage, doc lookup, escalation—pure prompts.        |
| **On-Call War-Room**                            | `@watchdog`, `@ops`, `@postMortem`                    | Prometheus alerting, auto-scaling, incident write-ups.   |
| **Friend-Group Trip Planner**                   | `@budgetBoss`, `@wanderlust`, `@foodie`, `@logistics` | Haggling over flights & restaurants without DM chaos.    |
| **Editorial Pipeline**                          | `@author`, `@editor`, `@factcheck`, `@layout`         | Copy → edit → fact-check → publish with clear hand-offs. |
| **Therapeutic Support Chain**                   | `@peer`, `@coach`, `@counselor`                       | Escalates care levels while protecting confidentiality.  |
| *…and 10 + more ready-made worlds in the repo.* |                                                       |                                                          |

---

## Competitive Edge at a Glance

| Agent World                            | Code-Heavy Frameworks        |
| -------------------------------------- | ---------------------------- |
| **Deployless “save-and-run” workflow** | Rebuild → redeploy → restart |
| Human-readable, audit-friendly logic   | Dev-only source code         |
| Provider-agnostic LLMs                 | Vendor lock-in               |
| Built-in privacy via mention routing   | Manual ACL plumbing          |
| Ideal for behavioural simulation       | Hard-wired game loops        |

---

## Try It in 3 Commands

```bash
git clone https://github.com/yysun/agent-world
cd agent-world && npm install
npm run sandbox        # opens a chat UI with sample prompts
```

Paste a prompt; agents spring to life. Change a single line; press ↵—they behave differently *instantly*.

---

## Roadmap Sneak Peek

* **MCP tool calls** – database queries, repo diffs, cloud APIs from inside prompts
* **Commit-Reveal Engine** – bullet-proof simultaneous orders for auctions & Diplomacy
* **Prompt Linter & Unit Harness** – catch loops before they hit production

---

**Agent World**—because sometimes the most powerful framework is just a well-written block of text.
