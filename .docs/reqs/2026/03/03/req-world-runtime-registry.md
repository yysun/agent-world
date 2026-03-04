# REQ: Core World Runtime Registry

**Date:** 2026-03-03  
**Status:** Draft

---

## Overview

Introduce a core-managed world runtime registry that becomes the canonical lifecycle owner for world startup, runtime reuse, and queue processing activation across Electron, API, and CLI surfaces.

This requirement aligns with and extends queue-dispatch goals by defining a single runtime contract shared by all app surfaces.

## Problem Statement

World lifecycle responsibilities are currently distributed across multiple call paths. Runtime ownership, listener setup, and queue kickoff behavior are not represented as one explicit core contract. This creates drift risk across long-lived runtimes (Electron/CLI) and short-lived request flows (API).

## Goals

1. Provide a single core registry for active world runtimes.
2. Define one canonical world startup lifecycle contract.
3. Enable runtime reuse across API/Electron/CLI consumers.
4. Ensure queue processing startup is tied to world runtime lifecycle.
5. Preserve public message-send API compatibility.

## Functional Requirements

### FR-1: Core Registry Existence

- A core world runtime registry must exist and be the authoritative source of active world runtimes.
- Registry operations must support runtime acquisition, lookup, and release.
- Registry must support deterministic cleanup of world runtime resources.

### FR-2: Canonical Startup Lifecycle

- The registry must expose a canonical world startup path that consolidates:
1. world load from storage
2. runtime subscription wiring
3. queue processor initialization for active chat context
- Repeated startup/acquire calls for the same world must be idempotent.

### FR-3: Shared Runtime Across Consumers

- API, Electron, and CLI must be able to acquire world runtimes through the same core registry contract.
- Multiple consumers may share one runtime for the same world when active concurrently.
- Runtime release by one consumer must not terminate a runtime still in use by others.
- Runtime identity must include storage context to avoid collisions across distinct storage backends/paths.

### FR-3.1: Runtime Identity Key

- Registry keys must be composite and include at least:
1. storage type
2. normalized storage path/root
3. world id
- A runtime for `worldId=X` in storage path `A` must never be reused for path `B`.

### FR-4: Queue Processing Lifecycle Ownership

- Queue processing ownership must be attached to the active world runtime lifecycle.
- Queue startup behavior must not depend on renderer-only or transport-only triggers.
- Queue advancement remains event-driven and chat-scoped.

### FR-5: Public Message API Compatibility

- `publishMessage(...)` remains the public interface for sending messages.
- Internal dispatch behavior may route through queue-backed processing, but caller-facing API compatibility must remain stable.

### FR-5.1: Queue-Backed Routing Scope

- Queue-backed routing applies only to external user-send ingress paths (API/IPC/CLI user sends).
- Internal assistant/tool/system publication paths must retain immediate event behavior and must not be enqueued.
- Existing `WorldMessageEvent` and `WorldSSEEvent` contract semantics must remain unchanged.

### FR-5.2: Streaming Lifecycle Safety

- Queue-backed dispatch must preserve strict lifecycle ordering for streamed turns:
1. `start`
2. zero or more `chunk`
3. terminal `end` or explicit `error`
- Queue integration must not reorder stream events or suppress terminal events.

### FR-6: Storage Context Visibility

- Registry runtime metadata must include the active storage context (at minimum storage type and storage path).
- Consumers must be able to identify runtime storage context for diagnostics and consistency checks.

### FR-7: Isolation and Safety

- World-level event isolation must be preserved; no cross-world runtime/event leakage.
- Chat/session processing semantics (ordering, message identity, timestamps, streaming lifecycle) must remain consistent.
- Startup/refresh operations must not create duplicate listeners or duplicate queue processors.

### FR-8: Cross-Process Safety Boundary

- For environments where multiple processes may access the same storage, queue claim semantics must be explicitly defined.
- At minimum, requirements must support an atomic next-message claim strategy to prevent duplicate sends across processes.
- If cross-process claims are deferred, that limitation must be explicitly documented and behavior must remain safe for single-process runtimes.

## Non-Functional Requirements

### NFR-1: Determinism

- Runtime acquisition and release outcomes must be deterministic under concurrent access.
- Queue processing behavior must remain deterministic for per-chat ordering.

### NFR-2: Performance

- Runtime reuse should reduce repeated startup overhead.
- Registry operations should add minimal latency to message-send and chat-restore flows.

### NFR-3: Operability

- Registry state should be inspectable enough for runtime diagnostics (active worlds, storage context, ownership count).
- Cleanup behavior should be explicit and reliable at app/process shutdown.

## Acceptance Criteria

1. A core world runtime registry exists and is used as the canonical runtime owner.
2. A canonical startup contract is available and used for world initialization.
3. API/Electron/CLI can acquire/reuse runtimes for the same world via one contract.
4. Queue processor startup is runtime-owned and consistently activated from startup lifecycle.
5. `publishMessage(...)` remains public and compatible for callers.
6. Storage type/path metadata is available at runtime-registry level.
7. No duplicate listener/processor behavior is introduced by repeated startup or concurrent acquisition.
8. Runtime identity is storage-aware and prevents cross-storage runtime reuse.
9. Queue-backed routing does not alter internal assistant/tool/system publish behavior.
10. Streaming lifecycle ordering remains compatible with existing clients.

## Out of Scope

1. UI redesign of queue controls.
2. New queue prioritization policies.
3. Multi-host distributed queue execution.
4. Changing client payload schemas beyond compatibility-preserving requirements.

## Related Requirements

- `.docs/reqs/2026/03/03/req-world-message-dispatch-queue.md`
- `.docs/reqs/2026/03/01/req-message-queue.md`
