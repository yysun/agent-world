# Done: Chat Title Quality Hardening

**Date Completed**: 2026-03-13  
**Branch**: `codex/chat-title-quality-hardening`  
**Req**: `.docs/reqs/2026/03/13/req-chat-title-quality-hardening.md`  
**Plan**: `.docs/plans/2026/03/13/plan-chat-title-quality-hardening.md`  
**Tests**: 1741/1741 pass (220 test files)

---

## Summary

Hardened the automatic chat title generation system across three dimensions:

1. **Phase 1 — Weak-fallback no-commit**: When the LLM returns a generic/low-signal title (e.g. `'Chat'`, `'Session'`, `'New Chat'`), `pickFallbackTitle` now returns `''` instead of committing `'Chat Session'`. The chat stays at `'New Chat'` and remains eligible for a future idle-triggered attempt with better context.

2. **Phase 2 — Bounded multi-turn context window**: `buildTitlePromptMessages` now collects the most recent N user+assistant exchanges (`TITLE_CONTEXT_WINDOW_TURNS = 3`, up to 6 messages) instead of only the first user message. Tool/system/function messages are excluded. This gives the LLM richer context for follow-up questions and multi-turn sessions.

3. **Phase 3 — Explicit title provenance** (`TitleProvenance = 'default' | 'auto' | 'manual'`):
   - Every auto-generated title is stamped `provenance = 'auto'` on commit (storage + runtime).
   - Every user-initiated rename via `updateChat` is stamped `provenance = 'manual'`.
   - Legacy/new chats default to `provenance = 'default'` (SQL column default + read fallback).
   - On message edit+resubmission, only `'auto'` titles are reset back to `'New Chat'`; `'manual'` and `'default'` titles are untouched.
   - On failed resubmission, the title and provenance are rolled back atomically.

4. **Improved LLM title prompt**: System prompt and user prompt updated to explicitly teach the LLM that `@mention` prefixes are agent addresses (not the title subject), forbid verbatim copies of the user message, and enforce title-case noun-phrase output.

5. **Bug fix (incidental)**: `saveChatData` in the SQLite backend had a missing `tags` parameter binding (6 `?` placeholders, only 5 args) — silently corrected while adding the `title_provenance` binding.

---

## Files Changed

| File | Change |
|------|--------|
| `core/chat-constants.ts` | Added `TitleProvenance` type + 3 constants |
| `core/types.ts` | Added `titleProvenance` to `Chat`, `UpdateChatParams`, `StorageAPI.updateChatNameIfCurrent` |
| `core/events/memory-manager.ts` | Phase 1 & 2 + improved title-gen LLM prompt |
| `core/events/title-scheduler.ts` | Phase 3d: write `provenance='auto'` on commit; set runtime cache |
| `core/managers.ts` | Phase 3e: inject `provenance='manual'` on explicit rename |
| `core/message-edit-manager.ts` | Phase 3f: provenance-based reset/rollback; removed dead `extractGeneratedChatTitleFromSystemPayload` |
| `core/storage/sqlite-storage.ts` | Read/write `title_provenance`; fixed missing `tags` param binding |
| `core/storage/memory-storage.ts` | Provenance in CAS and CRUD |
| `core/storage/world-storage.ts` | Provenance in file-based CAS and CRUD |
| `core/storage/storage-factory.ts` | Forward `nextProvenance` through both storage wrappers |
| `migrations/0017_add_title_provenance.sql` | New: `ALTER TABLE world_chats ADD COLUMN title_provenance TEXT DEFAULT 'default'` |
| `tests/core/events/post-stream-title.test.ts` | Updated 5 assertions; 4 new tests |
| `tests/core/chat-title-provenance.test.ts` | New: 4 tests for `updateChat` provenance injection |
| `tests/core/message-edit.test.ts` | Updated fixture; 1 new rollback-provenance test |
| `tests/core/storage/storage-factory.test.ts` | Added `undefined` for optional `nextProvenance` arg |

---

## New Tests Added (9 total)

- `post-stream-title.test.ts`: weak-fallback no-commit (×2), runtime `titleProvenance='auto'` after commit, no provenance set on CAS race
- `chat-title-provenance.test.ts`: `updateChat` injects `'manual'` on non-empty name, on whitespace-padded name; does NOT inject for description-only or empty-name updates
- `message-edit.test.ts`: rollback restores `titleProvenance='auto'` after failed resubmission

---

## Key Design Decisions

- **`'default'` as safe legacy sentinel**: New chats and migrated rows both carry `'default'`. The edit-reset guard (`titleProvenance !== 'auto'`) treats `'default'` conservatively — the same as manual — so no existing auto-titled chat without provenance data is accidentally cleared.
- **CAS atomicity**: All title transitions (generate→commit, reset, rollback) go through single SQL `WHERE name = ?` compare-and-set to prevent races with concurrent renames or multi-process writes.
- **Prompt engineering**: The LLM is explicitly taught `@mention` semantics and prohibited from verbatim-copying the user turn, addressing the observed failure mode of `@gemini search ...` being committed as the title.
