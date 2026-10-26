// Run ONLY against a disposable backend: TEST_API_ORIGIN=http://127.0.0.1:3101 node tests/baseline-api.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const origin = process.env.TEST_API_ORIGIN;
if (!origin) throw new Error("Set TEST_API_ORIGIN to an isolated backend with disposable TUNED_IN_DATA_DIR.");
async function post(path, data) {
    return fetch(origin + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
}
async function ok(path, data) { const r = await post(path, data); assert.ok(r.ok, await r.clone().text()); return r.json(); }
async function snapshot(id) { return (await fetch(`${origin}/api/sessions/${id}/export/session.json`)).json(); }
async function create(mode) {
    const r = await ok("/api/sessions", { participantId: `BASELINE-${mode}-${randomUUID()}`, studyMode: "Formative", baselineMode: mode === "records" ? "timed" : "records",
        orderId: "formative", timing: { practiceSeconds: 2, baselineSeconds: 2, blockSeconds: 3 } });
    const created = await snapshot(r.sessionId);
    assert.equal(created.baseline.mode, mode, "client override must not change configured rule");
    assert.equal(created.timing.baselineSeconds, setup.timing.baselineSeconds, "baseline timing comes only from configuration");
    const start = await ok(`/api/sessions/${r.sessionId}/blocks/1/start`, { condition: "No music" });
    return { id: r.sessionId, record: start.record, attemptId: start.attemptId };
}
async function present(session, index) {
    const time = 1000 + index * 50;
    await ok(`/api/sessions/${session.id}/events`, { events: [
        { eventId: randomUUID(), attemptId: session.attemptId, blockNumber: 1, recordId: session.record.id, eventType: "record_presented", clientTimeMs: time },
        { eventId: randomUUID(), attemptId: session.attemptId, blockNumber: 1, recordId: session.record.id, eventType: "first_key", clientTimeMs: time+5 },
    ] });
    return time;
}
const setup = await (await fetch(origin + "/api/study-setup")).json();
for (const mode of [setup.baseline.defaultMode]) {
    const session = await create(mode); let finalRequest, result;
    for (let index = 0; index < 15; index++) {
        const time = await present(session, index);
        if (index === 0) {
            const rejected = await ok(`/api/sessions/${session.id}/blocks/1/submit`, { requestId: randomUUID(), attemptId: session.attemptId,
                recordId: session.record.id, values: { ...session.record, quantity: "WRONG" }, clientTimeMs: time+10 });
            assert.equal(rejected.accepted, false); assert.equal(rejected.validatedRecords, 0); assert.equal(rejected.baselineComplete, false);
        }
        finalRequest = { requestId: randomUUID(), attemptId: session.attemptId, recordId: session.record.id, values: session.record, clientTimeMs: time+20 };
        result = await ok(`/api/sessions/${session.id}/blocks/1/submit`, finalRequest);
        assert.equal(result.validatedRecords, index+1);
        if (index === 13 && mode === "records") assert.equal((await post(`/api/sessions/${session.id}/blocks/1/finish`, { durationSeconds: 2 })).status, 400);
        if (index < 14) { assert.equal(result.baselineComplete, false); assert.ok(result.nextRecord); session.record = result.nextRecord; }
    }
    if (mode === "records") {
        assert.equal(result.baselineComplete, true); assert.equal(result.nextRecord, null);
        assert.equal(result.completedDurationSeconds, 0.72);
        // A lost final acknowledgement must replay without creating a sixteenth record.
        assert.deepEqual(await ok(`/api/sessions/${session.id}/blocks/1/submit`, finalRequest), result);
        let saved = await snapshot(session.id);
        assert.equal(saved.blocks[0].durationSeconds, 0.72); assert.ok(saved.blocks[0].endedAt);
        assert.equal(saved.measures[0].validatedRecords, 15); assert.equal(saved.measures[0].recordsPresented, 15);
        assert.equal(saved.measures[0].correctionCycles, 1);
        assert.equal(saved.measures[0].firstPassRecordErrorRate, 1/15);
        await ok(`/api/sessions/${session.id}/blocks/1/finish`, { durationSeconds: 999 }); // Backend owns actual record-based duration.
        saved = await snapshot(session.id); assert.equal(saved.blocks[0].durationSeconds, 0.72);
    } else {
        assert.equal(result.baselineComplete, false); assert.ok(result.nextRecord);
        const saved = await snapshot(session.id); assert.equal(saved.blocks[0].endedAt, null);
        await ok(`/api/sessions/${session.id}/blocks/1/finish`, { durationSeconds: setup.timing.baselineSeconds });
        assert.equal((await snapshot(session.id)).blocks[0].durationSeconds, setup.timing.baselineSeconds);
    }
    for (const filename of ["blocks.csv", "records.csv", "decisions.csv", "transitions.csv", "tracks.csv"]) {
        const text = await (await fetch(`${origin}/api/sessions/${session.id}/export/${filename}`)).text();
        const rows = text.trim().split("\n").map(line => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(m => m[1].replaceAll('""','"')));
        const [header,...data] = rows;
        assert.ok(header.includes("baseline_mode")); assert.ok(header.includes("baseline_target_records"));
        for (const values of data) { assert.equal(values.length, header.length); assert.equal(values[header.indexOf("baseline_mode")], mode);
            assert.equal(values[header.indexOf("baseline_target_records")], mode === "records" ? "15" : ""); }
    }
    console.log(`PASS ${mode} baseline: completion rule, correction counting, duration, retry receipt, and export labels`);
}
