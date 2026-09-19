# Tuned In — Frontend Prototype

React + TypeScript + Vite prototype aligned with Chapter 6's planned frontend architecture and initial digital encoding flow.

## Run

Requires Node.js 20+.

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
npm run preview
```

## Included

- React/Vite/TypeScript project foundation
- Study-condition setup: No music / Static music / Adaptive music
- Participant-facing digital encoding interface
- Source record remains visible while entering values
- Record Code, Batch Code, Quantity fields
- Tab/Enter-friendly form flow
- Exact-value validation and field-level correction feedback
- Timer and record progress
- Completion screen
- Responsive layout
- Fictional records only

## Next tickets

- Timestamped event logger / JSONL schema
- Node/Express session service
- SQLite persistence
- Baseline calibration
- IL / FPED / FPRER processing
- Rolling-window adaptation engine
- Local WAV manifest/music banks
- Web Audio crossfade
- CSV export and researcher controls

The prototype intentionally keeps research metrics and adaptation internals out of the participant-facing UI, matching Chapter 6.
