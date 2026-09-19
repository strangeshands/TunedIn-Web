import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db.js";
import { calculateSessionMeasures } from "./measures.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

const createSessionSchema = z.object({
    participantId: z.string().trim().min(1).max(100),
    orderId: z.enum(["A", "B", "C"]),
    conditionOrder: z.array(z.string()).length(3),
});

const startBlockSchema = z.object({
    condition: z.string().min(1),
    startedAt: z.string().datetime().optional(),
});

const eventSchema = z.object({
    blockNumber: z.number().int().min(1).max(3),
    recordId: z.string().min(1),
    eventType: z.enum([
        "record_presented",
        "first_key",
        "record_submitted",
        "validation_result",
    ]),
    clientTimeMs: z.number().finite(),
    payload: z.record(z.string(), z.unknown()).optional(),
});

const eventsSchema = z.object({
    events: z.array(eventSchema).min(1).max(500),
});

const finishBlockSchema = z.object({
    endedAt: z.string().datetime().optional(),
    durationSeconds: z.number().nonnegative(),
});

app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
});

app.post("/api/sessions", (req, res) => {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const value = parsed.data;

    db.prepare(
        `
    INSERT INTO sessions (
      id, participant_id, order_id, condition_order_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `,
    ).run(
        id,
        value.participantId,
        value.orderId,
        JSON.stringify(value.conditionOrder),
        now,
        now,
    );

    res.status(201).json({ sessionId: id });
});

app.post("/api/sessions/:sessionId/blocks/:blockNumber/start", (req, res) => {
    const blockNumber = Number(req.params.blockNumber);
    const parsed = startBlockSchema.safeParse(req.body);

    if (!Number.isInteger(blockNumber) || blockNumber < 1 || blockNumber > 3) {
        return res.status(400).json({ error: "Invalid block number." });
    }
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }

    const session = db
        .prepare("SELECT id FROM sessions WHERE id = ?")
        .get(req.params.sessionId);

    if (!session) return res.status(404).json({ error: "Session not found." });

    const startedAt = parsed.data.startedAt ?? new Date().toISOString();

    db.prepare(
        `
    INSERT INTO blocks (session_id, block_number, condition, started_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(session_id, block_number) DO UPDATE SET
      condition = excluded.condition,
      started_at = excluded.started_at,
      ended_at = NULL,
      duration_seconds = NULL
  `,
    ).run(req.params.sessionId, blockNumber, parsed.data.condition, startedAt);

    res.status(201).json({ ok: true });
});

app.post("/api/sessions/:sessionId/events", (req, res) => {
    const parsed = eventsSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }

    const session = db
        .prepare("SELECT id FROM sessions WHERE id = ?")
        .get(req.params.sessionId);

    if (!session) return res.status(404).json({ error: "Session not found." });

    const insert = db.prepare(`
    INSERT INTO events (
      session_id, block_number, record_id, event_type,
      client_time_ms, payload_json, received_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

    const insertMany = db.transaction(
        (events: z.infer<typeof eventSchema>[]) => {
            const receivedAt = new Date().toISOString();
            for (const event of events) {
                insert.run(
                    req.params.sessionId,
                    event.blockNumber,
                    event.recordId,
                    event.eventType,
                    event.clientTimeMs,
                    event.payload ? JSON.stringify(event.payload) : null,
                    receivedAt,
                );
            }
        },
    );

    insertMany(parsed.data.events);
    res.status(201).json({ saved: parsed.data.events.length });
});

app.post("/api/sessions/:sessionId/blocks/:blockNumber/finish", (req, res) => {
    const blockNumber = Number(req.params.blockNumber);
    const parsed = finishBlockSchema.safeParse(req.body);

    if (!Number.isInteger(blockNumber) || blockNumber < 1 || blockNumber > 3) {
        return res.status(400).json({ error: "Invalid block number." });
    }
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }

    const endedAt = parsed.data.endedAt ?? new Date().toISOString();

    const result = db
        .prepare(
            `
    UPDATE blocks
    SET ended_at = ?, duration_seconds = ?
    WHERE session_id = ? AND block_number = ?
  `,
        )
        .run(
            endedAt,
            parsed.data.durationSeconds,
            req.params.sessionId,
            blockNumber,
        );

    if (result.changes === 0) {
        return res.status(404).json({ error: "Block not found." });
    }

    db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(
        endedAt,
        req.params.sessionId,
    );

    res.json({
        ok: true,
        measures:
            calculateSessionMeasures(req.params.sessionId).find(
                (m) => m.block === blockNumber,
            ) ?? null,
    });
});

app.get("/api/sessions", (_req, res) => {
    const rows = db
        .prepare(
            `
    SELECT
      s.id,
      s.participant_id,
      s.order_id,
      s.created_at,
      s.updated_at,
      COUNT(b.id) AS blocks_started,
      SUM(CASE WHEN b.ended_at IS NOT NULL THEN 1 ELSE 0 END) AS blocks_completed
    FROM sessions s
    LEFT JOIN blocks b ON b.session_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `,
        )
        .all();

    res.json(rows);
});

app.get("/api/sessions/:sessionId", (req, res) => {
    const session = db
        .prepare(
            `
    SELECT id, participant_id, order_id, condition_order_json, created_at, updated_at
    FROM sessions
    WHERE id = ?
  `,
        )
        .get(req.params.sessionId) as
        | {
              id: string;
              participant_id: string;
              order_id: string;
              condition_order_json: string;
              created_at: string;
              updated_at: string;
          }
        | undefined;

    if (!session) return res.status(404).json({ error: "Session not found." });

    res.json({
        id: session.id,
        participantId: session.participant_id,
        orderId: session.order_id,
        conditionOrder: JSON.parse(session.condition_order_json),
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        measures: calculateSessionMeasures(session.id),
    });
});

app.get("/api/participants/:participantId/latest", (req, res) => {
    const row = db
        .prepare(
            `
    SELECT id
    FROM sessions
    WHERE participant_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `,
        )
        .get(req.params.participantId) as { id: string } | undefined;

    if (!row) return res.status(404).json({ error: "Participant not found." });

    res.redirect(307, `/api/sessions/${row.id}`);
});

app.listen(port, () => {
    console.log(`Tuned In backend running at http://localhost:${port}`);
});
