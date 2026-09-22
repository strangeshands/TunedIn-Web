import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import type {
    Block,
    Condition,
    OrderId,
    Session,
    TaskEvent,
} from "../../shared/types.js";
import { config } from "./config.js";
import { exportFiles, writeExports } from "./exports.js";
import { calculateBlockMeasures } from "./measures.js";
import { generateRecord, wrongFields } from "./records.js";
import { saveSession, sessions } from "./store.js";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

const orders: Record<OrderId, Condition[]> = {
    A: ["No music", "Static music", "Adaptive music"],
    B: ["Static music", "Adaptive music", "No music"],
    C: ["Adaptive music", "No music", "Static music"],
};
const conditions: Condition[] = ["No music", "Static music", "Adaptive music"];
const eventTypes = [
    "record_presented",
    "first_key",
    "record_submitted",
    "validation_result",
];
const getSession = (id: string) => {
    const session = sessions.get(id);
    if (!session) throw new Error("Session not found.");
    return session;
};
const appendEvent = (session: Session, event: Omit<TaskEvent, "sequence">) =>
    session.events.push({ ...event, sequence: session.events.length + 1 });

app.get("/api/health", (_request, response) =>
    response.json({
        ok: true,
        storage: "JSON files now; SQLite pending",
        audioIntegration: config.audioIntegration,
    }),
);

/**
 *  Creates a new session.
 */
app.post("/api/sessions", (request, response) => {
    const participantId = String(request.body?.participantId ?? "").trim();
    const orderId = request.body?.orderId as OrderId;
    if (!participantId || !Object.hasOwn(orders, orderId))
        throw new Error("Participant ID and order are required.");
    const now = new Date().toISOString();
    const session: Session = {
        id: randomUUID(),
        participantId,
        orderId,
        conditionOrder: orders[orderId],
        createdAt: now,
        updatedAt: now,
        configVersion: config.version,
        taskVersion: config.taskVersion,
        audioIntegration: "deferred",
        comfortCheckCompletedAt: null,
        blocks: [],
        events: [],
    };
    saveSession(session);
    response.status(201).json({ sessionId: session.id });
});

app.post(
    "/api/sessions/:sessionId/blocks/:blockNumber/start",
    (request, response) => {
        const session = getSession(request.params.sessionId);
        const number = Number(request.params.blockNumber);
        const expected = session.blocks.length;
        if (
            !Number.isInteger(number) ||
            number !== expected ||
            number < 0 ||
            number > 3
        )
            throw new Error("Blocks must be started in order.");
        if (number > 0 && session.comfortCheckCompletedAt === null)
            throw new Error(
                "Complete the manual comfort check before Block 1.",
            );
        const condition = number === 0 ? "No music" : request.body?.condition;
        if (!conditions.includes(condition))
            throw new Error("Invalid condition.");
        const block: Block = {
            number,
            condition,
            startedAt: new Date().toISOString(),
            endedAt: null,
            durationSeconds: null,
        };
        session.blocks.push(block);
        saveSession(session);
        response.json({ record: generateRecord(0, number) });
    },
);

app.post("/api/sessions/:sessionId/events", (request, response) => {
    const session = getSession(request.params.sessionId);
    const events = request.body?.events as Omit<TaskEvent, "sequence">[];
    if (!Array.isArray(events) || !events.length)
        throw new Error("Expected task events.");
    for (const event of events) {
        if (
            !Number.isInteger(event.blockNumber) ||
            !session.blocks.find(
                (block) =>
                    block.number === event.blockNumber &&
                    block.endedAt === null,
            ) ||
            typeof event.recordId !== "string" ||
            !eventTypes.includes(event.eventType) ||
            !Number.isFinite(event.clientTimeMs)
        )
            throw new Error("Invalid task event.");
        appendEvent(session, event);
    }
    saveSession(session);
    response.json({ saved: events.length });
});

app.post(
    "/api/sessions/:sessionId/blocks/:blockNumber/submit",
    (request, response) => {
        const session = getSession(request.params.sessionId);
        const number = Number(request.params.blockNumber);
        const block = session.blocks.find(
            (item) => item.number === number && item.endedAt === null,
        );
        const { recordId, values, clientTimeMs } = request.body ?? {};
        if (
            !block ||
            typeof recordId !== "string" ||
            !values ||
            !Number.isFinite(clientTimeMs)
        )
            throw new Error("Invalid record submission.");
        const previousPresentations = session.events.filter(
            (event) =>
                event.blockNumber === number &&
                event.eventType === "record_presented",
        );
        const index = previousPresentations.length - 1;
        const answer = generateRecord(index, number);
        if (answer.id !== recordId)
            throw new Error("Submission does not match the current record.");
        const incorrectFields = wrongFields(answer, values);
        const accepted = incorrectFields.length === 0;
        appendEvent(session, {
            blockNumber: number,
            recordId,
            eventType: "record_submitted",
            clientTimeMs,
            payload: { values },
        });
        appendEvent(session, {
            blockNumber: number,
            recordId,
            eventType: "validation_result",
            clientTimeMs,
            payload: { accepted, incorrectFields },
        });
        saveSession(session);
        response.json({
            accepted,
            incorrectFields,
            nextRecord: accepted ? generateRecord(index + 1, number) : null,
        });
    },
);

app.post("/api/sessions/:sessionId/comfort-check", (request, response) => {
    const session = getSession(request.params.sessionId);
    if (
        !session.blocks.find(
            (block) => block.number === 0 && block.endedAt !== null,
        )
    )
        throw new Error("Finish practice before the comfort check.");
    session.comfortCheckCompletedAt = new Date().toISOString();
    saveSession(session);
    response.json({ ok: true });
});

app.post(
    "/api/sessions/:sessionId/blocks/:blockNumber/finish",
    (request, response) => {
        const session = getSession(request.params.sessionId);
        const number = Number(request.params.blockNumber);
        const block = session.blocks.find((item) => item.number === number);
        const durationSeconds = Number(request.body?.durationSeconds);
        if (
            !block ||
            block.endedAt !== null ||
            !Number.isFinite(durationSeconds) ||
            durationSeconds < 0
        )
            throw new Error("Invalid block completion.");
        block.endedAt = new Date().toISOString();
        block.durationSeconds = durationSeconds;
        saveSession(session);
        const measures = calculateBlockMeasures(session, number);
        writeExports(session);
        response.json({ measures });
    },
);

app.get("/api/sessions/:sessionId/export/:file", (request, response) => {
    const files = exportFiles(getSession(request.params.sessionId));
    const file = request.params.file as keyof typeof files;
    if (!files[file])
        return response.status(404).json({ error: "Export not found." });
    response.attachment(file).send(files[file]);
});

app.use(
    (
        error: Error,
        _request: express.Request,
        response: express.Response,
        _next: express.NextFunction,
    ) =>
        response
            .status(error.message === "Session not found." ? 404 : 400)
            .json({ error: error.message }),
);
app.listen(Number(process.env.PORT ?? 3001), () =>
    console.log("Tuned In backend running on port 3001"),
);
