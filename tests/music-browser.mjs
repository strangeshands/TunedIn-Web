// Use disposable servers/data only. PLAYWRIGHT_MODULE may point to an installed module.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const origin = process.env.TEST_ORIGIN;
if (!origin)
    throw new Error(
        "Set TEST_ORIGIN to a disposable frontend/backend environment.",
    );
const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
        : { channel: "chrome" }),
});
try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    async function post(path, data) {
        const response = await page.request.post(origin + path, { data });
        assert.ok(response.ok(), await response.text());
        return response.json();
    }
    const participantId = `MUSIC-CHECK-${randomUUID()}`;
    const { sessionId, baseline } = await post("/api/sessions", {
        participantId,
        studyMode: "Pilot",
        orderId: "B",
    });
    assert.equal(baseline.mode, "records");
    const start = await post(`/api/sessions/${sessionId}/blocks/1/start`, {
        condition: "No music",
    });
    let record = start.record;
    for (let index = 0; index < baseline.recordTarget; index++) {
        const time = 1000 + index * 100;
        await post(`/api/sessions/${sessionId}/events`, {
            events: [
                {
                    eventId: randomUUID(),
                    attemptId: start.attemptId,
                    blockNumber: 1,
                    recordId: record.id,
                    eventType: "record_presented",
                    clientTimeMs: time,
                },
                {
                    eventId: randomUUID(),
                    attemptId: start.attemptId,
                    blockNumber: 1,
                    recordId: record.id,
                    eventType: "first_key",
                    clientTimeMs: time + 10,
                },
            ],
        });
        const result = await post(
            `/api/sessions/${sessionId}/blocks/1/submit`,
            {
                requestId: randomUUID(),
                attemptId: start.attemptId,
                recordId: record.id,
                values: record,
                clientTimeMs: time + 30,
            },
        );
        assert.equal(result.accepted, true);
        record = result.nextRecord;
    }
    await page.goto(origin);
    await page
        .getByRole("textbox", { name: "Participant ID" })
        .fill(participantId);
    await page.getByRole("button", { name: "Recover saved session" }).click();
    await page.getByRole("button", { name: /Continue to audio check/ }).click();
    await page
        .getByText(
            "Use the test button to play the dedicated comfort-check recording.",
        )
        .waitFor();
    const comfort = page.waitForResponse((r) =>
        r.url().includes("/music/Audio-Check/B01.wav"),
    );
    await page
        .getByRole("button", { name: "Play test audio", exact: true })
        .click();
    assert.ok([200, 206].includes((await comfort).status()));
    await page
        .getByRole("button", { name: "Pause test audio", exact: true })
        .waitFor();
    await page
        .getByRole("button", { name: /Audio level is comfortable/ })
        .click();
    const staticAudio = page.waitForResponse((r) =>
        r.url().includes("/music/Baseline/B09.wav"),
    );
    await page.getByRole("button", { name: /Start Block 1/ }).click();
    assert.ok([200, 206].includes((await staticAudio).status()));
    await page.locator("form.panel").waitFor();
    const session = await (
        await page.request.get(
            `${origin}/api/sessions/${sessionId}/export/session.json`,
        )
    ).json();
    assert.equal(session.blocks.at(-1).initialMusicTrackId, "baseline/B09.wav");
    assert.equal(session.musicManifestVersion, "playback-bank-v2");
    assert.equal(session.musicTracks.length, 24);
    assert.ok(
        session.musicTracks.every(
            (track) =>
                track.musicClass !== "audio-check" &&
                track.composer &&
                track.compositionId &&
                track.performanceId,
        ),
    );
    const csvText = await (
        await page.request.get(
            `${origin}/api/sessions/${sessionId}/export/tracks.csv`,
        )
    ).text();
    const csvRows = csvText
        .trim()
        .split("\n")
        .map((line) =>
            [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((match) =>
                match[1].replaceAll('""', '"'),
            ),
        );
    const [headers, ...csvTracks] = csvRows;
    assert.equal(csvTracks.length, 24);
    for (const row of csvTracks) assert.equal(row.length, headers.length);
    const staticRow = csvTracks.find(
        (row) => row[headers.indexOf("track_id")] === "baseline/B09.wav",
    );
    assert.equal(staticRow[headers.indexOf("composer")], "Joseph Haydn");
    assert.equal(
        staticRow[headers.indexOf("composition_id")],
        "haydn-hob-xvi-20",
    );
    assert.ok(staticRow[headers.indexOf("work_movement")]);
    assert.ok(staticRow[headers.indexOf("source_wav_relative_path")]);
    console.log(
        "PASS actual comfort-check UI decodes/plays Audio-Check/B01.wav; Static block loads B09; comfort metadata stays outside study tracks.",
    );
} finally {
    await browser.close();
}
