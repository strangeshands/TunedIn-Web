# Tuned In data dictionary

The backend writes all exports to `backend/data/exports/<session-id>/`. Blank CSV cells mean that a measure or event was not observed, not that it was zero.

## Conventions

- `*_ms` fields are milliseconds from the browser's monotonic `performance.now()` clock.
- Rates are fractions from `0` to `1`; `0.15` means 15%.
- The interface may display seconds, but exported timing values remain milliseconds.
- `quantity` remains text so values such as `064` preserve leading zeroes.
- Blocks: `0` practice when completed, `1` silent baseline calibration, then `2+` configured experimental blocks. Practice is optional, so a session may begin with block `1`.
- `study_mode` is `Formative`, `Pilot`, or `Main`, selected when the session begins.
- `config_version`, `build_version`, and `task_version` identify the configuration, formative build, and task definition captured when the session began.
- `configured_practice_seconds`, `configured_baseline_seconds`, and `configured_block_seconds` record the durations locked in when the session began.
- `comfort_volume_percent` is the 0–100 browser playback volume confirmed during the Audio Comfort Check.
- Participant IDs are unique within each study mode. The same ID may be used once in Formative, once in Pilot, and once in Main; a duplicate ID within the selected mode must use the researcher recovery flow.

## Export files

| File | Rows | Purpose |
| --- | --- | --- |
| `results.zip` | One archive | Downloadable archive containing every export listed below. |
| `session.json` | One session snapshot | Complete local audit record. |
| `events.jsonl` | One event per line | Raw evidence for measures. |
| `records.csv` | One row per record | Record-level timing and validation data. |
| `blocks.csv` | One row per completed or restarted block attempt | Block-level measures and interrupted-attempt markers. |
| `decisions.csv` | One adaptive evaluation | Rule input, selected state, and track. |
| `transitions.csv` | One adaptive playback attempt | Browser playback outcome. |
| `tracks.csv` | One approved music file | Frozen session playback catalogue. |

## `blocks.csv`

| Column | Meaning |
| --- | --- |
| `participant_id`, `session_id`, `study_mode` | Session identifiers and selected study mode. |
| `config_version`, `build_version`, `task_version` | Configuration, formative build, and task-definition versions locked in for this session. |
| `comfort_volume_percent` | Playback volume selected during the Audio Comfort Check, from 0 to 100. |
| `configured_practice_seconds`, `configured_baseline_seconds`, `configured_block_seconds` | Timing snapshot used for this session. |
| `block` | `0` practice, `1` calibration, `2`–`4` experimental. |
| `attempt_status` | `completed` for a finished timed attempt; `in_progress` while a running block has not yet ended. `interrupted_restart` is an intentionally empty row written when an unexpected interruption caused that block to restart from 0:00. |
| `condition` | `No music`, `Static music`, or `Adaptive music`; practice and calibration are always `No music`. |
| `duration_seconds` | Duration supplied when the block ended. |
| `records_presented`, `validated_records` | Records shown and eventually accepted. |
| `validated_records_per_minute` | Accepted records per minute. |
| `median_il_ms`, `median_fped_ms` | Median initiation latency and first-pass entry duration. |
| `first_pass_error_rate`, `first_pass_accuracy` | FPRER and one minus FPRER. |
| `median_ttsv_ms` | Median time from presentation to successful validation. |
| `correction_cycles`, `correction_cycles_per_validated_record` | Extra submissions and the per-valid-record value. |

## `records.csv`

| Column | Meaning |
| --- | --- |
| `participant_id`, `session_id`, `study_mode`, `config_version`, `build_version`, `task_version`, `comfort_volume_percent`, `block`, `record_id` | Record identity, study mode, versions, comfort volume, and join fields. |
| `presented_ms`, `first_key_ms`, `first_submission_ms`, `validated_ms` | Source timing markers. |
| `first_pass_rejected` | `true` when the first full submission was rejected. |
| `il_ms` | `first_key_ms - presented_ms`. |
| `fped_ms` | `first_submission_ms - first_key_ms`. |
| `ttsv_ms` | `validated_ms - presented_ms`. |
| `submission_count` | Full submissions including corrections. |

## `events.jsonl`

Each JSON object contains `sessionId`, `participantId`, `studyMode`, `configVersion`, `buildVersion`, `taskVersion`, `comfortVolumePercent`, `sequence`, `blockNumber`, `recordId`, `eventType`, `clientTimeMs`, and optional `payload`.

`eventType` is one of `record_presented`, `first_key`, `record_submitted`, or `validation_result`. The backend assigns `sequence` to preserve event order.

## `decisions.csv`

This file is populated only during Adaptive Music blocks.

| Column | Meaning |
| --- | --- |
| `participant_id`, `session_id`, `study_mode`, `config_version`, `build_version`, `task_version`, `comfort_volume_percent`, `block` | Decision identity, study mode, versions, comfort volume, and adaptive block. |
| `window_start_ms`, `window_end_ms` | Evaluated rolling-window bounds. |
| `record_count` | First-submitted records in the window. |
| `median_il_ms`, `median_fped_ms`, `first_pass_error_rate` | Recent window measures used by the rule engine. |
| `baseline_il_ms`, `baseline_fped_ms` | Participant references from silent calibration block `1`. |
| `previous_state`, `selected_state` | `reduced`, `baseline`, `elevated`, or `silent`. |
| `previous_track_id`, `selected_track_id` | Track identifiers before and after the decision. |
| `reason` | Backend reason for the selected state, including insufficient-data cases. |

## `transitions.csv`

This file records the browser outcome after an adaptive decision. It can be empty when no Adaptive Music evaluation occurs.

| Column | Meaning |
| --- | --- |
| `participant_id`, `session_id`, `study_mode`, `config_version`, `build_version`, `task_version`, `comfort_volume_percent`, `block` | Transition identity, study mode, versions, comfort volume, and adaptive block. |
| `decision_id` | Links to the decision that requested playback. |
| `previous_track_id`, `selected_track_id` | Tracks from that decision. |
| `started_ms`, `completed_ms` | Browser transition start and completion. For a successful crossfade, `completed_ms` is recorded only after the configured crossfade ends. |
| `configured_crossfade_ms` | Crossfade duration taken from `config/study.json`. |
| `outcome` | `playing`, `silent`, or `failed`. |
| `error` | Playback-error detail; blank when there is no error. |

## `tracks.csv`

| Column | Meaning |
| --- | --- |
| `participant_id`, `session_id`, `study_mode`, `config_version`, `build_version`, `task_version`, `comfort_volume_percent` | Session identifiers, study mode, locked-in versions, and selected comfort volume. |
| `track_id` | Frozen manifest identifier. |
| `music_class` | Frozen manifest bank: `baseline`, `reduced`, or `elevated`. |
| `relative_file_path` | Path relative to the project music folder. |
| `composer`, `composition_id`, `rotation_index` | Metadata used to document deterministic bank rotation and avoid immediate composer/composition repeats. |
| `classification_method`, `classification_version` | `frozen_manifest` and its manifest version. |
| `integrated_loudness_lufs`, `true_peak_dbtp` | Source loudness and true-peak measurements retained from the approved playback manifest. |
| `file_sha256` | Source-file SHA-256 expected by the frozen manifest. Files with another hash are not played. |

## `session.json`

The complete saved session: participant and order data, configuration/build/task versions, selected comfort volume and comfort-check timestamp, blocks, raw events, captured music catalogue, adaptive decisions, playback transitions, calculated block measures, and `endedEarlyAt` when a researcher closes an interrupted session through recovery.

## Durable event identity and audit

Raw events include `eventId` (stable across retries) and `attemptId` (specific timed-block attempt). Session `sequence` values remain unique and increasing even when an attempt is interrupted. Consequently, current-attempt exports may contain gaps in sequence numbers. Legacy events receive stable IDs during SQLite import; timestamps remain unchanged.

`all-events.jsonl` includes every committed event, including interrupted attempts, with `includedInCurrentAttempt` marking inclusion in the normal record/block measures. `events.jsonl` and existing CSV measure definitions retain their current-attempt scope. Submission request IDs and their cached validation responses are retained in SQLite for idempotent retries.

## Baseline completion metadata

All CSV exports include `baseline_mode` (`records` or `timed`) and `baseline_target_records` (the saved target in record mode; 20 under the revised protocol, blank in timed mode). These describe the session's locked baseline rule, including on rows for other blocks. See the [20-record baseline protocol](../feedback-files/analysis/Pilot_Study_v1_App_Improvement_Analysis.ipynb#Baseline-calibration-justification:-revised-20-record-protocol) for its rationale. Historical 15-record and timed sessions retain their original metadata and must not be relabeled as 20-record sessions.

`configured_baseline_seconds` retains the timing snapshot (normally 120). It is an active deadline only in timed mode. In record mode, block 1 `duration_seconds` is the elapsed interval between its first presentation and final accepted validation, using browser event timestamps. It is not fixed at 120 seconds. Exactly the target number of distinct accepted records completes that baseline; correction submissions do not count as additional records and no next record is presented after completion.

`session.json` stores `baseline: {mode, recordTarget}`. Legacy sessions without this field use timed calibration. `events.jsonl` includes `baselineMode` and `baselineTargetRecords` (null for timed mode). Existing first-pass and correction measures retain their definitions. Use the mode metadata to distinguish baseline protocols in notebook analyses.
