# SQLite next step

SQLite is not active yet. The annotation is in `backend/src/store.ts`; the proposed table design is `docs/sqlite-schema.sql`.

When implementing it, replace `saveSession()` and session loading with a repository that writes `sessions`, `blocks`, `events`, `record_measures` and `block_measures` in a transaction. Keep `events` unique on `(session_id, sequence)`. Export functions should read the same fields from SQLite and keep the CSV headers unchanged.

Before switching storage, test a session with an incorrect first submission followed by a corrected submission, restart recovery, and comparison of JSON-based versus SQLite CSV output.
