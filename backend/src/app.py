from datetime import datetime, timezone
from statistics import median
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Tuned In Prototype Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Temporary in-memory storage.
# Everything disappears when the Python server restarts.
SESSIONS: dict[str, dict[str, Any]] = {}

def now_iso():
    return datetime.now(timezone.utc).isoformat()

class CreateSessionRequest(BaseModel):
    participantId: str = Field(min_length=1, max_length=100)
    orderId: str
    conditionOrder: list[str]

class StartBlockRequest(BaseModel):
    condition: str
    startedAt: str | None = None

class TaskEvent(BaseModel):
    blockNumber: int = Field(ge=1, le=3)
    recordId: str
    eventType: str
    clientTimeMs: float
    payload: dict[str, Any] | None = None

class EventsRequest(BaseModel):
    events: list[TaskEvent]

class FinishBlockRequest(BaseModel):
    endedAt: str | None = None
    durationSeconds: float = Field(ge=0)

def calculate_block_measures(session: dict[str, Any], block_number: int):
    block = session["blocks"].get(block_number)
    if not block:
        return None

    events = [
        e for e in session["events"]
        if e["blockNumber"] == block_number
    ]

    records: dict[str, dict[str, Any]] = {}

    for event in sorted(events, key=lambda e: e["clientTimeMs"]):
        rid = event["recordId"]
        record = records.setdefault(rid, {
            "presentedAt": None,
            "firstKeyAt": None,
            "firstSubmissionAt": None,
            "firstPassAccepted": None,
            "validatedAt": None,
            "submissionCount": 0,
        })

        event_type = event["eventType"]
        t = event["clientTimeMs"]
        payload = event.get("payload") or {}

        if event_type == "record_presented" and record["presentedAt"] is None:
            record["presentedAt"] = t

        elif event_type == "first_key" and record["firstKeyAt"] is None:
            record["firstKeyAt"] = t

        elif event_type == "record_submitted":
            record["submissionCount"] += 1
            if record["firstSubmissionAt"] is None:
                record["firstSubmissionAt"] = t

        elif event_type == "validation_result":
            accepted = payload.get("accepted") is True
            if record["firstPassAccepted"] is None:
                record["firstPassAccepted"] = accepted
            if accepted and record["validatedAt"] is None:
                record["validatedAt"] = t

    values = list(records.values())

    il = [
        r["firstKeyAt"] - r["presentedAt"]
        for r in values
        if r["presentedAt"] is not None and r["firstKeyAt"] is not None
    ]

    fped = [
        r["firstSubmissionAt"] - r["firstKeyAt"]
        for r in values
        if r["firstKeyAt"] is not None and r["firstSubmissionAt"] is not None
    ]

    validated = [r for r in values if r["validatedAt"] is not None]
    known_first_pass = [r for r in values if r["firstPassAccepted"] is not None]
    first_pass_errors = sum(
        1 for r in known_first_pass if r["firstPassAccepted"] is False
    )

    ttsv = [
        r["validatedAt"] - r["presentedAt"]
        for r in validated
        if r["presentedAt"] is not None
    ]

    correction_cycles = sum(
        max(0, r["submissionCount"] - 1)
        for r in validated
    )

    duration_seconds = float(block.get("durationSeconds") or 0)
    duration_minutes = duration_seconds / 60 if duration_seconds > 0 else 0
    fp_total = len(known_first_pass)

    return {
        "block": block_number,
        "condition": block["condition"],
        "durationSeconds": duration_seconds,
        "recordsPresented": len(values),
        "validatedRecords": len(validated),
        "validatedRecordThroughput":
            len(validated) / duration_minutes if duration_minutes > 0 else 0,
        "medianInitiationLatencyMs": median(il) if il else None,
        "medianFirstPassEntryDurationMs": median(fped) if fped else None,
        "firstPassRecordErrorRate":
            first_pass_errors / fp_total if fp_total else None,
        "firstPassRecordAccuracy":
            (fp_total - first_pass_errors) / fp_total if fp_total else None,
        "medianTimeToSuccessfulValidationMs": median(ttsv) if ttsv else None,
        "correctionCycles": correction_cycles,
        "correctionCyclesPerValidatedRecord":
            correction_cycles / len(validated) if validated else None,
    }

def calculate_session_measures(session):
    results = []
    for block_number in sorted(session["blocks"]):
        result = calculate_block_measures(session, block_number)
        if result is not None:
            results.append(result)
    return results

@app.get("/api/health")
def health():
    return {"ok": True, "sessionsInMemory": len(SESSIONS)}

@app.post("/api/sessions", status_code=201)
def create_session(body: CreateSessionRequest):
    pid = body.participantId.strip()
    if not pid:
        raise HTTPException(400, "Participant ID is required.")
    if body.orderId not in {"A", "B", "C"}:
        raise HTTPException(400, "Invalid orderId.")
    if len(body.conditionOrder) != 3:
        raise HTTPException(400, "conditionOrder must contain 3 conditions.")

    sid = str(uuid4())
    created = now_iso()
    SESSIONS[sid] = {
        "id": sid,
        "participantId": pid,
        "orderId": body.orderId,
        "conditionOrder": body.conditionOrder,
        "createdAt": created,
        "updatedAt": created,
        "blocks": {},
        "events": [],
    }
    return {"sessionId": sid}

@app.post("/api/sessions/{session_id}/blocks/{block_number}/start", status_code=201)
def start_block(session_id: str, block_number: int, body: StartBlockRequest):
    session = SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(404, "Session not found.")
    if block_number not in {1, 2, 3}:
        raise HTTPException(400, "Invalid block number.")

    session["blocks"][block_number] = {
        "block": block_number,
        "condition": body.condition,
        "startedAt": body.startedAt or now_iso(),
        "endedAt": None,
        "durationSeconds": None,
    }
    session["updatedAt"] = now_iso()
    return {"ok": True}

@app.post("/api/sessions/{session_id}/events", status_code=201)
def save_events(session_id: str, body: EventsRequest):
    session = SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(404, "Session not found.")

    allowed = {
        "record_presented",
        "first_key",
        "record_submitted",
        "validation_result",
    }

    for event_model in body.events:
        event = event_model.model_dump()
        if event["eventType"] not in allowed:
            raise HTTPException(400, f"Unsupported event: {event['eventType']}")
        event["receivedAt"] = now_iso()
        session["events"].append(event)

    session["updatedAt"] = now_iso()
    return {"saved": len(body.events)}

@app.post("/api/sessions/{session_id}/blocks/{block_number}/finish")
def finish_block(session_id: str, block_number: int, body: FinishBlockRequest):
    session = SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(404, "Session not found.")

    block = session["blocks"].get(block_number)
    if block is None:
        raise HTTPException(404, "Block not found.")

    block["endedAt"] = body.endedAt or now_iso()
    block["durationSeconds"] = body.durationSeconds
    session["updatedAt"] = now_iso()

    return {
        "ok": True,
        "measures": calculate_block_measures(session, block_number),
    }

@app.get("/api/sessions")
def list_sessions():
    result = []
    for session in sorted(
        SESSIONS.values(),
        key=lambda s: s["createdAt"],
        reverse=True,
    ):
        completed = sum(
            1 for b in session["blocks"].values()
            if b.get("endedAt") is not None
        )
        result.append({
            "id": session["id"],
            "participant_id": session["participantId"],
            "order_id": session["orderId"],
            "created_at": session["createdAt"],
            "updated_at": session["updatedAt"],
            "blocks_started": len(session["blocks"]),
            "blocks_completed": completed,
        })
    return result

@app.get("/api/sessions/{session_id}")
def get_session(session_id: str):
    session = SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(404, "Session not found.")

    return {
        "id": session["id"],
        "participantId": session["participantId"],
        "orderId": session["orderId"],
        "conditionOrder": session["conditionOrder"],
        "createdAt": session["createdAt"],
        "updatedAt": session["updatedAt"],
        "measures": calculate_session_measures(session),
    }

@app.get("/api/debug/sessions/{session_id}/events")
def debug_events(session_id: str):
    session = SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(404, "Session not found.")
    return {
        "participantId": session["participantId"],
        "events": session["events"],
    }

@app.get("/api/participants/{participant_id}")
def get_participant_results(participant_id: str):
    matching_sessions = [
        session
        for session in SESSIONS.values()
        if session["participantId"] == participant_id
    ]

    if not matching_sessions:
        raise HTTPException(
            status_code=404,
            detail="Participant not found."
        )

    # If the same participant ID somehow has multiple sessions,
    # return the newest one.
    session = max(
        matching_sessions,
        key=lambda s: s["createdAt"]
    )

    return {
        "id": session["id"],
        "participantId": session["participantId"],
        "orderId": session["orderId"],
        "conditionOrder": session["conditionOrder"],
        "createdAt": session["createdAt"],
        "updatedAt": session["updatedAt"],
        "measures": calculate_session_measures(session),
    }