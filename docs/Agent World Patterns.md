# Agent-World Pattern Catalog

> Agent-World = Prompt-defined state machine + message passing (mentions, broadcast, and tool events)

Status labels used below:
- **Current** = supported with today’s platform behavior
- **Planned** = aspirational pattern for future development or requires custom extensions

---

## 🏗 1. Sequential Pipeline (Assembly Line)
**Status:** Current

**Shape**
Entry → A → B → C → @human

**Use For**

* RPD loop
* Spec → Code → Test
* Content generation pipeline

**Strength**

* Deterministic
* Clear ownership per step

**Primitive Needed**

* Fixed next agent rule

---

## 🧭 2. Intent Router (Dispatcher)
**Status:** Current

**Shape**
Entry → Router → (A | B | C)

**Use For**

* NL command routing
* Skill selection
* Tool/CLI selection

**Routing Logic**

* Based on intent
* Based on keywords
* Based on sender
* Based on state token

**Primitive Needed**

* Single-agent decision
* Recommended: exactly one explicit handoff target to keep routing deterministic

---

## 🔁 3. Finite State Machine (FSM Controller)
**Status:** Current

**Shape**
Controller + `[STATE=...]` token

**Use For**

* Multi-stage workflows
* Approval gating
* Structured delivery (RPD)

**Key Idea**
State travels inside the message.

**Primitive Needed**

* Transition table in prompt
* State token update rule

---

## 🧪 4. Ping-Pong / Debate Loop
**Status:** Current

**Shape**
A ↔ B (until stop)

**Use For**

* Architecture refinement
* Red-team / blue-team
* Idea stress testing

**Stop Conditions**

* Turn counter
* “No high issues” rule
* Confidence threshold

**Primitive Needed**

* Alternation rule
* Turn counter token

---

## 🌐 5. Fan-Out (Parallel Lanes)
**Status:** Current

**Shape**
PM
↙︎   ↓   ↘︎
A   B   C

**Use For**

* Multi-review (code/security/perf)
* Strategy comparison
* Redundant implementations

**Primitive Needed**

* Multiple @mentions
* Optional `[LANE=A]` token

---

## 📥 6. Fan-In (Collector / Reducer)
**Status:** Current

**Shape**
A
B → Collector → @human
C

**Use For**

* Merge results
* Summarize multi-lane output
* Aggregate reports

**Collector Responsibilities**

* Track expected count
* Merge
* Decide completion

**Primitive Needed**

* Count tracking rule
* Finalization condition

---

## ⚙ 7. Orchestrator + Worker Pattern
**Status:** Current

**Roles**

* @pm = Brain (state machine, tool selector)
* @worker = Executor (stateless operator)

**Use For**

* CLI wrapping
* DAG execution
* Structured engineering workflow

**Strength**

* Separation of planning and doing
* Scales well
* Simplifies executor design

---

## 🛠 8. Tool Proxy Agent
**Status:** Current

**Shape**
Human → Agent → Shell/CLI → Agent → Human

**Use For**

* Codex CLI
* Docker
* Git
* Database migrations

**Responsibilities**

* Validate command
* Execute
* Report stdout/stderr
* Track lifecycle

**Primitive Needed**

* Secure tool description
* Structured status reporting

---

## 🔄 9. Approval Gate Pattern
**Status:** Current

**Shape**
PLAN → @human → EXEC

**Use For**

* Prevent auto-implementation
* Governance control
* Enterprise compliance

**Trigger**

* “approve” keyword
* Explicit confirmation

**Primitive Needed**

* Conditional transition rule

---

## 🔂 10. Retry / Fix Loop
**Status:** Current

**Shape**
EXEC → QA → (Issues?) → EXEC

**Use For**

* High-issue fixing
* Continuous improvement
* Auto-refinement

**Stop Rule**

* No high issues remain

**Primitive Needed**

* Issue severity classification
* Loop condition

---

## 🧩 11. Lane-Based DAG Hybrid
**Status:** Planned (Future Development)

**Shape**
Sequential stages + parallel lanes + collector

**Example**
REQ → PLAN →
↙︎  ↓  ↘︎
CODE REVIEW | SECURITY | PERF
↓
Collector → DONE

**Equivalent To**

* Argo DAG
* GitHub Actions matrix

**Primitive Needed**

* State token
* Lane token
* Collector

---

# 🏛 Core Primitives of Agent-World

Current implementation relies on these core primitives (others can be layered as planned extensions):

1. **@mention routing**
2. **State token** `[STATE=...]`
3. **Lane token** `[LANE=...]`
4. **Turn counter** `[TURN=n]`
5. **Conditional transition rule**
6. **Single output structure enforcement**

That’s it.

---

# 🎯 Mental Model

Agent-World is:

> A soft-coded workflow engine
> Implemented as prompt-defined distributed state machines
> Using message passing as transitions

It is not “chat”.

It is:

* A coordination protocol
* A programmable reasoning fabric
* A lightweight DAG engine
