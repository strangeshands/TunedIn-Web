import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Session } from "../../shared/types.js";
import { calculateBlockMeasures } from "./measures.js";
import { dataDir } from "./store.js";

const quote = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = (header: string[], rows: unknown[][]) =>
    [header, ...rows].map((row) => row.map(quote).join(",")).join("\n") + "\n";

// CSV and JSON Lines are generated only by the backend.
export function exportFiles(session: Session) {
    const measures = session.blocks.map((block) =>
        calculateBlockMeasures(session, block.number),
    );
    const records = new Map<
        string,
        {
            presented?: number;
            firstKey?: number;
            submitted?: number;
            rejected?: boolean;
            validated?: number;
            submissions: number;
        }
    >();
    for (const event of session.events) {
        const key = `${event.blockNumber}:${event.recordId}`;
        const row = records.get(key) ?? { submissions: 0 };
        if (event.eventType === "record_presented")
            row.presented ??= event.clientTimeMs;
        if (event.eventType === "first_key")
            row.firstKey ??= event.clientTimeMs;
        if (event.eventType === "record_submitted") {
            row.submissions++;
            row.submitted ??= event.clientTimeMs;
        }
        if (event.eventType === "validation_result") {
            row.rejected ??= event.payload?.accepted !== true;
            if (event.payload?.accepted === true)
                row.validated ??= event.clientTimeMs;
        }
        records.set(key, row);
    }
    const blockCsv = csv(
        [
            "participant_id",
            "session_id",
            "block",
            "condition",
            "duration_seconds",
            "records_presented",
            "validated_records",
            "validated_records_per_minute",
            "median_il_ms",
            "median_fped_ms",
            "first_pass_error_rate",
            "first_pass_accuracy",
            "median_ttsv_ms",
            "correction_cycles",
            "correction_cycles_per_validated_record",
        ],
        measures.map((item) => [
            session.participantId,
            session.id,
            item.block,
            item.condition,
            item.durationSeconds,
            item.recordsPresented,
            item.validatedRecords,
            item.validatedRecordThroughput,
            item.medianInitiationLatencyMs,
            item.medianFirstPassEntryDurationMs,
            item.firstPassRecordErrorRate,
            item.firstPassRecordAccuracy,
            item.medianTimeToSuccessfulValidationMs,
            item.correctionCycles,
            item.correctionCyclesPerValidatedRecord,
        ]),
    );
    const recordCsv = csv(
        [
            "participant_id",
            "session_id",
            "block",
            "record_id",
            "presented_ms",
            "first_key_ms",
            "first_submission_ms",
            "first_pass_rejected",
            "validated_ms",
            "il_ms",
            "fped_ms",
            "ttsv_ms",
            "submission_count",
        ],
        [...records.entries()].map(([key, row]) => {
            const [block, recordId] = key.split(":");
            return [
                session.participantId,
                session.id,
                block,
                recordId,
                row.presented,
                row.firstKey,
                row.submitted,
                row.rejected,
                row.validated,
                row.presented !== undefined && row.firstKey !== undefined
                    ? row.firstKey - row.presented
                    : null,
                row.firstKey !== undefined && row.submitted !== undefined
                    ? row.submitted - row.firstKey
                    : null,
                row.presented !== undefined && row.validated !== undefined
                    ? row.validated - row.presented
                    : null,
                row.submissions,
            ];
        }),
    );
    const eventsJsonl =
        session.events
            .map((event) =>
                JSON.stringify({
                    sessionId: session.id,
                    participantId: session.participantId,
                    ...event,
                }),
            )
            .join("\n") + "\n";
    // These empty, header-only files reserve the Chapter Six fields for the later
    // music integration. No playback or adaptation row is invented in this version.
    const decisionsCsv = csv(
        [
            "participant_id",
            "session_id",
            "block",
            "window_start_ms",
            "window_end_ms",
            "record_count",
            "median_il_ms",
            "median_fped_ms",
            "first_pass_error_rate",
            "baseline_il_ms",
            "baseline_fped_ms",
            "previous_state",
            "selected_state",
            "previous_track_id",
            "selected_track_id",
            "reason",
        ],
        [],
    );
    const transitionsCsv = csv(
        [
            "participant_id",
            "session_id",
            "block",
            "decision_id",
            "previous_track_id",
            "selected_track_id",
            "started_ms",
            "completed_ms",
            "configured_crossfade_ms",
            "outcome",
            "error",
        ],
        [],
    );
    const tracksCsv = csv(
        [
            "participant_id",
            "session_id",
            "track_id",
            "music_class",
            "relative_file_path",
            "classification_method",
            "classification_version",
            "loudness_checked",
            "file_sha256",
        ],
        [],
    );
    return {
        "blocks.csv": blockCsv,
        "records.csv": recordCsv,
        "events.jsonl": eventsJsonl,
        "decisions.csv": decisionsCsv,
        "transitions.csv": transitionsCsv,
        "tracks.csv": tracksCsv,
        "session.json": JSON.stringify({ ...session, measures }, null, 2),
    };
}
export function writeExports(session: Session) {
    const folder = join(dataDir, "exports", session.id);
    mkdirSync(folder, { recursive: true });
    for (const [name, contents] of Object.entries(exportFiles(session)))
        writeFileSync(join(folder, name), contents, "utf8");
}
