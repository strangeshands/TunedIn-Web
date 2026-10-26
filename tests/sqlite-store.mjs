import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { SqliteStore } from "../backend/src/sqliteStore.ts";
import { calculateBlockMeasures } from "../backend/src/measures.ts";

const fixture = () => ({
    id: "test-session", participantId: "TEST", studyMode: "Formative",
    timing: { practiceSeconds: 30, baselineSeconds: 30, blockSeconds: 90 },
    orderId: "formative", conditionOrder: ["Adaptive music"],
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    configVersion: "test", buildVersion: "test", randomizationSeed: "test", taskVersion: "test",
    audioIntegration: "rule-engine", comfortVolumePercent: null, comfortCheckCompletedAt: null,
    endedEarlyAt: null, interruptedBlocks: [],
    blocks: [{ number: 0, condition: "No music", attemptId: "attempt-1", startedAt: "2026-01-01T00:00:00.000Z", endedAt: null, durationSeconds: 30, initialMusicTrackId: null }],
    events: [], musicTracks: [], musicDecisions: [], musicTransitions: [],
});
const event = (sequence, eventType, clientTimeMs, payload) => ({
    sequence, eventId: `event-${sequence}`, attemptId: "attempt-1", blockNumber: 0,
    recordId: "S0-R1", eventType, clientTimeMs, ...(payload ? { payload } : {}),
});
async function setup(t) {
    const directory = await mkdtemp(join(tmpdir(), "tuned-in-sqlite-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const store = new SqliteStore(directory); await store.load();
    t.after(() => { try { store.close(); } catch {} });
    return { directory, store };
}

test("imports healthy JSON once, preserves originals, and skips malformed files", async t => {
    const { directory, store } = await setup(t);
    store.close();
    const original = JSON.stringify(fixture());
    await writeFile(join(directory, "test-session.json"), original);
    await writeFile(join(directory, "broken.json"), "{");
    await writeFile(join(directory, "bad.json"), JSON.stringify({ id: "bad" }));
    const imported = new SqliteStore(directory); await imported.load();
    assert.equal(imported.sessions.size, 1); assert.equal(imported.loadIssues.length, 2);
    const session = imported.sessions.get("test-session"); session.participantId = "UPDATED"; imported.commit(session); imported.close();
    const restarted = new SqliteStore(directory); await restarted.load();
    assert.equal(restarted.sessions.get("test-session").participantId, "UPDATED");
    assert.equal(await readFile(join(directory, "test-session.json"), "utf8"), original);
    restarted.close();
});

test("events and submission receipts commit atomically and cannot change under the same ID", async t => {
    const { directory, store } = await setup(t); const session = fixture();
    session.events.push(event(1, "record_presented", 100));
    store.commit(session, { requestId: "submission-1", request: "request", response: "response" });
    assert.equal(store.receipt(session.id, "submission-1").response, "response");
    session.events[0].clientTimeMs = 999;
    assert.throws(() => store.commit(session), /cannot be changed/);
    assert.equal(store.sessions.get(session.id).events[0].clientTimeMs, 100);
    const invalid = structuredClone(store.sessions.get(session.id));
    invalid.events.push(event(2, "first_key", 200));
    assert.throws(() => store.commit(invalid, { requestId: "submission-1", request: "duplicate", response: "bad" }), /UNIQUE/);
    store.close(); const restarted = new SqliteStore(directory); await restarted.load();
    assert.equal(restarted.sessions.get(session.id).events.length, 1);
    assert.equal(restarted.receipt(session.id, "submission-1").response, "response"); restarted.close();
});

test("restarting a block preserves its audit events and never reuses sequence numbers", async t => {
    const { directory, store } = await setup(t); const session = fixture();
    session.events.push(event(1, "record_presented", 100), event(2, "first_key", 200)); store.commit(session);
    session.events = []; session.blocks[0].attemptId = "attempt-2"; store.commit(session);
    assert.equal(store.nextSequence(session), 3);
    session.events.push({ ...event(3, "record_presented", 10), attemptId: "attempt-2" }); store.commit(session);
    assert.deepEqual(store.auditEvents(session.id).map(e => e.includedInCurrentAttempt), [false, false, true]);
    store.close(); const restarted = new SqliteStore(directory); await restarted.load();
    assert.equal(restarted.sessions.get(session.id).events.length, 1); assert.equal(restarted.auditEvents(session.id).length, 3); restarted.close();
});

test("SIGKILL after COMMIT preserves exact events and derived measures", async t => {
    const { directory, store } = await setup(t); store.close();
    const session = fixture();
    session.events = [event(1, "record_presented", 100), event(2, "first_key", 300),
        event(3, "record_submitted", 1300), event(4, "validation_result", 1300, { accepted: false }),
        event(5, "record_submitted", 1800), event(6, "validation_result", 1800, { accepted: true })];
    const expected = calculateBlockMeasures(session, 0);
    assert.equal(expected.medianInitiationLatencyMs, 200);
    assert.equal(expected.medianFirstPassEntryDurationMs, 1000);
    assert.equal(expected.medianTimeToSuccessfulValidationMs, 1700);
    assert.equal(expected.firstPassRecordErrorRate, 1);
    assert.equal(expected.correctionCycles, 1);
    assert.equal(expected.validatedRecordThroughput, 2);
    const module = fileURLToPath(new URL("../backend/src/sqliteStore.ts", import.meta.url));
    const loader = fileURLToPath(new URL("../backend/node_modules/tsx/dist/loader.mjs", import.meta.url));
    const child = spawn(process.execPath, ["--import", loader, "--input-type=module", "-e", `
        import { SqliteStore } from ${JSON.stringify(module)};
        const store = new SqliteStore(${JSON.stringify(directory)}); await store.load();
        store.commit(${JSON.stringify(session)});
        process.stdout.write("COMMITTED\\n"); setInterval(() => {}, 1000);
    `], { stdio: ["ignore", "pipe", "pipe"] });
    t.after(() => child.kill("SIGKILL"));
    await new Promise((resolve, reject) => {
        child.stdout.on("data", chunk => { if (chunk.toString().includes("COMMITTED")) resolve(); });
        child.on("error", reject); child.on("exit", code => { if (code !== null) reject(new Error(`Child exited ${code}`)); });
    });
    const exited = new Promise(resolve => child.once("exit", resolve)); child.kill("SIGKILL"); await exited;
    const recovered = new SqliteStore(directory); await recovered.load();
    const saved = recovered.sessions.get(session.id);
    assert.deepEqual(saved.events, session.events); assert.deepEqual(calculateBlockMeasures(saved, 0), expected);
    recovered.close();
});

test("SIGKILL before COMMIT rolls back an incomplete transaction", async t => {
    const { directory, store } = await setup(t); store.commit(fixture()); store.close();
    const child = spawn(process.execPath, ["--input-type=module", "-e", `
        import { DatabaseSync } from 'node:sqlite';
        const db = new DatabaseSync(${JSON.stringify(join(directory, "study.sqlite"))});
        db.exec("BEGIN IMMEDIATE; DELETE FROM sessions;");
        process.stdout.write("UNCOMMITTED\\n"); setInterval(() => {}, 1000);
    `], { stdio: ["ignore", "pipe", "pipe"] });
    t.after(() => child.kill("SIGKILL"));
    await new Promise((resolve, reject) => { child.stdout.once("data", resolve); child.on("error", reject); });
    const exited = new Promise(resolve => child.once("exit", resolve)); child.kill("SIGKILL"); await exited;
    const recovered = new SqliteStore(directory); await recovered.load(); assert.equal(recovered.sessions.size, 1); recovered.close();
    const db = new DatabaseSync(join(directory, "study.sqlite"));
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok"); db.close();
});


test("a busy database restores committed memory and permits a clean retry", async t => {
    const { directory, store } = await setup(t);
    const session = fixture(); store.commit(session);
    const blocker = new DatabaseSync(join(directory, "study.sqlite"));
    blocker.exec("BEGIN IMMEDIATE");
    try {
        session.events.push(event(1, "record_presented", 100));
        assert.throws(() => store.commit(session), /locked/);
        assert.equal(store.sessions.get(session.id).events.length, 0);
    } finally { blocker.exec("ROLLBACK"); blocker.close(); }
    const retry = store.sessions.get(session.id);
    retry.events.push(event(1, "record_presented", 100)); store.commit(retry);
    assert.equal(store.auditEvents(session.id).length, 1);
});
