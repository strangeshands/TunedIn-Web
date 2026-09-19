# Tuned In

**Tuned In** is a local experimental application for studying task-responsive background music and self-reported flow during a digital encoding task.

The project currently contains:

- a React + TypeScript frontend for the participant task
- a Node.js + Express backend for session and task-event processing
- JSON Lines (`.jsonl`) raw-event exports
- CSV processed-measure exports
- temporary in-memory backend storage while SQLite integration is still pending

---

## Project Structure

```text
TunedIn-Web/
├── frontend/
│   ├── src/
│   ├── package.json
│   └── ...
│
├── backend/
│   ├── src/
│   ├── exports/
│   ├── package.json
│   └── ...
│
└── README.md
```

---

# Requirements

Before running the project, make sure you have:

```text
Node.js 18+ recommended
npm
Git
```

Check your versions:

```bash
node --version
npm --version
git --version
```

# Running the Project

The application requires both the frontend and backend to be running.

## Option 1 — Run Both With One Command

If the root project has the combined development script configured, run this from:

```text
TunedIn-Web/
```

```bash
npm install
npm run dev
```

This should start both:

```text
Frontend: http://localhost:5173
Backend:  http://127.0.0.1:3001
```

Keep the terminal open while testing.

---

# Check That the Backend Is Working

Before starting a participant session, open:

```text
http://127.0.0.1:3001/api/health
```

You should receive a response similar to:

```json
{
  "ok": true,
  "backend": "Node.js + Express + TypeScript",
  "storage": "in-memory prototype (SQLite pending)",
  "sessionsInMemory": 0
}
```

If this page does not load, the backend is not running.

---

# Testing the Experiment

The application currently runs in **TEST MODE** during development.

Instead of waiting for the full study durations:

```text
Practice / silent baseline: 8 seconds
Experimental block:         15 seconds
```

The intended study durations are:

```text
Practice / silent baseline: 2 minutes
Experimental block:         8 minutes each
```

Test mode is controlled in the frontend source code:

```ts
const TEST_MODE = true;
```

Do **not** change this to `false` unless you specifically want to test the full-duration study.

---

# Test Flow

When the frontend opens, follow the experiment in this order:

```text
Participant Setup
      ↓
Practice Encoding Task
No Music
      ↓
Audio Comfort Check
      ↓
Block 1
      ↓
Block Results
      ↓
Block 2
      ↓
Block Results
      ↓
Block 3
      ↓
Block Results
      ↓
Participant Summary
```

Enter a participant ID such as:

```text
P001
```

Then select one of the available counterbalanced orders.

The three experimental conditions are:

```text
No music
Static music
Adaptive music
```

The actual audio/adaptation behavior is still under development.

---

# Digital Encoding Task

Each record contains:

```text
Record Code
Batch Code
Quantity
```

The values are randomly generated for each task block.

Example:

```text
Record Code: K7M-418
Batch Code:  QX-16
Quantity:    064
```

Copy the source values exactly into the corresponding fields.

Keyboard controls:

```text
Tab     → move to the next field
Enter   → submit the current record
```

Incorrect submissions remain on the same record until they are corrected.

---

# Data Collected

During each experimental block, the frontend sends task events to the backend.

The current event types are:

```text
record_presented
first_key
record_submitted
validation_result
```

These events allow the backend to derive task-performance measures without directly treating them as measures of flow.

The backend currently processes:

```text
Validated record count
Validated-record throughput
Median Initiation Latency (IL)
Median First-Pass Entry Duration (FPED)
First-Pass Record Error Rate (FPRER)
First-Pass Record Accuracy
Median Time to Successful Validation (TTSV)
Correction Cycles
Correction Cycles per Validated Record
```

---

# Viewing Participant Results

After a participant has completed a block, their processed results can also be viewed directly through the backend API.

For participant `P001`:

```text
http://127.0.0.1:3001/api/participants/P001
```

Example:

```json
{
  "participantId": "P001",
  "orderId": "A",
  "conditionOrder": [
    "No music",
    "Static music",
    "Adaptive music"
  ],
  "measures": [
    {
      "block": 1,
      "condition": "No music",
      "validatedRecords": 5,
      "validatedRecordThroughput": 20,
      "medianInitiationLatencyMs": 850,
      "medianFirstPassEntryDurationMs": 3200,
      "firstPassRecordErrorRate": 0.2
    }
  ]
}
```

You can also access a session directly if you know its session ID:

```text
http://127.0.0.1:3001/api/sessions/<session-id>
```

---

# Exported Data

The backend writes study data into:

```text
backend/exports/
```

Raw task events are saved as:

```text
<participant>_<session-id>_events.jsonl
```

Example:

```text
P001_97205d65-9037-4deb-bd22-c33ba3ce0b99_events.jsonl
```

Processed measures are saved as:

```text
<participant>_<session-id>_measures.csv
```

Example:

```text
P001_97205d65-9037-4deb-bd22-c33ba3ce0b99_measures.csv
```

The CSV output can later be opened in tools such as:

```text
Excel
Google Sheets
Jamovi
R
```

---

# Important: Current Storage Limitation

The backend currently keeps active session information **in memory**.

This means:

```text
Stopping/restarting the backend
        ↓
clears the sessions available through the API
```

The JSONL and CSV files already written to `backend/exports/` remain on disk.

SQLite persistence is planned but has **not yet been integrated**.

Do not rely on the current in-memory storage for actual study deployment.

---

# Current Technology Stack

```text
Frontend
React
TypeScript
HTML5
CSS
Vite

Backend
TypeScript
Node.js
Express

Raw event format
JSON Lines (JSONL)

Processed data format
CSV

Planned local database
SQLite

Browser
Chromium-based browser

Version control
Git + GitHub
```

This structure follows the technology stack described in the thesis while SQLite persistence and the audio/adaptation components are still under development.

---

# Current Development Status

Implemented:

```text
✓ Participant ID and session setup
✓ Counterbalanced condition order
✓ Random fictional record generation
✓ Two-minute practice encoding stage
✓ Test-mode shortened timing
✓ Three timed experimental blocks
✓ Exact record validation
✓ Raw task-event logging
✓ Frontend-to-backend API communication
✓ IL calculation
✓ FPED calculation
✓ FPRER calculation
✓ First-pass accuracy
✓ TTSV calculation
✓ Correction-cycle calculation
✓ Validated-record throughput
✓ Per-block results
✓ Participant result API
✓ JSONL raw-event export
✓ CSV processed-measure export
```

Still under development:

```text
○ SQLite persistence
○ Static music playback
○ Adaptive music playback
○ Audio comfort-check playback
○ Classified music-bank integration
○ Rolling 60-second task window
○ Adaptive-state decision rules
○ Track transitions and crossfading
○ Playback-event logging
○ Final researcher controls
```

---

# Research Prototype Notice

This application is an active research prototype.

Only fictional encoding records are currently used. The task-performance measures are behavioral interaction measures and should not be interpreted as direct measurements of participant flow or arousal.

The final experiment configuration may change following pilot testing.