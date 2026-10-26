# SQLite storage and event recovery

SQLite is active in `backend/src/sqliteStore.ts`; `docs/sqlite-schema.sql` documents its runtime schema. Node.js 22.13 or newer is required for the built-in SQLite module. No external database service is needed.

## Persistence contract

`backend/data/study.sqlite` is authoritative. WAL journaling and `synchronous=FULL` are enabled. A session update, its new events, and its submission receipt commit in one transaction. The HTTP handler acknowledges success only after COMMIT. Database errors roll the transaction back and restore the in-memory session to its committed state. Writes use synchronous SQLite transactions to avoid yielding partway through mutation and commit; these short commits can briefly block the Node event loop.

Session metadata (including blocks, tracks, decisions, and transitions) is stored as a JSON snapshot. Raw events are separate immutable rows, unique on both `(session_id,event_id)` and `(session_id,sequence)`. Derived measures are recomputed from active raw events using the existing measure processor, rather than storing a second independently mutable copy.

Each submission has a stable request ID. Its two resulting raw events and cached response commit together. Retrying that ID returns its original result, even after the block finishes or the backend restarts. Reusing an event or submission ID with changed contents is rejected.

## Existing data

On first startup, structurally valid legacy `backend/data/<session-id>.json` files are imported transactionally. The originals remain unchanged as migration backups. Later startups never replace a SQLite session with an older JSON backup. Missing legacy event/attempt IDs are assigned during import, without changing original timestamps or event sequences. Invalid legacy files are preserved, reported in the terminal, and listed by `/api/health` as `skippedSessionFiles`. Database corruption is fatal; the app does not silently fall back to stale JSON files.

## Browser outbox and interrupted attempts

Before sending an event or submission, the browser commits it to IndexedDB (`tuned-in-outbox-v1`) using strict transaction durability. IndexedDB preserves a per-session ordered outbox across page reloads and browser restarts. Commands are removed only after a matching acknowledgement and an IndexedDB deletion commit. A lost response replays the same IDs; server deduplication makes the retry safe. Storage failures prevent successful block completion.

Use **Recover saved session** on the same browser profile and origin to replay pending commands before restarting or ending an interrupted block. Recovery starts a new timed attempt, rather than continuing a clock from another page. New attempts have distinct IDs, so late events cannot contaminate them. The database retains previous attempt events. `events.jsonl` and the usual measures contain the current attempts; `all-events.jsonl` additionally includes interrupted attempts with `includedInCurrentAttempt` flags and globally increasing session sequences.

The app requests persistent browser storage, but browsers can deny it. Clearing site data, private-browsing cleanup, changing profiles or origins, disk failure, and manual database deletion can still lose data. Keep using the same origin and normal browser profile throughout a session. An input that has not yet committed to IndexedDB cannot be recovered from an immediate crash.

## Backups

For a simple file backup, stop the backend cleanly first, then copy the entire data directory, including `study.sqlite` and any `study.sqlite-wal` / `study.sqlite-shm` files. Do not copy just the main database file while it is live. Keep original imported JSON files as backups; new sessions are stored only in SQLite. CSV/JSON exports remain available through the app. `TUNED_IN_DATA_DIR` selects a separate database/export directory for testing.

## Verification

- `npm run test:storage`: legacy imports, immutable events, atomic receipts, transaction rollback, abandoned-attempt audit, sequence uniqueness, and SIGKILL before/after commit with exact measures after recovery.
- `node tests/presentation-recovery.mjs`: transient failures, lost event acknowledgements, rapid submits, and completion while delivery is pending.
- `node tests/durable-recovery.mjs`: kill a temporary browser process, reopen its profile, replay unsent events/submissions, verify exact timestamps and measures, reject ID conflicts, retain interrupted events, and verify browser-storage refusal and retry without reloading.

Browser tests require Playwright and a Chromium browser. Configure `PLAYWRIGHT_MODULE`, `PLAYWRIGHT_EXECUTABLE_PATH`, `TEST_ORIGIN`, and `TUNED_IN_DATA_DIR` as needed. Run them against a disposable data directory.
