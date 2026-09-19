import { db } from "./db.js";

type RawEvent = {
    block_number: number;
    record_id: string;
    event_type: string;
    client_time_ms: number;
    payload_json: string | null;
};

type RecordAccumulator = {
    presentedAt?: number;
    firstKeyAt?: number;
    firstSubmissionAt?: number;
    firstPassAccepted?: boolean;
    validatedAt?: number;
    submissionCount: number;
};

export type BlockMeasures = {
    block: number;
    condition: string;
    durationSeconds: number;
    recordsPresented: number;
    validatedRecords: number;
    validatedRecordThroughput: number;
    medianInitiationLatencyMs: number | null;
    medianFirstPassEntryDurationMs: number | null;
    firstPassRecordErrorRate: number | null;
    firstPassRecordAccuracy: number | null;
    medianTimeToSuccessfulValidationMs: number | null;
    correctionCycles: number;
    correctionCyclesPerValidatedRecord: number | null;
};

function median(values: number[]): number | null {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
}

function parsePayload(value: string | null): Record<string, unknown> {
    if (!value) return {};
    try {
        return JSON.parse(value) as Record<string, unknown>;
    } catch {
        return {};
    }
}

export function calculateSessionMeasures(sessionId: string): BlockMeasures[] {
    const blocks = db
        .prepare(
            `
    SELECT block_number, condition, started_at, ended_at, duration_seconds
    FROM blocks
    WHERE session_id = ?
    ORDER BY block_number
  `,
        )
        .all(sessionId) as Array<{
        block_number: number;
        condition: string;
        started_at: string;
        ended_at: string | null;
        duration_seconds: number | null;
    }>;

    const events = db
        .prepare(
            `
    SELECT block_number, record_id, event_type, client_time_ms, payload_json
    FROM events
    WHERE session_id = ?
    ORDER BY block_number, client_time_ms, id
  `,
        )
        .all(sessionId) as RawEvent[];

    return blocks.map((block) => {
        const byRecord = new Map<string, RecordAccumulator>();

        for (const event of events.filter(
            (e) => e.block_number === block.block_number,
        )) {
            const record = byRecord.get(event.record_id) ?? {
                submissionCount: 0,
            };

            if (
                event.event_type === "record_presented" &&
                record.presentedAt === undefined
            ) {
                record.presentedAt = event.client_time_ms;
            }

            if (
                event.event_type === "first_key" &&
                record.firstKeyAt === undefined
            ) {
                record.firstKeyAt = event.client_time_ms;
            }

            if (event.event_type === "record_submitted") {
                record.submissionCount += 1;
                if (record.firstSubmissionAt === undefined) {
                    record.firstSubmissionAt = event.client_time_ms;
                }
            }

            if (event.event_type === "validation_result") {
                const payload = parsePayload(event.payload_json);
                const accepted = payload.accepted === true;

                if (record.firstPassAccepted === undefined) {
                    record.firstPassAccepted = accepted;
                }

                if (accepted && record.validatedAt === undefined) {
                    record.validatedAt = event.client_time_ms;
                }
            }

            byRecord.set(event.record_id, record);
        }

        const records = [...byRecord.values()];
        const validated = records.filter((r) => r.validatedAt !== undefined);
        const firstPassKnown = records.filter(
            (r) => r.firstPassAccepted !== undefined,
        );
        const firstPassErrors = firstPassKnown.filter(
            (r) => r.firstPassAccepted === false,
        ).length;

        const initiationLatencies = records
            .filter(
                (r) =>
                    r.presentedAt !== undefined && r.firstKeyAt !== undefined,
            )
            .map((r) => r.firstKeyAt! - r.presentedAt!);

        const firstPassEntryDurations = records
            .filter(
                (r) =>
                    r.firstKeyAt !== undefined &&
                    r.firstSubmissionAt !== undefined,
            )
            .map((r) => r.firstSubmissionAt! - r.firstKeyAt!);

        const timesToValidation = validated
            .filter((r) => r.presentedAt !== undefined)
            .map((r) => r.validatedAt! - r.presentedAt!);

        // A correction cycle is each full-record submission after the first one.
        const correctionCycles = validated.reduce(
            (sum, r) => sum + Math.max(0, r.submissionCount - 1),
            0,
        );

        const durationSeconds =
            block.duration_seconds ??
            (block.ended_at
                ? (Date.parse(block.ended_at) - Date.parse(block.started_at)) /
                  1000
                : 0);

        const durationMinutes = durationSeconds / 60;

        return {
            block: block.block_number,
            condition: block.condition,
            durationSeconds,
            recordsPresented: records.length,
            validatedRecords: validated.length,
            validatedRecordThroughput:
                durationMinutes > 0 ? validated.length / durationMinutes : 0,
            medianInitiationLatencyMs: median(initiationLatencies),
            medianFirstPassEntryDurationMs: median(firstPassEntryDurations),
            firstPassRecordErrorRate:
                firstPassKnown.length > 0
                    ? firstPassErrors / firstPassKnown.length
                    : null,
            firstPassRecordAccuracy:
                firstPassKnown.length > 0
                    ? (firstPassKnown.length - firstPassErrors) /
                      firstPassKnown.length
                    : null,
            medianTimeToSuccessfulValidationMs: median(timesToValidation),
            correctionCycles,
            correctionCyclesPerValidatedRecord:
                validated.length > 0
                    ? correctionCycles / validated.length
                    : null,
        };
    });
}
