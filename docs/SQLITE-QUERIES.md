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
