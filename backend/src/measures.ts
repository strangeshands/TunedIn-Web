import type { BlockMeasures, Session, TaskEvent } from "../../shared/types.js";

type RecordTimeline = {
    presented?: number;
    firstKey?: number;
    firstSubmission?: number;
    firstRejected?: boolean;
    validated?: number;
    submissions: number;
};

function median(values: number[]) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Every task measure is calculated on the backend from saved raw events.
export function calculateBlockMeasures(
    session: Session,
    blockNumber: number,
): BlockMeasures {
    const block = session.blocks.find((item) => item.number === blockNumber)!;
    const records = new Map<string, RecordTimeline>();
    const events = session.events
        .filter((event) => event.blockNumber === blockNumber)
        .sort((a, b) => a.clientTimeMs - b.clientTimeMs);
    for (const event of events) {
        const timeline = records.get(event.recordId) ?? { submissions: 0 };
        if (event.eventType === "record_presented")
            timeline.presented ??= event.clientTimeMs;
        if (event.eventType === "first_key")
            timeline.firstKey ??= event.clientTimeMs;
        if (event.eventType === "record_submitted") {
            timeline.submissions += 1;
            timeline.firstSubmission ??= event.clientTimeMs;
        }
        if (event.eventType === "validation_result") {
            const accepted = event.payload?.accepted === true;
            if (timeline.firstRejected === undefined)
                timeline.firstRejected = !accepted;
            if (accepted) timeline.validated ??= event.clientTimeMs;
        }
        records.set(event.recordId, timeline);
    }
    const all = [...records.values()];
    const submitted = all.filter(
        (record) =>
            record.firstSubmission !== undefined &&
            record.firstRejected !== undefined,
    );
    const valid = all.filter((record) => record.validated !== undefined);
    const il = submitted.flatMap((record) =>
        record.presented !== undefined && record.firstKey !== undefined
            ? [record.firstKey - record.presented]
            : [],
    );
    const fped = submitted.flatMap((record) =>
        record.firstKey !== undefined && record.firstSubmission !== undefined
            ? [record.firstSubmission - record.firstKey]
            : [],
    );
    const ttsv = valid.flatMap((record) =>
        record.presented !== undefined
            ? [record.validated! - record.presented]
            : [],
    );
    const rejected = submitted.filter((record) => record.firstRejected).length;
    const durationSeconds = block.durationSeconds ?? 0;
    const correctionCycles = all.reduce(
        (total, record) => total + Math.max(0, record.submissions - 1),
        0,
    );
    return {
        block: blockNumber,
        condition: block.condition,
        durationSeconds,
        recordsPresented: all.length,
        validatedRecords: valid.length,
        validatedRecordThroughput: durationSeconds
            ? valid.length / (durationSeconds / 60)
            : 0,
        medianInitiationLatencyMs: median(il),
        medianFirstPassEntryDurationMs: median(fped),
        firstPassRecordErrorRate: submitted.length
            ? rejected / submitted.length
            : null,
        firstPassRecordAccuracy: submitted.length
            ? (submitted.length - rejected) / submitted.length
            : null,
        medianTimeToSuccessfulValidationMs: median(ttsv),
        correctionCycles,
        correctionCyclesPerValidatedRecord: valid.length
            ? correctionCycles / valid.length
            : null,
    };
}
