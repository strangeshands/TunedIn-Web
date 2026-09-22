# Saved data

The backend writes all exports in `backend/data/exports/<session-id>/`. Empty values in CSV mean the value was not observed; they do not mean zero.

| File | Fields saved | Purpose |
| --- | --- | --- |
| `session.json` | participant ID, session/order IDs, assigned conditions, configuration/task versions, manual comfort-check timestamp, blocks, raw events and calculated block measures | Complete session snapshot for recovery and audit |
| `events.jsonl` | session ID, participant ID, sequence, block, record ID, event type, monotonic browser timestamp, payload | Raw task-event record |
| `records.csv` | participant/session/block/record IDs; presented, first-key, first-submission and validation times; first-pass rejection; IL, FPED, TTSV; submission count | One record-level row for verification and later analysis |
| `blocks.csv` | participant/session/block, assigned condition, duration, records, validated records, throughput, median IL, median FPED, FPRER, first-pass accuracy, median TTSV, correction cycles | One completed block-level row |

`events.jsonl` is append-friendly raw evidence. `records.csv` and `blocks.csv` are backend-derived files. The frontend never calculates or writes these files.

## Definitions

- **IL**: first task-relevant character time minus record presentation time.
- **FPED**: first full record submission time minus first task-relevant character time.
- **FPRER**: rejected first full submissions divided by full first submissions.
- **TTSV**: successful validation time minus presentation time. It is descriptive only and is not an adaptive rule input.

All timing fields are milliseconds from the same browser `performance.now()` clock. Rates are 0–1 fractions. `quantity` remains text so values such as `064` retain their leading zero.

## CSV column details

### `blocks.csv`

| Column | Meaning |
| --- | --- |
| `participant_id`, `session_id` | Links the block to its saved session. |
| `block` | `0` is silent practice; `1`–`3` are the experimental blocks. |
| `condition` | Assigned counterbalanced condition label. |
| `duration_seconds` | Timed duration supplied when the block finished. |
| `records_presented`, `validated_records` | Records shown and records eventually accepted. |
| `validated_records_per_minute` | Validated records divided by duration in minutes. |
| `median_il_ms`, `median_fped_ms` | Median record timing measures. |
| `first_pass_error_rate`, `first_pass_accuracy` | FPRER and one minus FPRER. |
| `median_ttsv_ms` | Median time from record presentation to successful validation. |
| `correction_cycles`, `correction_cycles_per_validated_record` | Extra full submissions after the first and its per-valid record value. |

### `records.csv`

| Column | Meaning |
| --- | --- |
| `participant_id`, `session_id`, `block`, `record_id` | Record identity and join fields. |
| `presented_ms`, `first_key_ms`, `first_submission_ms`, `validated_ms` | Raw time markers used for measures. |
| `first_pass_rejected` | `true` when the first full submission was rejected; blank when none occurred. |
| `il_ms`, `fped_ms`, `ttsv_ms` | Derived record-level timing measures. |
| `submission_count` | Number of complete submissions, including corrections. |

### `events.jsonl`

Every line has `sessionId`, `participantId`, `sequence`, `blockNumber`, `recordId`, `eventType`, `clientTimeMs`, and `payload`. This is the raw event audit trail. Events are in sequence order.

## Pending music/SQLite fields

`tracks.csv`, `decisions.csv`, and `transitions.csv` already reserve these future values: final manifest/track identifier, file path, bank/classification information, loudness review, rolling window start/end, median IL/FPED/FPRER, baseline references, previous and selected state/track, reason, crossfade duration, actual transition start/end and load/transition failure. The exact same fields are in `sqlite-schema.sql`.
