// Run against disposable dev servers. Uses a temporary browser profile, never your browser data.
// PLAYWRIGHT_MODULE, PLAYWRIGHT_EXECUTABLE_PATH, and TEST_ORIGIN follow presentation-recovery.mjs.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const origin = process.env.TEST_ORIGIN ?? "http://127.0.0.1:5173";
const launch = {
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: "chrome" }),
    headless: true,
};
async function commands(page, sessionId) {
    return page.evaluate(async id => (await import("/src/script/outbox.ts")).pendingCommands(id), sessionId);
}
async function saved(page, sessionId) {
    const response = await page.request.get(`${origin}/api/sessions/${sessionId}/export/session.json`);
    assert.equal(response.status(), 200); return response.json();
}
async function crash(context, page) {
    const browser = context.browser();
    const cdp = await browser.newBrowserCDPSession();
    const { processInfo } = await cdp.send("SystemInfo.getProcessInfo");
    const processId = processInfo.find(info => info.type === "browser").id;
    // Kill only the temporary browser started by this test; no unload/flush hooks run.
    process.kill(processId, "SIGKILL");
    await context.close().catch(() => undefined);

}
for (const scenario of ["offline events and submission", "committed submission with lost acknowledgement"]) {
    const profile = await mkdtemp(join(tmpdir(), "tuned-in-browser-crash-"));
    let context;
    try {
        context = await chromium.launchPersistentContext(profile, launch);
        let page = context.pages()[0]; page.setDefaultTimeout(8000);
        await page.goto(origin);
        const participantId = `DURABLE-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await page.getByRole("textbox", { name: "Participant ID" }).fill(participantId);
        await page.getByRole("combobox").first().selectOption("Formative");
        await page.getByRole("spinbutton", { name: "Practice duration (seconds)", exact: true }).fill("3600");
        const created = page.waitForResponse(r => r.url().endsWith("/api/sessions"));
        await page.getByRole("button", { name: "Save participant & continue" }).click();
        const { sessionId } = await (await created).json();
        await page.getByRole("button", { name: /^Next/ }).click();
        await page.getByRole("button", { name: /^Next/ }).click();
        await page.getByRole("button", { name: "I have understood the instructions" }).click();
        if (scenario === "offline events and submission") {
            await page.route("**/events", route => route.fulfill({ status: 503, json: { error: "Injected offline backend" } }));
        } else {
            await page.route("**/blocks/0/submit", async route => {
                assert.equal((await route.fetch()).status(), 200);
                await route.fulfill({ status: 503, json: { error: "Injected lost acknowledgement after COMMIT" } });
            });
        }
        await page.getByRole("button", { name: "Start Practice Block" }).click();
        await page.locator("form.panel").waitFor();
        const source = await page.locator(".source-row strong").allTextContents();
        for (const [i, name] of ["Record Code", "Batch Code", "Quantity"].entries())
            await page.getByRole("textbox", { name, exact: true }).fill(source[i]);
        await page.getByRole("button", { name: /Submit Record/ }).click();
        await page.getByRole("alert").waitFor();
        const before = await commands(page, sessionId);
        assert.equal(before.length, scenario === "offline events and submission" ? 3 : 1);
        const submission = before.find(entry => entry.command.kind === "submission");
        assert.ok(submission);
        const committedBefore = await saved(page, sessionId);
        assert.equal(committedBefore.events.length, scenario === "offline events and submission" ? 0 : 4);
        await crash(context, page);
        context = await chromium.launchPersistentContext(profile, launch);
        page = context.pages()[0]; page.setDefaultTimeout(8000); await page.goto(origin);
        assert.deepEqual(await commands(page, sessionId), before);
        // LocalStorage autofill is not the durable outbox; researcher can re-enter the participant code.
        await page.getByRole("textbox", { name: "Participant ID" }).fill(participantId);
        await page.getByRole("combobox").first().selectOption("Formative");
        await page.getByRole("button", { name: "Recover saved session" }).click();
        await page.getByRole("heading", { name: "Timed block was interrupted" }).waitFor();
        const recovered = await saved(page, sessionId);
        assert.equal(recovered.events.length, 4);
        assert.equal(new Set(recovered.events.map(event => event.eventId)).size, 4);
        assert.deepEqual(recovered.events.map(event => event.eventType), ["record_presented", "first_key", "record_submitted", "validation_result"]);
        const [presented, firstKey, submitted, validated] = recovered.events;
        assert.equal(submitted.clientTimeMs, submission.command.clientTimeMs);
        assert.equal(validated.clientTimeMs, submitted.clientTimeMs);
        assert.equal(recovered.measures[0].medianInitiationLatencyMs, firstKey.clientTimeMs - presented.clientTimeMs);
        assert.equal(recovered.measures[0].medianFirstPassEntryDurationMs, submitted.clientTimeMs - firstKey.clientTimeMs);
        assert.equal(recovered.measures[0].validatedRecords, 1);
        if (scenario === "committed submission with lost acknowledgement") assert.deepEqual(recovered.events, committedBefore.events);
        assert.deepEqual(await commands(page, sessionId), []);
        // Reusing an ID for a different event must be rejected, with committed data unchanged.
        const conflict = await page.request.post(`${origin}/api/sessions/${sessionId}/events`, {
            data: { events: [{ ...presented, clientTimeMs: presented.clientTimeMs + 1 }] },
        });
        assert.equal(conflict.status(), 400);
        assert.deepEqual((await saved(page, sessionId)).events, recovered.events);
        await page.getByRole("button", { name: /Restart this block from/ }).click();
        await page.locator("form.panel").waitFor();
        // Wait for the new presentation to be committed.
        await page.waitForFunction(async id => (await (await fetch(`/api/sessions/${id}/export/session.json`)).json()).events.length === 1, sessionId);
        const restarted = await saved(page, sessionId);
        assert.equal(restarted.events[0].sequence, 5);
        const auditResponse = await page.request.get(`${origin}/api/sessions/${sessionId}/export/all-events.jsonl`);
        const audit = (await auditResponse.text()).trim().split("\n").map(line => JSON.parse(line));
        assert.equal(audit.length, 5);
        assert.deepEqual(audit.map(event => event.includedInCurrentAttempt), [false, false, false, false, true]);
        console.log(`PASS browser crash/reopen: ${scenario}; exact timestamps, deduplication, measures, and interrupted-attempt audit preserved`);
    } finally {
        await context?.close().catch(() => undefined);
        await rm(profile, { recursive: true, force: true });
    }
}

// If browser storage refuses writes, never transmit or falsely acknowledge those events.
{
    const browser = await chromium.launch(launch);
    const page = await browser.newPage();
    try {
        await page.addInitScript(() => {
            const original = IDBDatabase.prototype.transaction;
            IDBDatabase.prototype.transaction = function (...args) {
                if (window.blockStudyStorage && args[1] === "readwrite")
                    throw new DOMException("Injected storage failure", "QuotaExceededError");
                return original.apply(this, args);
            };
            window.blockStudyStorage = true;
        });
        await page.goto(origin);
        await page.getByRole("textbox", { name: "Participant ID" }).fill(`STORAGE-FAIL-${Date.now()}`);
        await page.getByRole("combobox").first().selectOption("Formative");
        const created = page.waitForResponse(r => r.url().endsWith("/api/sessions"));
        await page.getByRole("button", { name: "Save participant & continue" }).click();
        const { sessionId } = await (await created).json();
        await page.getByRole("button", { name: /^Next/ }).click();
        await page.getByRole("button", { name: /^Next/ }).click();
        await page.getByRole("button", { name: "I have understood the instructions" }).click();
        await page.getByRole("button", { name: "Start Practice Block" }).click();
        await page.getByRole("alert").waitFor();
        const source = await page.locator(".source-row strong").allTextContents();
        for (const [i, name] of ["Record Code", "Batch Code", "Quantity"].entries())
            await page.getByRole("textbox", { name, exact: true }).fill(source[i]);
        await page.getByRole("button", { name: /Submit Record/ }).click();
        await page.getByRole("alert").waitFor();
        await page.getByText(/Could not save this record/).waitFor();
        assert.equal((await saved(page, sessionId)).events.length, 0);
        // Fix storage without reloading: the retained commands must still be retryable.
        await page.evaluate(() => { window.blockStudyStorage = false; });
        const submittedResponse = page.waitForResponse(r => r.url().endsWith("/blocks/0/submit"));
        await page.getByRole("button", { name: /Submit Record/ }).click();
        const received = await submittedResponse;
        assert.equal(received.status(), 200, await received.text());
        await page.waitForFunction(async id => (await (await fetch(`/api/sessions/${id}/export/session.json`)).json()).events.some(e => e.eventType === "validation_result"), sessionId);
        const recovered = await saved(page, sessionId);
        assert.equal(recovered.events.filter(event => event.eventType === "record_submitted").length, 1);
        assert.equal(recovered.measures[0].validatedRecords, 1);
        console.log("PASS browser storage failure blocks transmission, reports the problem, and retains original commands for retry");
    } finally { await browser.close(); }
}
