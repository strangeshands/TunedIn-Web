# Tuned In

This is a simple local browser application for the Chapter Six fictional digital encoding task.

It keeps the App.tsx flow you supplied:

```text
Participant setup
    → Silent baseline practice
    → Audio-comfort check
    → Block 1 → results
    → Block 2 → results
    → Block 3 → results
    → Session complete
```

The visible record has three fields: **Record Code**, **Batch Code**, and **Quantity**. The participant uses Tab between fields and Enter to submit. Incorrect fields are highlighted and must be corrected before the next record.

## What this version does

- Keeps the participant setup, condition-order selector, practice task, audio-comfort screen, timed blocks, block results, and final download flow.
- Keeps the Chapter Six measures: initiation latency (IL), first-pass entry duration (FPED), first-pass record error rate (FPRER), time to successful validation (TTSV), throughput, and correction cycles.
- Generates source records, compares answers, calculates measures, writes JSON Lines and CSV files, and saves session data **in the backend**.
- Organizes browser helper code under `frontend/src/script/`.
- Includes a SQLite design and a clear `TODO(SQLite)` annotation, but does **not** install or use SQLite yet.

## What is deliberately not included yet

The audio-comfort stage is present as a manual checklist. It does not play music. The `No music`, `Static music`, and `Adaptive music` labels remain in the counterbalanced order because they belong to the study design, but this simple version does not load music, crossfade tracks, or run adaptive playback.

The backend still creates `decisions.csv`, `transitions.csv`, and `tracks.csv` with headers. They are empty until music playback is implemented; this avoids pretending that a music exposure occurred.

## Run it

Install Node.js 18 or newer. In the `TunedIn-Web` folder:

```bash
npm run install:all
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Keep both processes running while using the app.

To create a production browser build:

```bash
npm run build
npm run start --prefix backend
```

Then open [http://localhost:3001](http://localhost:3001).

## Make changes

| To change… | Edit this file |
| --- | --- |
| Practice length or experimental block length | `config/study.json` |
| Counterbalanced A/B/C order | `frontend/src/App.tsx` and `backend/src/server.ts` together |
| How fictional records look | `backend/src/records.ts` |
| Answer validation | `backend/src/records.ts` |
| IL, FPED, FPRER, TTSV, throughput or correction formulas | `backend/src/measures.ts` |
| What an API request does | `backend/src/server.ts` |
| CSV/JSONL output fields | `backend/src/exports.ts` and `docs/DATA-DICTIONARY.md` |
| App flow and wording | `frontend/src/App.tsx` |
| Browser-to-backend requests | `frontend/src/script/api.ts` |
| Browser event sending | `frontend/src/script/eventQueue.ts` |
| Visual design | `frontend/src/styles.css` |
| Pending SQLite migration | `backend/src/store.ts`, `docs/sqlite-schema.sql`, and `docs/SQLITE-NEXT.md` |

Restart the backend after changing `config/study.json`. Give `version` and `taskVersion` a new value before collecting study data with changed settings/materials.

## Folder guide

```text
frontend/src/App.tsx          Screen flow and visible participant interface
frontend/src/script/          Browser helper scripts only
  api.ts                      Calls the backend
  eventQueue.ts               Sends raw interaction events
  format.ts                   Formats the timer for display
backend/src/server.ts         API routes and session lifecycle
backend/src/records.ts        Server-side fictional records and answer checking
backend/src/measures.ts       Server-side calculations
backend/src/exports.ts        Server-side CSV/JSONL creation
backend/src/store.ts          JSON storage now; SQLite annotation for later
backend/data/                 Created automatically; saved participant data
config/study.json             Research settings for new sessions
shared/types.ts               Shared TypeScript data shapes
docs/DATA-DICTIONARY.md       Meaning of every saved CSV field
docs/sqlite-schema.sql        Pending SQLite tables and fields
docs/SQLITE-NEXT.md           SQLite implementation notes
music/reduced/                Reserved for later music files
music/baseline/               Reserved for later music files
music/elevated/               Reserved for later music files
```

## Saved files

At each block completion the backend creates:

```text
backend/data/exports/<session-id>/
```

| File | What it contains |
| --- | --- |
| `blocks.csv` | One row per block and its summary measures |
| `records.csv` | One row per record, timestamps, IL, FPED, FPRER indicator, TTSV and corrections |
| `events.jsonl` | Raw presentation, first-key, submission and validation events |
| `session.json` | Full saved session plus backend-calculated block measures |
| `decisions.csv` | Header-only until adaptation is implemented |
| `transitions.csv` | Header-only until crossfades are implemented |
| `tracks.csv` | Header-only until a final track manifest is implemented |

See [docs/DATA-DICTIONARY.md](docs/DATA-DICTIONARY.md) for a field-by-field explanation. `quantity` is stored as text so leading zeros are retained. Times are browser monotonic milliseconds; rates are fractions from 0 to 1.

## SQLite later

The current app saves JSON session files so it can be used without a database dependency. SQLite is the next storage step, not an active component. Its required tables cover sessions, blocks, raw events, record measures, block measures, tracks, adaptation decisions, and transitions. Read [docs/SQLITE-NEXT.md](docs/SQLITE-NEXT.md) before adding it.

## Important study note

This app uses fictional data only. Current silent runs must not be described as delivering static or adaptive music conditions. Pilot the final timings, minimum record count, music manifest, playback volume, track selection and crossfade behavior before a main study.
