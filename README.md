# Tuned In — Iterative Feedback #1

This branch is the version for the group's first iterative-feedback session. It is a local browser prototype of the Chapter Six fictional digital-encoding task.

```text
Participant setup → Practice → Silent baseline calibration
→ Calibration results → Audio-comfort check
→ Experimental Blocks 1–3 → Session complete
```

Participants copy fictional Record Code, Batch Code, and Quantity values into matching fields. They use Tab between fields and Enter to submit; incorrect fields require correction.

## What this feedback version includes

- No music, Static music, and Adaptive music conditions in a counterbalanced order.
- Separate practice and silent baseline calibration, with calibration results shown before audio setup.
- Backend-only calculation of IL, FPED, FPRER, TTSV, throughput, and correction cycles.
- Adaptive decisions from a 60-second rolling window, evaluated every 30 seconds.
- Frozen playback-bank metadata, fixed per-track gain, and browser playback with backend exports.
- Configurable equal-power crossfades and `/test-music` development screen.

It uses local JSON storage. SQLite is documented for later work and is not active.

## Set up

Install **Node.js 20.19 or newer**:

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
| `events.jsonl` | Raw presentation, key, submission, and validation events. |
| `decisions.csv` | Adaptive windows and resulting state/track decisions. |
| `transitions.csv` | Playback outcome after each adaptive decision. |
| `tracks.csv` | Music files discovered when the session began. |
| `session.json` | Complete local session snapshot. |

See [docs/DATA-DICTIONARY.md](docs/DATA-DICTIONARY.md) for field definitions. Exported timing values are milliseconds, even when the interface displays seconds.

## Where to make changes

| Change | File |
| --- | --- |
| Participant flow and feedback timings | `frontend/src/App.tsx` |
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
| Approved tracks and their fixed metadata | `config/playback-bank.json` |

## Current limitations

- Local JSON storage only; SQLite remains pending.
- The frozen manifest must be regenerated when an approved audio source file changes.
