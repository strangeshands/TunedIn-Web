import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";

import { appendRawEvent, writeMeasuresCsv } from "./exports.js";
import {
  calculateBlockMeasures,
  calculateSessionMeasures,
} from "./measures.js";
import { sessions } from "./store.js";
import type {
  Condition,
  EventType,
  OrderId,
  Session,
  TaskEvent,
} from "./types.js";

import path from "node:path";
import fs from "node:fs";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

const MUSIC_ROOT = path.resolve(process.cwd(), "../music");

app.use(
    "/music",
    express.static(MUSIC_ROOT),
);

const CONDITIONS: Condition[] = ["No music", "Static music", "Adaptive music"];
const EVENT_TYPES: EventType[] = [
  "record_presented",
  "first_key",
  "record_submitted",
  "validation_result",
];

function nowIso() {
  return new Date().toISOString();
}

function isCondition(value: unknown): value is Condition {
  return typeof value === "string" && CONDITIONS.includes(value as Condition);
}

function isOrderId(value: unknown): value is OrderId {
  return value === "A" || value === "B" || value === "C";
}

function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && EVENT_TYPES.includes(value as EventType);
}

function getSessionOr404(sessionId: string, res: express.Response) {
  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found." });
    return null;
  }
  return session;
}

type MusicState =
    | "Reduced"
    | "Baseline"
    | "Elevated";

function getTracksForState(
    state: MusicState,
) {
    const folder = path.join(
        MUSIC_ROOT,
        state,
    );

    if (!fs.existsSync(folder)) {
        return [];
    }

    return fs
        .readdirSync(folder)
        .filter((file) =>
            file.toLowerCase().endsWith(".wav"),
        )
        .map((file) => ({
            id: `${state}:${file}`,
            state,
            fileName: file,

            url:
                `/music/${encodeURIComponent(
                    state,
                )}/${encodeURIComponent(
                    file,
                )}`,
        }));
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    backend: "Node.js + Express + TypeScript",
    storage: "in-memory prototype (SQLite pending)",
    sessionsInMemory: sessions.size,
  });
});

app.get("/api/music", (_req, res) => {
    res.json({
        Reduced:
            getTracksForState("Reduced"),

        Baseline:
            getTracksForState("Baseline"),

        Elevated:
            getTracksForState("Elevated"),
    });
});

app.post("/api/sessions", (req, res) => {
  const participantId = String(req.body?.participantId ?? "").trim();
  const orderId = req.body?.orderId;
  const conditionOrder = req.body?.conditionOrder;

  if (!participantId) {
    return res.status(400).json({ error: "Participant ID is required." });
  }

  if (!isOrderId(orderId)) {
    return res.status(400).json({ error: "Invalid orderId." });
  }

  if (
    !Array.isArray(conditionOrder) ||
    conditionOrder.length !== 3 ||
    !conditionOrder.every(isCondition)
  ) {
    return res.status(400).json({ error: "Invalid conditionOrder." });
  }

  const id = randomUUID();
  const timestamp = nowIso();

  const session: Session = {
    id,
    participantId,
    orderId,
    conditionOrder,
    createdAt: timestamp,
    updatedAt: timestamp,
    blocks: new Map(),
    events: [],
  };

  sessions.set(id, session);
  return res.status(201).json({ sessionId: id });
});

app.post("/api/sessions/:sessionId/blocks/:blockNumber/start", (req, res) => {
  const session = getSessionOr404(req.params.sessionId, res);
  if (!session) return;

  const blockNumber = Number(req.params.blockNumber);
  const condition = req.body?.condition;

  if (![1, 2, 3].includes(blockNumber)) {
    return res.status(400).json({ error: "Invalid block number." });
  }

  if (!isCondition(condition)) {
    return res.status(400).json({ error: "Invalid condition." });
  }

  session.blocks.set(blockNumber, {
    block: blockNumber,
    condition,
    startedAt: String(req.body?.startedAt ?? nowIso()),
    endedAt: null,
    durationSeconds: null,
  });

  session.updatedAt = nowIso();
  return res.status(201).json({ ok: true });
});

app.post("/api/sessions/:sessionId/events", (req, res) => {
  const session = getSessionOr404(req.params.sessionId, res);
  if (!session) return;

  const incoming = req.body?.events;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return res.status(400).json({ error: "events must be a non-empty array." });
  }

  const saved: TaskEvent[] = [];

  for (const value of incoming) {
    if (
      typeof value?.blockNumber !== "number" ||
      ![1, 2, 3].includes(value.blockNumber) ||
      typeof value?.recordId !== "string" ||
      !value.recordId ||
      !isEventType(value?.eventType) ||
      typeof value?.clientTimeMs !== "number"
    ) {
      return res.status(400).json({ error: "Invalid task event." });
    }

    const event: TaskEvent = {
      blockNumber: value.blockNumber,
      recordId: value.recordId,
      eventType: value.eventType,
      clientTimeMs: value.clientTimeMs,
      payload:
        value.payload && typeof value.payload === "object"
          ? value.payload
          : undefined,
      receivedAt: nowIso(),
    };

    session.events.push(event);
    appendRawEvent(session, event);
    saved.push(event);
  }

  session.updatedAt = nowIso();
  return res.status(201).json({ saved: saved.length });
});

app.post("/api/sessions/:sessionId/blocks/:blockNumber/finish", (req, res) => {
  const session = getSessionOr404(req.params.sessionId, res);
  if (!session) return;

  const blockNumber = Number(req.params.blockNumber);
  const block = session.blocks.get(blockNumber);
  const durationSeconds = Number(req.body?.durationSeconds);

  if (!block) {
    return res.status(404).json({ error: "Block not found." });
  }

  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return res.status(400).json({ error: "Invalid durationSeconds." });
  }

  block.endedAt = String(req.body?.endedAt ?? nowIso());
  block.durationSeconds = durationSeconds;
  session.updatedAt = nowIso();

  const measures = calculateBlockMeasures(session, blockNumber);
  writeMeasuresCsv(session, calculateSessionMeasures(session));

  return res.json({ ok: true, measures });
});

app.get("/api/sessions", (_req, res) => {
  const result = [...sessions.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((session) => ({
      id: session.id,
      participant_id: session.participantId,
      order_id: session.orderId,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
      blocks_started: session.blocks.size,
      blocks_completed: [...session.blocks.values()].filter(
        (block) => block.endedAt !== null,
      ).length,
    }));

  return res.json(result);
});

app.get("/api/sessions/:sessionId", (req, res) => {
  const session = getSessionOr404(req.params.sessionId, res);
  if (!session) return;

  return res.json({
    id: session.id,
    participantId: session.participantId,
    orderId: session.orderId,
    conditionOrder: session.conditionOrder,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    measures: calculateSessionMeasures(session),
  });
});

app.get("/api/participants/:participantId", (req, res) => {
  const matching = [...sessions.values()]
    .filter((session) => session.participantId === req.params.participantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const session = matching[0];
  if (!session) {
    return res.status(404).json({ error: "Participant not found." });
  }

  return res.json({
    id: session.id,
    participantId: session.participantId,
    orderId: session.orderId,
    conditionOrder: session.conditionOrder,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    measures: calculateSessionMeasures(session),
  });
});

app.get("/api/debug/sessions/:sessionId/events", (req, res) => {
  const session = getSessionOr404(req.params.sessionId, res);
  if (!session) return;

  return res.json({
    participantId: session.participantId,
    events: session.events,
  });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Tuned In backend running at http://127.0.0.1:${PORT}`);
  console.log("Storage: in-memory prototype (SQLite integration pending)");
});
