# Tuned In — Python prototype backend

This version uses no SQL/database. It keeps sessions and task events in a normal
Python dictionary and computes the measures from those raw events.

## Run

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 3001
```

Check:

- `http://localhost:3001/api/health`
- `http://localhost:3001/docs`

Your existing frontend `api.ts` can stay unchanged if it points to
`http://localhost:3001`.

## Measures

The backend computes:

- validated record throughput
- median initiation latency (IL)
- median first-pass entry duration (FPED)
- first-pass record error rate (FPRER)
- first-pass accuracy
- median time to successful validation (TTSV)
- correction cycles
- correction cycles per validated record

## Important

This is deliberately temporary. All data disappears when the Python process
stops or reloads. Add persistent storage later.
