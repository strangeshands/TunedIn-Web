// Run against disposable dev servers; see README for Playwright environment variables.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const origin = process.env.TEST_ORIGIN ?? "http://127.0.0.1:5173";
const setup = await (await fetch(origin + "/api/study-setup")).json();
const target = setup.baseline.recordTarget;
const baselineSeconds = setup.timing.baselineSeconds;
const baselineClock = `${String(Math.floor(baselineSeconds / 60)).padStart(2, "0")}:${String(baselineSeconds % 60).padStart(2, "0")}`;
const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: "chrome" }),
    headless: true,
});
async function start(mode) {
    const page = await browser.newPage(); page.setDefaultTimeout(8000); await page.clock.install();
    await page.route("**/api/music/catalogue", route => route.fulfill({ json: { baseline: [], reduced: [], elevated: [] } }));
    await page.goto(origin);
    await page.getByRole("textbox", { name: "Participant ID" }).fill(`BASELINE-UI-${mode}-${Date.now()}`);
    await page.getByRole("combobox").first().selectOption("Formative");
    assert.equal(await page.getByRole("combobox", { name: "Baseline completion rule" }).count(), 0);
    assert.equal(await page.getByRole("spinbutton", { name: "Baseline duration (seconds)", exact: true }).count(), 0);
    const created = page.waitForResponse(r => r.url().endsWith("/api/sessions"));
    await page.getByRole("button", { name: "Save participant & continue" }).click();
    const { sessionId } = await (await created).json();
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.getByRole("button", { name: "I have understood the instructions" }).click();
    await page.getByRole("button", { name: "I am ready, skip Practice Block" }).click();
    if (mode === "records") await page.getByText(`${target} completed records`, { exact: true }).waitFor();
    else await page.getByText(baselineClock, { exact: true }).waitFor();
    const started = page.waitForResponse(r => r.url().endsWith("/blocks/1/start"));
    await page.getByRole("button", { name: "Start Calibration Block" }).click();
    const { record } = await (await started).json();
    await page.locator("form.panel").waitFor();
    return { page, sessionId, record };
}
async function submit(state, correct = true) {
    const { page, record } = state;
    for (const [name, key] of [["Record Code", "recordCode"], ["Batch Code", "batchCode"], ["Quantity", "quantity"]])
        await page.getByRole("textbox", { name: new RegExp(`^${name}`) }).fill(correct ? record[key] : "WRONG");
    const response = page.waitForResponse(r => r.url().endsWith("/blocks/1/submit"));
    await page.getByRole("button", { name: /Submit Record/ }).click();
    const received = await response; assert.equal(received.status(), 200, await received.text());
    const result = await received.json(); assert.equal(result.accepted, correct);
    if (result.nextRecord) {
        state.record = result.nextRecord;
        await page.waitForFunction(code => document.querySelector(".source-row strong")?.textContent === code && document.querySelector("form.panel input")?.value === "", state.record.recordCode);
    } else if (!correct) await page.getByText("Correct the value, then submit again.").waitFor();
    return result;
}
try {
    if (setup.baseline.defaultMode === "records") {
    const records = await start("records");
    await records.page.getByText(`Baseline: 0 of ${target} records completed`, { exact: true }).waitFor();
    await records.page.clock.fastForward(baselineSeconds * 1000 + 1);
    await records.page.locator("form.panel").waitFor(); // The retained 120s setting must not stop record mode.
    assert.equal(await records.page.getByText(/remaining$/).count(), 0);
    await submit(records, false);
    await records.page.getByText(`Baseline: 0 of ${target} records completed`, { exact: true }).waitFor();
    for (let count = 1; count <= target; count++) {
        const result = await submit(records);
        assert.equal(result.validatedRecords, count);
        if (count < target) await records.page.getByText(`Baseline: ${count} of ${target} records completed`, { exact: true }).waitFor();
        else { assert.equal(result.baselineComplete, true); assert.equal(result.nextRecord, null); }
    }
    await records.page.getByRole("heading", { name: "Silent Baseline complete." }).waitFor();
    const saved = await (await records.page.request.get(`${origin}/api/sessions/${records.sessionId}/export/session.json`)).json();
    assert.equal(saved.baseline.mode, "records"); assert.equal(saved.timing.baselineSeconds, baselineSeconds);
    assert.equal(saved.measures[0].recordsPresented, target); assert.equal(saved.measures[0].validatedRecords, target);
    assert.equal(saved.measures[0].correctionCycles, 1); assert.ok(saved.blocks[0].durationSeconds > baselineSeconds);
    await records.page.close();
    console.log(`PASS record baseline: no timed cutoff, correct progress, corrections count once, exactly ${target} presentations, actual elapsed duration saved`);

    const recovered = await start("records");
    for (let count = 0; count < 3; count++) await submit(recovered);
    await recovered.page.reload();
    await recovered.page.getByRole("combobox").first().selectOption("Formative");
    await recovered.page.getByRole("button", { name: "Recover saved session" }).click();
    await recovered.page.getByRole("heading", { name: "Baseline calibration was interrupted" }).waitFor();
    await recovered.page.getByRole("button", { name: new RegExp(`Restart baseline from 0 of ${target} records`) }).click();
    await recovered.page.getByText(`Baseline: 0 of ${target} records completed`, { exact: true }).waitFor();
    await recovered.page.clock.fastForward(baselineSeconds * 1000 + 1);
    await recovered.page.locator("form.panel").waitFor();
    await recovered.page.close();
    console.log("PASS recovery keeps the original record rule and a restarted attempt resets progress");
    } else {
    const timed = await start("timed");
    assert.equal(await timed.page.getByText(/Baseline: .* records completed/).count(), 0);
    await timed.page.clock.fastForward(baselineSeconds * 1000);
    await timed.page.getByRole("heading", { name: "Silent Baseline complete." }).waitFor();
    const timedSaved = await (await timed.page.request.get(`${origin}/api/sessions/${timed.sessionId}/export/session.json`)).json();
    assert.equal(timedSaved.baseline.mode, "timed"); assert.equal(timedSaved.blocks[0].durationSeconds, baselineSeconds);
    assert.equal(timedSaved.measures[0].validatedRecords, 0);
    await timed.page.close();
    console.log("PASS timed baseline: configuration selects timed mode and finishes at the deadline without reaching the record target");

    }
} finally { await browser.close(); }
