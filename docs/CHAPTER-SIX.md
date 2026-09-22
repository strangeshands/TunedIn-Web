# Chapter Six mapping

| Chapter Six item | This project |
| --- | --- |
| Visible fictional source record and three matching entry fields | `frontend/src/App.tsx` |
| Immediate correction feedback | Backend submission endpoint plus highlighted frontend fields |
| Record presentation, first key, submission and validation timestamps | `backend/data/.../events.jsonl` |
| IL, FPED, FPRER and TTSV | `backend/src/measures.ts` |
| Practice/baseline and three timed blocks | App flow and `config/study.json` |
| Session metadata, condition order and comfort check | Saved in `session.json` and ready for SQLite `sessions` table |
| JSONL and CSV export | `backend/src/exports.ts` |
| SQLite storage | Pending: documented in `backend/src/store.ts` and `docs/` |
| Reduced/baseline/elevated banks, playback and crossfade | Reserved for later; not faked in silent runs |

When audio is added, implement the rolling 60-second window, 30-second evaluations, minimum count and Chapter Six reduced/baseline/elevated rules in a backend service. Persist every decision, selected track, transition start/end and load failure. The fields already appear in the pending SQLite schema and CSV header files.
