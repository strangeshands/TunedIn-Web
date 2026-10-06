// Run against the local dev servers with: node tests/presentation-recovery.mjs
// Set PLAYWRIGHT_MODULE to an installed Playwright module URL if it isn't local.
import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const origin = "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });

async function setup() {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.clock.install();
    await page.goto(origin);
    await page.getByRole("textbox", { name: "Participant ID" }).fill("FUF-AUTO-BE1F90E-RECOVERY");
    await page.getByRole("combobox").first().selectOption("Formative");
    for (const name of ["Practice duration (seconds)", "Baseline duration (seconds)", "Adaptive block duration (seconds)"])
        await page.getByRole("spinbutton", { name, exact: true }).fill("30");
    const created = page.waitForResponse(r => r.url().endsWith("/api/sessions"));
    await page.getByRole("button", { name: "Save participant & continue" }).click();
    const { sessionId } = await (await created).json();
    if (process.env.FUF_TEST_SESSION_IDS) appendFileSync(process.env.FUF_TEST_SESSION_IDS, sessionId + "\n");
    await page.getByRole("button", { name: "Start practice" }).waitFor();
    return { context, page, sessionId };
}

async function start(page) {
    await page.getByRole("button", { name: "Start practice" }).click();
    await page.locator(".source-row strong").first().waitFor();
}

async function fill(page) {
    const values = await page.locator(".source-row strong").allTextContents();
    for (const [index, name] of ["Record Code", "Batch Code", "Quantity"].entries())
        await page.getByRole("textbox", { name, exact: true }).fill(values[index]);
    return values[0];
}

async function submit(page) {
    const response = page.waitForResponse(r => r.url().endsWith("/blocks/0/submit"));
    await page.getByRole("button", { name: "Submit Record" }).click();
    const received = await response;
    assert.equal(received.status(), 200, await received.text());
    assert.equal((await received.json()).accepted, true);
}

async function finishAndCheck(page, id) {
    await page.clock.fastForward(30_000);
    await page.getByRole("button", { name: "Start silent calibration" }).waitFor();
    const saved = JSON.parse(readFileSync(join(root, "backend/data", id + ".json"), "utf8"));
    const exported = await (await page.request.get(`${origin}/api/sessions/${id}/export/session.json`)).json();
    const { measures, ...session } = exported;
    assert.deepEqual(session, saved);
    for (const e of saved.events.filter(e => e.eventType === "record_submitted")) {
        const events = saved.events.filter(item => item.recordId === e.recordId);
        const presented = events.filter(item => item.eventType === "record_presented");
        const key = events.find(item => item.eventType === "first_key");
        assert.equal(presented.length, 1);
        assert.ok(presented[0].clientTimeMs <= key.clientTimeMs && key.clientTimeMs <= e.clientTimeMs);
        assert.ok(presented[0].sequence < e.sequence && key.sequence < e.sequence);
    }
    assert.ok(measures[0].medianInitiationLatencyMs >= 0);
    assert.ok(measures[0].medianFirstPassEntryDurationMs >= 0);
    const csv = await (await page.request.get(`${origin}/api/sessions/${id}/export/records.csv`)).text();
    assert.equal(csv, readFileSync(join(root, "backend/data/exports", id, "records.csv"), "utf8"));
    const rows = csv.trim().split("\n").map(line => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(m => m[1].replaceAll('""', '"')));
    const [header, ...data] = rows;
    for (const values of data) {
        const row = Object.fromEntries(header.map((key, i) => [key, values[i]]));
        const events = saved.events.filter(e => e.recordId === row.record_id);
        const p = events.find(e => e.eventType === "record_presented");
        const k = events.find(e => e.eventType === "first_key");
        const s = events.find(e => e.eventType === "record_submitted");
        assert.equal(Number(row.presented_ms), p.clientTimeMs);
        if (s) {
            assert.equal(Number(row.first_submission_ms), s.clientTimeMs);
            assert.equal(Number(row.il_ms), k.clientTimeMs - p.clientTimeMs);
            assert.equal(Number(row.fped_ms), s.clientTimeMs - k.clientTimeMs);
            assert.equal(Number(row.submission_count), events.filter(e => e.eventType === "record_submitted").length);
        }
    }
    return saved;
}

try {
    for (const scenario of ["first", "subsequent", "lost acknowledgement"]) {
        const { context, page, sessionId } = await setup();
        try {
            const target = scenario === "subsequent" ? "S0-R2" : "S0-R1";
            let injected = false;
            await page.route("**/events", async route => {
                const e = route.request().postDataJSON().events[0];
                if (!injected && e.eventType === "record_presented" && e.recordId === target) {
                    injected = true;
                    if (scenario === "lost acknowledgement") assert.equal((await route.fetch()).status(), 200);
                    await route.fulfill({ status: 503, json: { error: "Injected presentation failure" } });
                } else await route.continue();
            });
            await start(page);
            if (scenario === "subsequent") {
                const previous = await fill(page);
                await submit(page);
                await page.waitForFunction(value => document.querySelector(".source-row strong")?.textContent !== value, previous);
            }
            await fill(page);
            await submit(page);
            assert.ok(injected);
            const saved = await finishAndCheck(page, sessionId);
            assert.equal(saved.events.filter(e => e.eventType === "record_submitted").length, scenario === "subsequent" ? 2 : 1);
        } finally { await context.close(); }
        console.log(`PASS ${scenario} presentation failure recovers without duplicate events`);
    }

    {
        const { context, page, sessionId } = await setup();
        try {
            let unavailable = true;
            let submits = 0;
            page.on("request", r => { if (r.url().endsWith("/blocks/0/submit")) submits++; });
            await page.route("**/events", async route => {
                if (unavailable) await route.fulfill({ status: 503, json: { error: "Injected offline backend" } });
                else await route.continue();
            });
            await start(page);
            const visible = await fill(page);
            await page.getByRole("button", { name: "Submit Record" }).click();
            await page.getByRole("alert").waitFor();
            assert.equal(submits, 0);
            assert.equal(await page.getByRole("textbox", { name: "Record Code", exact: true }).inputValue(), visible);
            assert.equal(await page.locator(".source-row strong").first().textContent(), visible);
            unavailable = false;
            await submit(page);
            await page.getByRole("alert").waitFor({ state: "hidden" });
            assert.equal(submits, 1);
            await finishAndCheck(page, sessionId);
        } finally { await context.close(); }
        console.log("PASS persistent failure blocks validation, shows an error, and recovers on retry");
    }

    {
        const { context, page, sessionId } = await setup();
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        try {
            let attempts = 0;
            let held = false;
            let submitTime;
            let submits = 0;
            page.on("request", r => {
                if (r.url().endsWith("/blocks/0/submit")) { submits++; submitTime = r.postDataJSON().clientTimeMs; }
            });
            await page.route("**/events", async route => {
                if (route.request().postDataJSON().events[0].eventType === "record_presented") {
                    attempts++;
                    if (attempts === 1) return route.fulfill({ status: 503, json: { error: "Injected failure" } });
                    held = true;
                    await gate;
                }
                await route.continue();
            });
            await start(page);
            await fill(page);
            const submittedAt = await page.locator("form.panel").evaluate(form => {
                const now = performance.now();
                for (let i = 0; i < 20; i++) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
                return now;
            });
            await page.clock.fastForward(30_000);
            await page.getByRole("heading", { name: "Saving events", exact: true }).waitFor();
            assert.equal(submits, 0);
            assert.equal(JSON.parse(readFileSync(join(root, "backend/data", sessionId + ".json"), "utf8")).blocks[0].endedAt, null);
            // Wait for the route to receive the retry before releasing it.
            const deadline = Date.now() + 5000;
            while (!held && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
            assert.ok(held, "The presentation retry should be in flight before block completion");
            release();
            const saved = await finishAndCheck(page, sessionId);
            assert.equal(submits, 1);
            assert.ok(Math.abs(submitTime - submittedAt) < 20);
            assert.equal(saved.events.filter(e => e.eventType === "record_presented").length, 1);
            assert.equal(saved.events.filter(e => e.eventType === "record_submitted").length, 1);
        } finally { release(); await context.close(); }
        console.log("PASS rapid submits and timeout preserve a pending retry and the original submission time");
    }
} finally { await browser.close(); }
