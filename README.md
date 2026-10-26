# Tuned In — Pilot Study

This branch is the version for the group's first iterative-feedback session. It is a local browser prototype of the Chapter Six fictional digital-encoding task.

The current build identifier is `pilot-1.1.0`. Before collecting a different formative iteration, update `buildVersion` in `config/study.json`. The backend saves that value with each session and in every export, so participants P001–P003 can be traced to the exact build used.

```text
Participant setup → Participant introduction → Practice → Silent baseline calibration
→ Calibration results → Audio-comfort check
→ Configured experimental block(s) → Session complete
```

Participants copy fictional Record Code, Batch Code, and Quantity values into matching fields. Record codes use upper- and lower-case letters, which must be copied exactly. They use Tab between fields and Enter to submit; incorrect fields require correction.

## What this feedback version includes

- No music, Static music, and Adaptive music conditions in a counterbalanced order.
- Participant introduction, optional practice, and silent baseline calibration, with calibration results shown before audio setup.
- Backend-only calculation of IL, FPED, FPRER, TTSV, throughput, and correction cycles.
- Adaptive decisions from a 60-second rolling window, evaluated every 30 seconds.
- Frozen playback-bank metadata and browser playback with backend exports.
- Configurable five-second crossfades and `/test-music` development screen.

## Choose the study mode

The participant setup screen records one of three modes with every session:

- **Pilot** and **Main** use the counterbalanced orders in `conditionOrders`.
- **Formative Testing** automatically uses `formativeConditionOrder`, currently one `Adaptive music` block. It also shows editable practice and block durations in seconds. Baseline mode, target, and duration are controlled only by study configuration.

Change these arrays and default timings in `config/study.json` to configure the study without editing application code. Formative timing values are saved as an immutable session snapshot in `session.json`, `events.jsonl`, and every CSV export.

## Choose the baseline completion rule

The revised baseline protocol specifies **20 successfully completed records**, with no time limit. Apply the configuration below before collecting sessions under this protocol; documentation changes alone do not change the app configuration. Set **baseline.defaultMode** in `config/study.json` before starting collection. Participant setup has no baseline selector or duration override:

- **20 completed records:** participants continue until 20 distinct records have been accepted. Incorrect submissions require correction of the same record and do not increase the count. Progress and elapsed time are shown.
- **Timed (120 seconds):** the baseline ends after two minutes, regardless of the number completed. This duration comes from `baselineSeconds` in study configuration.

The introduction and calibration instructions reflect the selected rule. Practice and main-block completion rules are unchanged. The two baseline rules are alternatives: the inactive rule does not stop the block.

Configure availability in `config/study.json`:

```json
"baselineSeconds": 120,
"baseline": {
  "defaultMode": "records",
  "enabledModes": ["records", "timed"],
  "recordTarget": 20
}
```

To disable timed calibration, set `enabledModes` to `["records"]`. To disable record-based calibration, set it to `["timed"]` and set `defaultMode` to `"timed"`. At least one rule must remain enabled, and the default must be enabled. Set `defaultMode` to `"records"` or `"timed"` to choose the active rule; `enabledModes` restricts which values are valid. Keep `baselineSeconds: 120` to retain the two-minute option. Restart the backend after changing configuration.

The selected rule and target are saved with each new session. Recovering an existing session keeps its original rule; older sessions without a rule snapshot remain timed. Restarting an interrupted record-based baseline starts a new attempt at zero toward its saved target, preserving the interrupted attempt in the audit data.

The 20-record target standardizes the number of observations used to estimate participant-specific timing references for adaptive music, rather than measuring output within two minutes. Twenty is a practical target for the next pilot, not a proven statistical minimum. See [baseline protocol, justification, and sources](feedback-files/analysis/Pilot_Study_v1_App_Improvement_Analysis.ipynb#Baseline-calibration-justification:-revised-20-record-protocol) for pilot evidence and planned stability checks.

Exports include `baseline_mode` and `baseline_target_records`. In record mode, baseline `duration_seconds` is the actual interval from the first presentation to final accepted submission. `configured_baseline_seconds` still records the retained timing setting, but it is inactive in record mode. CSV analysis should check `baseline_mode` before comparing calibration durations.

It uses local SQLite storage with transactional event persistence. Events and submissions are retained in a browser IndexedDB outbox until the backend commits and acknowledges their IDs. Recover a session on the same browser profile and origin to replay pending commands after an interruption.

On first startup, existing JSON session files are imported into `backend/data/study.sqlite`; originals remain unchanged as migration backups. Malformed legacy files are preserved and reported in the backend terminal and `/api/health` (`skippedSessionFiles`). See [storage and recovery](docs/SQLITE-NEXT.md) for durability, backup, and recovery details.

## Storage and analysis

**SQLite saves study data during collection; the exported CSV files will still be used for analysis in Jupyter (`.ipynb`) notebooks.** Researchers do not need to query SQLite to perform the planned analysis.

SQLite is retained so the app can commit events and submissions together, prevent duplicate saves on retry, and recover committed data after an interruption. The participant results ZIP is generated from this saved data. It is an export, so it does not replace the storage needed before a researcher downloads it. SQLite also provides a source from which exports can be generated again.

For each participant:

1. Download **results ZIP** after the session and keep a backup of the original ZIP.
2. Extract the CSV files and load them into the analysis notebook, for example with `pandas.read_csv()`.
3. Apply the study's inclusion rules: distinguish study modes and exclude practice, calibration, interrupted attempts, and incomplete experimental blocks from the main condition comparisons.
4. Join the separately collected PFS questionnaire responses using the participant and condition identifiers, retaining session IDs to distinguish repeated sessions.

Keep the SQLite database as the saved source and recovery record. Use the CSV exports as the notebook inputs, following the [data dictionary](docs/DATA-DICTIONARY.md) for field definitions and units. For optional data inspection, see the [basic SQLite query guide](docs/SQLITE-QUERIES.md).

## Set up

Install **Node.js 22.13 or newer**:

```bash
node --version
```

For a new clone:

```bash
git clone https://github.com/strangeshands/TunedIn-Web.git
cd TunedIn-Web
git checkout fuf-ite1
npm run install:all
```

For an existing clone:

```bash
git fetch origin
git switch fuf-ite1
git pull
npm run install:all
```

## Add music

Place the exact approved source files directly in these folders:

```text
music/baseline/
music/reduced/
music/elevated/
```

`config/playback-bank.json` is the frozen playback manifest. It records each approved file's checksum, composer/composition metadata, rotation position, loudness, and true peak. A file is available only when its path and SHA-256 match that manifest. This prevents accidental track substitutions.

Empty or missing folders do not crash the task; playback remains silent. For useful feedback, include at least one audio file in each bank.

## Add data folder

Add `data` folder under /backend for the export files.

## Run

From the repository root:

```bash
npm run dev
```

| Service | Address |
| --- | --- |
| Participant interface | [http://localhost:5173](http://localhost:5173) |
| Backend API and exports | [http://localhost:3001](http://localhost:3001) |

Keep the terminal running. Press `Ctrl+C` in that terminal to stop the services.

## Feedback checklist

1. Create a participant and select an order.
2. Complete practice, silent calibration, and audio-comfort setup.
3. Check that calibration results appear before the first experimental block.
4. Complete each music condition and note usability issues.
5. In Adaptive Music, check that state changes and track changes are understandable.
6. Download the CSV files after the session and check that they contain data.

The current frontend timings are shortened for feedback. Do not collect final study data until timings, music manifest, threshold values, track-selection policy, and crossfade duration are finalized.

## Temporary music page

Visit [http://localhost:5173/test-music](http://localhost:5173/test-music) to test music without creating a participant session or saving study data. It provides a starting-track selector, metric sliders, predicted state, automatic target-state track selection, and current-track display.

To remove this temporary feature later, delete `frontend/src/TestMusic.tsx`, remove the `/test-music` condition from `frontend/src/main.tsx`, and revert the temporary crossfade changes in `frontend/src/script/audio.ts` and `backend/src/server.ts`.

## Saved files

After each block, the backend writes exports to:

```text
backend/data/exports/<session-id>/
```

| File | Contents |
| --- | --- |
| `blocks.csv` | One row per practice, calibration, or experimental block. |
| `records.csv` | One row per presented record and its measures. |
| `events.jsonl` | Raw presentation, key, submission, and validation events for current block attempts. |
| `all-events.jsonl` | All raw events, including interrupted attempts, with inclusion flags. |
| `decisions.csv` | Adaptive windows and resulting state/track decisions. |
| `transitions.csv` | Playback outcome after each adaptive decision. |
| `tracks.csv` | Music files discovered when the session began. |
| `session.json` | Complete local session snapshot. |

See [docs/DATA-DICTIONARY.md](docs/DATA-DICTIONARY.md) for field definitions. Exported timing values are milliseconds, even when the interface displays seconds.

## Where to make changes

| Change | File |
| --- | --- |
| Stage routing | `frontend/src/App.tsx` |
| Session lifecycle, recovery, and task submissions | `frontend/src/study/hooks/useStudyController.ts` |
| Participant screen markup | `frontend/src/study/screens/` |
| Browser history and navigation lock | `frontend/src/study/hooks/useStudyNavigation.ts` |
| Block and rest countdowns | `frontend/src/study/hooks/useBlockTimers.ts` |
| Study audio lifecycle and adaptive scheduling | `frontend/src/study/hooks/useStudyAudio.ts` |
| Shared screen elements and stage types | `frontend/src/study/components.tsx`, `frontend/src/study/types.ts` |
| Temporary music test screen | `frontend/src/TestMusic.tsx` |
| Playback implementation | `frontend/src/script/audio.ts` |
| Track rotation and repeat avoidance | `backend/src/playbackPolicy.ts` |
| Backend routes and session lifecycle | `backend/src/server.ts` |
| Measures | `backend/src/measures.ts` |
| Adaptive rules | `backend/src/rule.ts` |
| Export columns | `backend/src/exports.ts` |
| Frozen manifest verification and static playback gain | `backend/src/music.ts` |
| Shared data shapes | `shared/types.ts` |
| Playback settings: gain target, peak limit, headroom, crossfade | `config/study.json` |
| Formative build identifier | `config/study.json` (`buildVersion`) |
| Approved tracks and their fixed metadata | `config/playback-bank.json` |

## Current limitations

- Browser outbox recovery requires the same origin and browser profile. Clearing site data can remove unsent commands.
- Back up the SQLite database as described in [storage and recovery](docs/SQLITE-NEXT.md).
- The frozen manifest must be regenerated when an approved audio source file changes.

## Frontend regression checks

Run `npm run build` from the repository root to compile the frontend and type-check the backend. Run `npm run test:storage` to verify SQLite migration, atomic events and receipts, rollback, interrupted-attempt audit, and recovery after forced backend termination. Storage tests use temporary directories and do not modify saved study data.

With both development servers running and Playwright available, run `node tests/presentation-recovery.mjs` to check event retries, lost acknowledgements, duplicate-submit prevention, and block completion while an event is pending. The checks create new Formative sessions and export files; start the backend with `TUNED_IN_DATA_DIR` pointing to a disposable directory, and set the same variable for the test script. Set `PLAYWRIGHT_MODULE` to an installed Playwright module URL if needed, and `PLAYWRIGHT_EXECUTABLE_PATH` to a Chromium browser executable when Google Chrome is unavailable.

Run `node tests/durable-recovery.mjs` against disposable dev servers to test event and submission replay after forced browser termination. It uses a temporary browser profile. Set `TEST_ORIGIN` when the frontend runs on a port other than 5173.

### Baseline checks

Run `npm run test:baseline` for configuration, legacy-session, counting, and duration checks.

For integration checks, start disposable backend/frontend servers with a temporary `TUNED_IN_DATA_DIR`, then run `TEST_API_ORIGIN=http://127.0.0.1:3101 node tests/baseline-api.mjs`. Run `TEST_ORIGIN=http://127.0.0.1:5273 node tests/baseline-browser.mjs` for participant instructions, the configured completion rule and recovery. Run the checks once per configured mode, restarting the backend after each configuration change. Browser checks require Playwright; `PLAYWRIGHT_MODULE` can specify its module path and `PLAYWRIGHT_EXECUTABLE_PATH` a Chromium executable. These checks create test sessions; do not run them against collection data.
