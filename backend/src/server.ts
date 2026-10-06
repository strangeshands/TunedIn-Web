import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
    Block,
    Condition,
    OrderId,
    Session,
    StudyMode,
    StudyTiming,
    TaskEvent,
} from "../../shared/types.js";
import { config, root } from "./config.js";
import { exportFiles, writeExports } from "./exports.js";
import { calculateBlockMeasures } from "./measures.js";
import { hasAnyMusic, loadMusicCatalogue } from "./music.js";
import { selectInitialTrack, selectNextTrackInState } from "./playbackPolicy.js";
import { generateRecord, wrongFields } from "./records.js";
import { evaluateAdaptiveRule } from "./rule.js";
import { saveSession, sessions } from "./store.js";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

// A missing or empty music directory is safe: Express simply has no files to serve.
app.use("/music", express.static(join(root, "music")));

const orders = config.conditionOrders;
const conditions: Condition[] = ["No music", "Static music", "Adaptive music"];
const defaultTiming: StudyTiming = {
    practiceSeconds: config.practiceSeconds,
    baselineSeconds: config.baselineSeconds,
    blockSeconds: config.blockSeconds,
};
const validTiming = (value: unknown): value is StudyTiming => {
    if (!value || typeof value !== "object") return false;
    const timing = value as Record<string, unknown>;
    return ["practiceSeconds", "baselineSeconds", "blockSeconds"].every(
        (key) =>
            typeof timing[key] === "number" &&
            Number.isFinite(timing[key]) &&
            timing[key] > 0 &&
            timing[key] <= 86_400,
    );
};
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

app.get("/api/health", (_request, response) => {
    const catalogue = loadMusicCatalogue();
    response.json({
        ok: true,
        storage: "JSON files now; SQLite pending",
        audioIntegration: config.audioIntegration,
        musicAvailable: hasAnyMusic(catalogue),
    });
});

/** Lets the frontend see which tracks can be used, without exposing file-system paths. */
app.get("/api/music/catalogue", (_request, response) =>
    response.json(loadMusicCatalogue()),
);

app.get("/api/music/playback-config", (_request, response) =>
    response.json({
        crossfadeMs: config.playback.crossfadeMs,
        crossfadeCurve: config.playback.crossfadeCurve,
        masterHeadroomDb: config.playback.masterHeadroomDb,
        loopTracks: config.playback.loopTracks,
    }),
);

/** Supplies the configured condition orders without duplicating them in the UI. */
app.get("/api/study-setup", (_request, response) =>
    response.json({
        conditionOrders: orders,
        formativeConditionOrder: config.formativeConditionOrder,
        timing: defaultTiming,
        configVersion: config.version,
    }),
);

app.post("/api/sessions", (request, response) => {
    const participantId = String(request.body?.participantId ?? "").trim();
    const orderId = String(request.body?.orderId ?? "") as OrderId;
    const studyMode = request.body?.studyMode as StudyMode;
    const conditionOrder =
        studyMode === "Formative"
            ? config.formativeConditionOrder
            : orders[orderId];
    const timing =
        studyMode === "Formative" && validTiming(request.body?.timing)
            ? request.body.timing
            : defaultTiming;
    if (
        !participantId ||
        !["Formative", "Pilot", "Main"].includes(studyMode) ||
        !conditionOrder?.length
    )
        throw new Error("Participant ID and order are required.");
    const now = new Date().toISOString();
    const musicCatalogue = loadMusicCatalogue();
    const session: Session = {
        id: randomUUID(),
        participantId,
        studyMode,
        timing,
        orderId,
        conditionOrder,
        createdAt: now,
        updatedAt: now,
        configVersion: config.version,
        taskVersion: config.taskVersion,
        audioIntegration: "rule-engine",
        comfortCheckCompletedAt: null,
        blocks: [],
        events: [],
        musicTracks: Object.values(musicCatalogue).flat(),
        musicDecisions: [],
        musicTransitions: [],
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
            number > session.conditionOrder.length + 1
        )
            throw new Error("Blocks must be started in order.");
        if (number > 1 && session.comfortCheckCompletedAt === null)
            throw new Error(
                "Complete the manual comfort check before Block 1.",
            );
        const assignedCondition =
            number <= 1 ? "No music" : session.conditionOrder[number - 2];
        const condition = request.body?.condition;
        if (
            !assignedCondition ||
            !conditions.includes(condition) ||
            condition !== assignedCondition
        )
            throw new Error("Invalid condition.");
        const initialMusicTrack = selectInitialTrack(
            session.id,
            number,
            condition,
            loadMusicCatalogue(),
        );
        const block: Block = {
            number,
            condition,
            startedAt: new Date().toISOString(),
            endedAt: null,
            durationSeconds: null,
            initialMusicTrackId: initialMusicTrack?.id ?? null,
        };
        session.blocks.push(block);
        saveSession(session);
        response.json({
            record: generateRecord(0, number),
            initialMusicTrackId: block.initialMusicTrackId,
        });
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
            (block) => block.number === 1 && block.endedAt !== null,
        )
    )
        throw new Error(
            "Finish silent baseline calibration before the comfort check.",
        );
    session.comfortCheckCompletedAt = new Date().toISOString();
    saveSession(session);
    response.json({ ok: true });
});

/**
 * Evaluates the adaptive rule for the current performance window. The response
 * describes the desired state and track; frontend playback is added later.
 */
app.post(
    "/api/sessions/:sessionId/blocks/:blockNumber/music/evaluate",
    (request, response) => {
        const session = getSession(request.params.sessionId);
        const blockNumber = Number(request.params.blockNumber);
        const block = session.blocks.find(
            (item) => item.number === blockNumber && item.endedAt === null,
        );
        const windowEndMs = Number(request.body?.windowEndMs);
        if (
            !block ||
            block.condition !== "Adaptive music" ||
            !Number.isFinite(windowEndMs) ||
            windowEndMs < 0
        )
            throw new Error("Invalid adaptive-music evaluation.");
        const decision = evaluateAdaptiveRule(
            session,
            blockNumber,
            windowEndMs,
            loadMusicCatalogue(),
        );
        session.musicDecisions.push(decision);
        saveSession(session);
        response.json({ decision });
    },
);

/** Selects the next track in the active bank after a browser audio element ends. */
app.post(
    "/api/sessions/:sessionId/blocks/:blockNumber/music/next",
    (request, response) => {
        const session = getSession(request.params.sessionId);
        const blockNumber = Number(request.params.blockNumber);
        const block = session.blocks.find(
            (item) => item.number === blockNumber && item.endedAt === null,
        );
        const currentTrackId = String(request.body?.currentTrackId ?? "");
        if (
            !block ||
            !["Static music", "Adaptive music"].includes(block.condition) ||
            !currentTrackId
        )
            throw new Error("Invalid next-track request.");

        const state =
            block.condition === "Static music"
                ? "baseline"
                : (session.musicDecisions
                      .filter((item) => item.blockNumber === blockNumber)
                      .at(-1)?.selectedState ?? "baseline");
        if (state === "silent") return response.json({ trackId: null });

        const track = selectNextTrackInState(
            loadMusicCatalogue(),
            state,
            currentTrackId,
        );
        response.json({ trackId: track?.id ?? null });
    },
);

/** Saves the actual browser playback outcome for one adaptive decision. */
app.post(
    "/api/sessions/:sessionId/blocks/:blockNumber/music/transitions",
    (request, response) => {
        const session = getSession(request.params.sessionId);
        const blockNumber = Number(request.params.blockNumber);
        const { decisionId, startedMs, completedMs, outcome, error } =
            request.body ?? {};
        const decision = session.musicDecisions.find(
            (item) =>
                item.id === decisionId && item.blockNumber === blockNumber,
        );
        if (
            !decision ||
            decision.previousTrackId === decision.selectedTrackId ||
            !Number.isFinite(startedMs) ||
            !Number.isFinite(completedMs) ||
            completedMs < startedMs ||
            !["playing", "silent", "failed"].includes(outcome) ||
            (error !== undefined && error !== null && typeof error !== "string")
        )
            throw new Error("Invalid music transition.");

        session.musicTransitions ??= [];
        session.musicTransitions.push({
            id: `transition-${session.musicTransitions.length + 1}`,
            decisionId,
            blockNumber,
            previousTrackId: decision.previousTrackId,
            selectedTrackId: decision.selectedTrackId,
            startedMs,
            completedMs,
            configuredCrossfadeMs: config.playback.crossfadeMs,
            outcome,
            error: error ?? null,
        });
        saveSession(session);
        response.status(201).json({ saved: true });
    },
);

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
