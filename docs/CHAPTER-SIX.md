# Chapter Six mapping

This maps the study elements to the current implementation. Configuration values describe new sessions; historical exports retain the settings captured for those sessions.

| Chapter Six item | This project |
| --- | --- |
| Visible fictional source record and three matching entry fields | `frontend/src/study/screens/TaskScreen.tsx`; session flow coordinated by `frontend/src/study/hooks/useStudyController.ts` |
| Immediate correction feedback | Backend submission validation, highlighted fields, and focus on the first incorrect field in `TaskScreen.tsx`; exact, case-sensitive validation retained |
| Record presentation, first key, submission and validation timestamps | Browser event queue and IndexedDB outbox in `frontend/src/script/`; persisted in SQLite `events` and exported through `events.jsonl` |
| IL, FPED, FPRER and TTSV | `backend/src/measures.ts` |
| Practice, silent baseline and experimental blocks | `config/study.json`: 60-second optional practice, default 20-record silent calibration, retained 120-second timed-calibration alternative, and 300-second experimental blocks. Pilot/Main use three counterbalanced conditions; Formative uses its configured condition order. |
| Baseline completion and recovery | `backend/src/baseline.ts` and session endpoints; mode and target selected only through study configuration and saved with each session |
| Session metadata, condition order and comfort check | Persisted in the SQLite `sessions.snapshot` JSON and included in exported `session.json` |
| JSONL, CSV and participant ZIP exports | `backend/src/exports.ts` and export endpoints in `backend/src/server.ts`; CSV remains the notebook analysis input |
| SQLite storage | Implemented by `backend/src/sqliteStore.ts` and `backend/src/store.ts`; transactional sessions, events and submission receipts, WAL journaling, and `synchronous=FULL` |
| Static Music stimulus | Fixed `baseline/B09.wav`, selected by `backend/src/playbackPolicy.ts`; excluded from Adaptive Music's baseline-state rotation |
| Reduced/baseline/elevated banks and approved track metadata | `backend/src/music.ts`, `config/playback-bank.json`, and `backend/src/playbackPolicy.ts` |
| Dedicated comfort-check recording | `music/Audio-Check/B01.wav`, approved separately by the manifest and `/api/music/audio-check`; never included in study banks |
| Browser playback, comfort-volume check and crossfades | `frontend/src/script/audio.ts`, `frontend/src/study/hooks/useStudyAudio.ts`, and `AudioCheckScreen.tsx`; crossfade duration currently configured as five seconds |
| Adaptive performance rule | Implemented in `backend/src/rule.ts`; backend evaluation endpoints persist decisions and selected tracks |
| Playback transition outcomes | Browser-reported start/end timestamps, outcome and error details persisted in session snapshots and exported in `transitions.csv` |

## Adaptive rule and playback

The implemented rule uses a 60-second rolling window, evaluated every 30 seconds, with a minimum of three recently submitted records. Silent calibration block 1 supplies participant-specific median initiation latency and first-pass entry duration. Threshold multipliers and error-rate cutoffs are configured in `config/study.json`. The backend selects the desired music state and track; the browser performs playback and reports transition outcomes. A saved decision does not by itself prove successful playback or perceived smoothness.

## Storage and analysis

Events and submission receipts commit with session updates before the backend acknowledges success. The browser's IndexedDB outbox retains pending commands for retry; stable IDs prevent duplicate saves. Restarted attempts retain their audit events, while current-attempt exports and measures exclude the archived attempt. SQLite is the saved source for recovery and export generation; researchers continue to use exported CSV files for notebook analysis.

See [storage and recovery](SQLITE-NEXT.md), [SQLite queries and development-only reset instructions](SQLITE-QUERIES.md), and the [data dictionary](DATA-DICTIONARY.md). The [pilot analysis notebook](../feedback-files/analysis/Pilot_Study_v1_App_Improvement_Analysis.ipynb) contains the revised 20-record calibration justification and distinguishes it from the historical two-minute pilot baselines.

The final version 2 bank (`playback-bank-v2`) contains 8 Baseline, 8 Reduced and 8 Elevated study tracks. Static reserves B09; Adaptive uses the other 7 Baseline tracks. All 24 study WAVs match the SHA-256 values in the supplied version 2 metadata workbook. Descriptive composer, work, performance and source-file identities are imported into the manifest and session catalogue; technical measurements and QC/classification details remain in the workbook. Existing bank rotation order is retained. The separate Audio-Check B01 remains comfort-only and has no matching row in the workbook. The app does not use MI metadata to change the adaptive performance rule or normalize the recordings. See the README music instructions and data dictionary for provenance and export fields.
