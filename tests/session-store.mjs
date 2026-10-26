// Run: node --import ./backend/node_modules/tsx/dist/loader.mjs --test tests/session-store.mjs
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SessionStore } from "../backend/src/sessionStore.ts";

const fixture = (id = "test-session") => ({
    id, participantId: "TEST", studyMode: "Formative",
    timing: { practiceSeconds: 30, baselineSeconds: 30, blockSeconds: 90 },
    orderId: "formative", conditionOrder: ["Adaptive music"],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    configVersion: "test", buildVersion: "test", randomizationSeed: "test", taskVersion: "test",
    audioIntegration: "rule-engine", comfortVolumePercent: null, comfortCheckCompletedAt: null,
    endedEarlyAt: null, interruptedBlocks: [], blocks: [], events: [], musicTracks: [],
    musicDecisions: [], musicTransitions: [],
});
async function temporary(t) {
    const directory = await mkdtemp(join(tmpdir(), "tuned-in-storage-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    return directory;
}

test("loads valid sessions, reports corrupt files, and leaves every source file intact", async t => {
    const directory = await temporary(t);
    const files = {
        "test-session.json": JSON.stringify(fixture()),
        "broken.json": '{"id":',
        "wrong-shape.json": JSON.stringify({ id: "wrong-shape", events: null }),
        "mismatch.json": JSON.stringify(fixture("another-id")),
        "test-session.json.tmp": "incomplete temporary write",
    };
    await Promise.all(Object.entries(files).map(([file, contents]) => writeFile(join(directory, file), contents)));
    const store = new SessionStore(directory);
    await store.load();
    assert.deepEqual([...store.sessions.keys()], ["test-session"]);
    assert.deepEqual(store.loadIssues.map(issue => issue.file).sort(), ["broken.json", "mismatch.json", "wrong-shape.json"]);
    for (const [file, contents] of Object.entries(files)) assert.equal(await readFile(join(directory, file), "utf8"), contents);
});

test("rejects malformed nested events and blocks without preventing other loads", async t => {
    const directory = await temporary(t);
    for (const [id, change] of Object.entries({
        "bad-event": { events: [{ sequence: 1, blockNumber: 0, recordId: "R1", eventType: "first_key", clientTimeMs: "wrong" }] },
        "bad-block": { blocks: [null] },
        "bad-track": { musicTracks: [null] },
        "bad-decision": { musicDecisions: [null] },
        "bad-transition": { musicTransitions: [null] },
    })) await writeFile(join(directory, `${id}.json`), JSON.stringify({ ...fixture(id), ...change }));
    const store = new SessionStore(directory); await store.load();
    assert.equal(store.sessions.size, 0);
    assert.equal(store.loadIssues.length, 5);
});

test("fills only known legacy defaults in memory without rewriting the original", async t => {
    const directory = await temporary(t);
    const legacy = fixture();
    delete legacy.endedEarlyAt; delete legacy.interruptedBlocks; delete legacy.musicTransitions;
    const contents = JSON.stringify(legacy);
    await writeFile(join(directory, "test-session.json"), contents);
    const store = new SessionStore(directory); await store.load();
    assert.equal(store.loadIssues.length, 0);
    assert.deepEqual(store.sessions.get(legacy.id), fixtureWithDefaults(legacy));
    assert.equal(await readFile(join(directory, "test-session.json"), "utf8"), contents);
});
function fixtureWithDefaults(legacy) {
    return { ...legacy, endedEarlyAt: null, interruptedBlocks: [], musicTransitions: [] };
}

test("captures each save immediately and writes queued snapshots in order", async t => {
    const directory = await temporary(t);
    const store = new SessionStore(directory); await store.load();
    const session = fixture();
    const writes = [];
    for (let sequence = 1; sequence <= 100; sequence++) {
        session.events.push({ sequence, blockNumber: 0, recordId: `R${sequence}`, eventType: "record_presented", clientTimeMs: sequence });
        writes.push(store.save(session));
    }
    session.participantId = "UNSAVED MUTATION";
    await Promise.all(writes);
    const persisted = JSON.parse(await readFile(join(directory, "test-session.json"), "utf8"));
    assert.equal(persisted.events.length, 100);
    assert.equal(persisted.participantId, "TEST");
    const reloaded = new SessionStore(directory); await reloaded.load();
    assert.equal(reloaded.loadIssues.length, 0);
    assert.equal(reloaded.sessions.get(session.id).events.length, 100);
});

test("a failed write rejects its caller but does not poison the next queued save", async t => {
    const directory = await temporary(t);
    const store = new SessionStore(directory); await store.load();
    const session = fixture(); await store.save(session);
    const original = await readFile(join(directory, "test-session.json"), "utf8");
    const obstruction = join(directory, "test-session.json.tmp");
    await mkdir(obstruction);
    session.participantId = "NEXT";
    await assert.rejects(store.save(session));
    assert.equal(await readFile(join(directory, "test-session.json"), "utf8"), original);
    await rm(obstruction, { recursive: true });
    await store.save(session);
    assert.equal(JSON.parse(await readFile(join(directory, "test-session.json"), "utf8")).participantId, "NEXT");
});

test("separate sessions persist independently and unsafe IDs cannot escape the directory", async t => {
    const directory = await temporary(t);
    const store = new SessionStore(directory); await store.load();
    await Promise.all([store.save(fixture("one")), store.save(fixture("two"))]);
    for (const id of ["one", "two"]) assert.equal(JSON.parse(await readFile(join(directory, `${id}.json`), "utf8")).id, id);
    assert.throws(() => store.save(fixture("../escape")), /Invalid session ID/);
});
