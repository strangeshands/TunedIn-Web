-- Runtime schema, mirrored in backend/src/sqliteStore.ts.
-- All writes use BEGIN IMMEDIATE / COMMIT with foreign_keys=ON,
-- journal_mode=WAL, synchronous=FULL and busy_timeout=5000.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  -- All Session fields except events, including blocks, tracks and playback decisions.
  snapshot TEXT NOT NULL
);
CREATE TABLE events (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  event_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  -- Original timestamp, attempt ID, record ID, event type and payload.
  event_json TEXT NOT NULL,
  PRIMARY KEY(session_id, event_id),
  UNIQUE(session_id, sequence)
);
CREATE TABLE submission_receipts (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  request_id TEXT NOT NULL,
  request_json TEXT NOT NULL,
  response_json TEXT NOT NULL,
  PRIMARY KEY(session_id, request_id)
);
PRAGMA user_version = 1;
