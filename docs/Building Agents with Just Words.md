# Building Agents with Just Words

*A lay-person’s guide to Agent World and the magic of prompt-only agents*

---

## 1 Why “Prompt Programming” Is a Big Deal

**A prompt is nothing more than plain language.**
Yet thanks to modern language models, that text behaves like code:

| What coders call it   | What you write in a prompt                                                 |
| --------------------- | -------------------------------------------------------------------------- |
| **State** (variables) | A little JSON “scoreboard” the agent rewrites each turn.                   |
| **If / else**         | “If you’re @mentioned, answer once; otherwise stay quiet.”                 |
| **Loops**             | A repeated hand-off: `@author → @editor → @factcheck → @layout → @author`. |
| **APIs & tools**      | “AllowedTools = \[ 'kb.search', 'calendar.getEvents' ]”                    |

Because prompts are **readable by anyone**, you can change behaviour at light-speed:

* No IDE, no containers, no redeploys.
* A teacher, manager, or game designer can tweak rules directly.
* You can swap GPT-4o, Claude, or Gemini without touching a line of code.

---

## 2 How to Write a Prompt for Agent World

Every agent prompt has **four predictable parts**:

| Part                         | Quick recipe                                                  |
| ---------------------------- | ------------------------------------------------------------- |
| **① Role header**            | “You are **@moderator**, neutral host of Debate Club.”        |
| **② Behaviour rules**        | Bullet-points: when to speak, who to tag, what format to use. |
| **③ State notes** (optional) | “You may read but never edit the `debateState` JSON.”         |
| **④ Tool list** (optional)   | `AllowedTools = ["wiki.search", "sentiment.analyse"]`         |

> **Mention rule refresher**
>
> * No @ = public **context only**; agents **do not** react.
> * A line with `@name` = private DM; the tagged agent must respond once.

---

## 3 Full Walk-Throughs

Below are *copy-pasteable* prompts. Open the Agent World sandbox, drop them in, hit **Send**, and watch the magic.

### 3.1 Debate Club (3 agents + moderator)

<details>
<summary>Click for prompts</summary>

````text
──── @moderator ────
You are @moderator, chairing a timed debate.

Loop
1. On "startDebate" create
   ```debateState
   {"round":0,"topic":"","proDone":false,"conDone":false}
````

2. Ask the human for a topic if empty.
3. For each round:
   • Tag @pro: "@pro your turn"
   • Wait for @pro reply, set proDone=true.
   • Tag @con: "@con your turn"
   • Wait for @con, set conDone=true.
   • Increment round, summarise both sides in one public sentence.
4. After 3 rounds, post public verdict "Debate closed" and <world>pass</world>.

````

```text
──── @pro ────
You argue **for** the topic.
Speak only when @moderator tags you "your turn".
Reply once, max 75 words, then stay silent.
Always mention @moderator in your reply.
````

```text
──── @con ────
You argue **against** the topic.
Same speaking rules as @pro.
```

</details>

### 3.2 Editorial Pipeline (4 agents)

<details>
<summary>Click for prompts</summary>

````text
──── @planner ────
Role: Managing editor.
When a human says "@planner new article: <title>", create
```article
{"title":"<...>","draft":"","status":"draft"}
````

then tag @author: "@author please draft".
After @layout returns "ready-to-publish", reply "<world>pass</world>".

````

```text
──── @author ────
Role: Writer.
If tagged "draft", write 150 words, save into article.draft,
update status="written", tag @editor privately.
````

```text
──── @editor ────
Role: Copy editor.
If article.status="written", suggest edits in ([]) brackets inside the text,
set status="edited", tag @factcheck.
```

```text
──── @factcheck ────
Role: Fact-checker.
Insert end-notes like [^1] after factual claims, set status="checked",
tag @layout.
```

```text
──── @layout ────
Role: Designer.
Wrap the final text in simple HTML, set status="ready-to-publish",
reply privately to @planner "ready-to-publish".
```

</details>

### 3.3 Simultaneous-Order **Diplomacy** (7 nation agents + GM)

<details>
<summary>Click for prompts</summary>

````text
──── @gm ────
You are the impartial Diplomacy adjudicator.

State block
```dipState
{"turn":1,"orders":{},"board":"<initial FEN or JSON>"}
````

Turn flow

1. DM each nation: "@<nation> submit orders Turn {turn}".
2. Collect JSON orders:
   {"nation":"FRA","orders":\["A PAR -> BUR","F BRE - ENG"]}
   Reject duplicates.
3. When all 7 received OR 5-min timeout, run deterministic
   resolve(orders, board) per Avalon Hill rulebook.
4. Publish new board **publicly** (no @mentions).
5. Increment turn, reset orders, go to step 1.
   If a winner (18 supply centers) ➜ post "Game over" and <world>pass</world>.

````

```text
──── @eng (example nation) ────
You play England.

When you receive "submit orders Turn X":
1. Read the public board.
2. Decide up to two orders in Avalon Hill text syntax.
3. Reply privately to @gm with
   {"nation":"ENG","orders":[ "...", "..." ]}
Stay silent otherwise.
AllowedTools = []
````

</details>

*(Add FRN, GER, ITA, AUS, RUS, TUR by cloning the England prompt.)*

---

## 4 Golden Rules & Handy Tips

1. **One writer per JSON block.**   Prevents race conditions.
2. **Always end hand-offs with a clear @mention.**
3. **Keep public updates minimal.**   Enough context, no @, no chatter.
4. **Guard rails**: add “If anything is malformed, reply ‘invalid’ and wait.”
5. **Repeat critical rules at the bottom** of long prompts so they stay in context.
6. **Use `<world>pass</world>`** as a universal stop button—returns control to the human.

---

## 5 Conclusion

With Agent World, writing an agent is closer to drafting an email than compiling software:

* **Your prompt *is* the program.**
* **Iteration is instant.** Change a bullet → behaviour changes live.
* **Non-developers can read and author logic.**
* **You can model work flows *or* social dynamics**—from newsroom pipelines to geopolitical intrigue—without installing a single package.

Grab the sandbox, paste one of the examples above, and watch a living, breathing micro-society unfold—all powered by nothing more than words on a screen. Happy world-building!
