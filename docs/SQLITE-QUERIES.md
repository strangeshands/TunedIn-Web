# Basic SQLite queries

SQLite is the app's saved source for sessions and events. The planned notebook analysis uses the CSV files from each participant's results ZIP; these queries are optional checks for researchers. See [storage and recovery](SQLITE-NEXT.md) for migration and backup details and the [data dictionary](DATA-DICTIONARY.md) for measure definitions.

## Open the database read-only

From the repository root, run:

```bash
sqlite3 -readonly backend/data/study.sqlite
```

The database is created when the backend first starts. If `TUNED_IN_DATA_DIR` is configured, use `study.sqlite` inside that directory instead. The `sqlite3` command-line tool is separate from the app's built-in Node.js SQLite module; it must be available in your terminal to use this guide.

At the `sqlite>` prompt, enable readable output and list the tables:

```text
.headers on
.mode column
.tables
.schema events
```

End each SQL query with a semicolon. Commands beginning with a dot do not need one. Exit with:

```text
.quit
```

## Understand the three tables

| Table | Saved contents |
| --- | --- |
| `sessions` | Session ID and a JSON `snapshot` containing participant details, configuration, blocks, tracks, and playback decisions. |
| `events` | Individual raw events, their stable IDs, session sequence numbers, current-attempt flags, and JSON `event_json` details. |
| `submission_receipts` | Submission request IDs and cached responses, used to prevent duplicates when requests are retried. |

There is no separate `blocks` table: block metadata is inside `sessions.snapshot`. Derived task measures are calculated by the app from raw events and included in the CSV exports.

## List participants and their session IDs

```sql
SELECT id AS session_id,
       json_extract(snapshot, '$.participantId') AS participant_id,
       json_extract(snapshot, '$.studyMode') AS study_mode,
       json_extract(snapshot, '$.createdAt') AS created_at
FROM sessions
ORDER BY created_at;
```

Participant codes can appear in different study modes. Use the session ID to inspect one specific session. In the examples below, replace `PASTE_SESSION_ID` with an ID from this query, keeping the surrounding single quotes.

## Inspect a session's blocks

```sql
SELECT json_extract(block.value, '$.number') AS block_number,
       json_extract(block.value, '$.condition') AS condition,
       json_extract(block.value, '$.attemptId') AS attempt_id,
       json_extract(block.value, '$.endedAt') AS ended_at,
       json_extract(block.value, '$.durationSeconds') AS duration_seconds
FROM sessions AS session,
     json_each(session.snapshot, '$.blocks') AS block
WHERE session.id = 'PASTE_SESSION_ID'
ORDER BY block_number;
```

Block `0` is practice, block `1` is silent baseline calibration, and experimental blocks begin at `2`. A missing `ended_at` means that block has not been finished; a populated value alone does not establish eligibility for the main analysis. Apply the study's mode and completion rules as well.

## View a session's current-attempt events

```sql
SELECT sequence, event_id,
       json_extract(event_json, '$.attemptId') AS attempt_id,
       json_extract(event_json, '$.recordId') AS record_id,
       json_extract(event_json, '$.eventType') AS event_type,
       json_extract(event_json, '$.clientTimeMs') AS client_time_ms
FROM events
WHERE session_id = 'PASTE_SESSION_ID' AND active = 1
ORDER BY sequence;
```

`client_time_ms` is the original browser `performance.now()` timestamp in milliseconds, not a calendar date. Treat it in the context of its block attempt; a browser restart starts a different clock context.

## Count events by type

```sql
SELECT json_extract(event_json, '$.eventType') AS event_type,
       COUNT(*) AS event_count
FROM events
WHERE session_id = 'PASTE_SESSION_ID' AND active = 1
GROUP BY event_type;
```

A `record_submitted` event is one submission attempt, not necessarily one successfully completed record. Corrections can produce multiple submissions for one record. Use the exported measures for analysis rather than treating these counts as throughput or accuracy.

## Inspect interrupted-attempt events

```sql
SELECT sequence, event_id,
       json_extract(event_json, '$.attemptId') AS attempt_id,
       json_extract(event_json, '$.recordId') AS record_id,
       json_extract(event_json, '$.eventType') AS event_type
FROM events
WHERE session_id = 'PASTE_SESSION_ID' AND active = 0
ORDER BY sequence;
```

`active = 1` means the event belongs to a current block attempt, including practice and calibration. It does not mean the event is automatically eligible for the main analysis. `active = 0` means it was retained from an interrupted attempt that was restarted. Sequence numbers can have gaps when viewing only current attempts.

The results ZIP's `all-events.jsonl` also includes interrupted events, with `includedInCurrentAttempt` indicating their scope. The usual `events.jsonl` and task measures use current attempts.

## Check saved submission receipts

```sql
SELECT COUNT(*) AS committed_submission_receipts
FROM submission_receipts
WHERE session_id = 'PASTE_SESSION_ID';
```

Each receipt represents a committed submission request. A retry with the same request ID returns its cached result instead of adding another submission. This count includes rejected submissions and is not the number of validated records.

## Use the CSV exports for analysis

Download **results ZIP** in the app, extract it, and load the relevant files into your notebook:

```python
import pandas as pd

blocks = pd.read_csv("blocks.csv")
records = pd.read_csv("records.csv")
decisions = pd.read_csv("decisions.csv")
```

Keep the original ZIP and database backups. To back up database files, stop the backend first and copy the entire data directory, including any SQLite sidecar files. Querying the database read-only does not require stopping the backend.

## Start fresh with an empty database — development tests only

> **WARNING: Resetting, removing, or clearing saved data is only for development/debugging with disposable test sessions. Never use this procedure during actual participant testing or pilot/main-study data collection. It disconnects the app from existing sessions and clears browser recovery data, including potentially unsent events. For actual study sessions, preserve the database, browser recovery data, and original exports; use the normal recovery and backup procedures instead.**

A normal app restart does **not** erase data. The following procedure starts fresh by archiving the entire test-data directory rather than permanently deleting it.

1. Stop the frontend and backend with **Ctrl+C** in the terminal running `npm run dev`. Exit any open SQLite shell with `.quit`.
2. Close other browser tabs running the app. Confirm that the data directory contains only disposable test sessions.
3. From the repository root, archive the test-data directory:

   ```bash
   mv backend/data "backend/data/backup/data-backup-$(date +%Y%m%d-%H%M%S)"
   ```

   If `TUNED_IN_DATA_DIR` is configured, archive that directory instead. Keep the entire directory together, including `study.sqlite`, any `study.sqlite-wal` / `study.sqlite-shm` files, legacy session JSON files, and exports. Do not remove only `study.sqlite`: legacy JSON files left behind may be imported again on startup.

4. In the remaining app tab, open Developer Tools → **Application** → **Storage** → **Clear site data** for the app's origin. This removes stored participant details, recovery pointers, and the IndexedDB outbox. Clear browser data only for these disposable test sessions; pending events may otherwise be lost. Close the tab afterward.
5. Restart from the repository root:

   ```bash
   npm run dev
   ```

6. Reopen the app. The backend creates a new data directory and an empty `study.sqlite`. Previous test sessions and exports remain in the archived directory.

For future development runs, prefer a dedicated disposable directory through `TUNED_IN_DATA_DIR` so test data stays separate from participant collection data. Do not point development reset commands at the actual study-data directory.
