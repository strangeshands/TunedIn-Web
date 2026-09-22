-- PENDING: This schema is documentation for the next SQLite implementation.
-- The current app uses backend/data JSON files and does not open SQLite.
PRAGMA foreign_keys = ON;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY, participant_id TEXT NOT NULL, order_id TEXT NOT NULL,
  condition_order_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  config_version TEXT NOT NULL, task_version TEXT NOT NULL, audio_integration TEXT NOT NULL,
  comfort_check_completed_at TEXT
);
CREATE TABLE blocks (
  session_id TEXT NOT NULL, block_number INTEGER NOT NULL, condition TEXT NOT NULL,
  started_at TEXT NOT NULL, ended_at TEXT, duration_seconds REAL,
  PRIMARY KEY (session_id, block_number), FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE TABLE events (
  session_id TEXT NOT NULL, sequence INTEGER NOT NULL, block_number INTEGER NOT NULL,
  record_id TEXT NOT NULL, event_type TEXT NOT NULL, client_time_ms REAL NOT NULL,
  payload_json TEXT, PRIMARY KEY (session_id, sequence),
  FOREIGN KEY (session_id, block_number) REFERENCES blocks(session_id, block_number)
);
CREATE TABLE record_measures (
  session_id TEXT NOT NULL, block_number INTEGER NOT NULL, record_id TEXT NOT NULL,
  presented_ms REAL, first_key_ms REAL, first_submission_ms REAL, first_pass_rejected INTEGER,
  validated_ms REAL, il_ms REAL, fped_ms REAL, ttsv_ms REAL, submission_count INTEGER NOT NULL,
  PRIMARY KEY (session_id, block_number, record_id),
  FOREIGN KEY (session_id, block_number) REFERENCES blocks(session_id, block_number)
);
CREATE TABLE block_measures (
  session_id TEXT NOT NULL, block_number INTEGER NOT NULL, records_presented INTEGER NOT NULL,
  validated_records INTEGER NOT NULL, validated_records_per_minute REAL, median_il_ms REAL,
  median_fped_ms REAL, first_pass_error_rate REAL, first_pass_accuracy REAL,
  median_ttsv_ms REAL, correction_cycles INTEGER NOT NULL,
  correction_cycles_per_validated_record REAL, PRIMARY KEY (session_id, block_number),
  FOREIGN KEY (session_id, block_number) REFERENCES blocks(session_id, block_number)
);
CREATE TABLE tracks (
  session_id TEXT NOT NULL, track_id TEXT NOT NULL, music_class TEXT NOT NULL,
  relative_file_path TEXT NOT NULL, classification_method TEXT, classification_version TEXT,
  loudness_checked INTEGER, file_sha256 TEXT, PRIMARY KEY (session_id, track_id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE TABLE adaptation_decisions (
  session_id TEXT NOT NULL, decision_id TEXT NOT NULL, block_number INTEGER NOT NULL,
  window_start_ms REAL NOT NULL, window_end_ms REAL NOT NULL, record_count INTEGER NOT NULL,
  median_il_ms REAL, median_fped_ms REAL, first_pass_error_rate REAL,
  baseline_il_ms REAL, baseline_fped_ms REAL, previous_state TEXT NOT NULL,
  selected_state TEXT NOT NULL, previous_track_id TEXT, selected_track_id TEXT, reason TEXT NOT NULL,
  PRIMARY KEY (session_id, decision_id),
  FOREIGN KEY (session_id, block_number) REFERENCES blocks(session_id, block_number)
);
CREATE TABLE transitions (
  session_id TEXT NOT NULL, transition_id TEXT NOT NULL, block_number INTEGER NOT NULL,
  decision_id TEXT, previous_track_id TEXT, selected_track_id TEXT, started_ms REAL NOT NULL,
  completed_ms REAL, configured_crossfade_ms REAL NOT NULL, outcome TEXT NOT NULL, error TEXT,
  PRIMARY KEY (session_id, transition_id),
  FOREIGN KEY (session_id, block_number) REFERENCES blocks(session_id, block_number)
);
