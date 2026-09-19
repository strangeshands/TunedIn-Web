# Tuned In Backend

Current backend implementation aligned with the Chapter 6 technology stack:

- **TypeScript** — backend implementation language
- **Node.js + Express** — local application service / HTTP API
- **JSON Lines (`.jsonl`)** — append-friendly raw task-event export
- **CSV** — processed block-level measure export
- **SQLite** — intentionally pending; current prototype keeps live session state in memory

## Run

```bash
npm install
npm run dev
```

Backend URL:

```text
http://127.0.0.1:3001
```

Health check:

```text
http://127.0.0.1:3001/api/health
```

Participant results:

```text
http://127.0.0.1:3001/api/participants/P001
```

## Prototype storage behavior

While the server is running, session/block/event data is held in memory. Restarting the backend clears that live state. This is the only deliberate mismatch with the final Chapter 6 stack; SQLite can be added later behind the same API.

Raw events are additionally appended to:

```text
exports/<participant>_<session>_events.jsonl
```

Processed measures are written to:

```text
exports/<participant>_<session>_measures.csv
```

## Measures currently computed

- validated-record throughput
- median initiation latency (IL)
- median first-pass entry duration (FPED)
- first-pass record error rate (FPRER)
- first-pass record accuracy
- median time to successful validation (TTSV)
- correction cycles
- correction cycles per validated record
