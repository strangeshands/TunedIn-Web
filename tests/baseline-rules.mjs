// Pure rule checks; no saved study data is opened or changed.
import test from "node:test";
import assert from "node:assert/strict";
import { baselineForNewSession, baselineFor, validateBaselineOptions, validatedRecordCount, recordBaselineDuration } from "../backend/src/baseline.ts";

test("the configured default is 15 records; each alternative can be disabled", () => {
    assert.deepEqual(baselineForNewSession(), { mode: "records", recordTarget: 15 });
    for (const mode of ["records", "timed"]) {
        const options = { defaultMode: mode, enabledModes: [mode], recordTarget: 15 };
        assert.equal(baselineForNewSession(options).mode, mode);
        assert.equal(baselineForNewSession({ ...options, enabledModes: ["records", "timed"] }).mode, mode);
    }
    assert.throws(() => validateBaselineOptions({ defaultMode: "records", enabledModes: [], recordTarget: 15 }), /Invalid/);
    assert.throws(() => validateBaselineOptions({ defaultMode: "timed", enabledModes: ["records"], recordTarget: 15 }), /Invalid/);
});

test("legacy sessions stay timed and completed count uses distinct accepted records", () => {
    const session = { events: [
        { blockNumber: 1, recordId: "R1", eventType: "record_presented", clientTimeMs: 1000 },
        { blockNumber: 1, recordId: "R1", eventType: "validation_result", clientTimeMs: 2000, payload: { accepted: false } },
        { blockNumber: 1, recordId: "R1", eventType: "validation_result", clientTimeMs: 3000, payload: { accepted: true } },
        { blockNumber: 1, recordId: "R1", eventType: "validation_result", clientTimeMs: 3000, payload: { accepted: true } },
        { blockNumber: 2, recordId: "R2", eventType: "validation_result", clientTimeMs: 4000, payload: { accepted: true } },
    ] };
    assert.equal(baselineFor(session).mode, "timed");
    assert.equal(validatedRecordCount(session, 1), 1);
    assert.equal(recordBaselineDuration(session), 2);
    assert.throws(() => recordBaselineDuration({ events: [] }), /missing/);
});
