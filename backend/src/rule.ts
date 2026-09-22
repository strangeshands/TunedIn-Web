import type {
    AdaptiveState,
    MusicCatalogue,
    MusicDecision,
    MusicTrack,
    Session,
} from "../../shared/types.js";
import { config } from "./config.js";
import { calculateBlockMeasures } from "./measures.js";

type WindowMeasures = Pick<
    MusicDecision,
    | "recordCount"
    | "medianInitiationLatencyMs"
    | "medianFirstPassEntryDurationMs"
    | "firstPassRecordErrorRate"
>;

const median = (values: number[]) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
};

function measureWindow(
    session: Session,
    blockNumber: number,
    windowStartMs: number,
    windowEndMs: number,
): WindowMeasures {
    const timelines = new Map<
        string,
        {
            presented?: number;
            firstKey?: number;
            firstSubmission?: number;
            firstRejected?: boolean;
        }
    >();
    for (const event of session.events.filter(
        (item) => item.blockNumber === blockNumber,
    )) {
        const timeline = timelines.get(event.recordId) ?? {};
        if (event.eventType === "record_presented")
            timeline.presented ??= event.clientTimeMs;
        if (event.eventType === "first_key")
            timeline.firstKey ??= event.clientTimeMs;
        if (event.eventType === "record_submitted")
            timeline.firstSubmission ??= event.clientTimeMs;
        if (
            event.eventType === "validation_result" &&
            timeline.firstRejected === undefined
        )
            timeline.firstRejected = event.payload?.accepted !== true;
        timelines.set(event.recordId, timeline);
    }
    const submitted = [...timelines.values()].filter(
        (item) =>
            item.firstSubmission !== undefined &&
            item.firstSubmission >= windowStartMs &&
            item.firstSubmission <= windowEndMs,
    );
    const il = submitted.flatMap((item) =>
        item.presented !== undefined && item.firstKey !== undefined
            ? [item.firstKey - item.presented]
            : [],
    );
    const fped = submitted.flatMap((item) =>
        item.firstKey !== undefined && item.firstSubmission !== undefined
            ? [item.firstSubmission - item.firstKey]
            : [],
    );
    const rejected = submitted.filter(
        (item) => item.firstRejected === true,
    ).length;
    return {
        recordCount: submitted.length,
        medianInitiationLatencyMs: median(il),
        medianFirstPassEntryDurationMs: median(fped),
        firstPassRecordErrorRate: submitted.length
            ? rejected / submitted.length
            : null,
    };
}

function selectTrack(
    catalogue: MusicCatalogue,
    state: AdaptiveState,
    decisionNumber: number,
): MusicTrack | null {
    const options = state === "silent" ? [] : catalogue[state];
    return options.length ? options[decisionNumber % options.length] : null;
}

/**
 * Applies the Chapter Six-style performance rule. This is pure backend logic:
 * it selects a desired state and track but does not play any audio.
 */
export function evaluateAdaptiveRule(
    session: Session,
    blockNumber: number,
    windowEndMs: number,
    catalogue: MusicCatalogue,
): MusicDecision {
    const windowStartMs = Math.max(
        0,
        windowEndMs - config.adaptiveRules.rollingWindowSeconds * 1000,
    );
    const current = measureWindow(
        session,
        blockNumber,
        windowStartMs,
        windowEndMs,
    );
    const baseline = calculateBlockMeasures(session, 0);
    const previous = session.musicDecisions.at(-1);
    const previousState: AdaptiveState = previous?.selectedState ?? "baseline";
    const previousTrackId = previous?.selectedTrackId ?? null;
    let selectedState: AdaptiveState = previousState;
    let reason =
        "Kept the previous state while waiting for enough recent records.";

    if (
        current.recordCount >= config.adaptiveRules.minimumRecordCount &&
        baseline.medianInitiationLatencyMs !== null &&
        baseline.medianFirstPassEntryDurationMs !== null &&
        current.medianInitiationLatencyMs !== null &&
        current.medianFirstPassEntryDurationMs !== null &&
        current.firstPassRecordErrorRate !== null
    ) {
        const slow =
            current.medianInitiationLatencyMs >
                baseline.medianInitiationLatencyMs *
                    (1 + config.adaptiveRules.slowerThanBaselinePercent) ||
            current.medianFirstPassEntryDurationMs >
                baseline.medianFirstPassEntryDurationMs *
                    (1 + config.adaptiveRules.slowerThanBaselinePercent);
        const errorProne =
            current.firstPassRecordErrorRate >
            (baseline.firstPassRecordErrorRate ?? 0) +
                config.adaptiveRules.errorRateIncrease;
        const fast =
            current.medianInitiationLatencyMs <
                baseline.medianInitiationLatencyMs *
                    (1 - config.adaptiveRules.fasterThanBaselinePercent) &&
            current.medianFirstPassEntryDurationMs <
                baseline.medianFirstPassEntryDurationMs *
                    (1 - config.adaptiveRules.fasterThanBaselinePercent) &&
            !errorProne;
        if (slow || errorProne) {
            selectedState = "reduced";
            reason = slow
                ? "Recent speed was slower than the baseline threshold."
                : "Recent first-pass error rate exceeded the baseline threshold.";
        } else if (fast) {
            selectedState = "elevated";
            reason =
                "Recent speed was faster than the baseline threshold without increased errors.";
        } else {
            selectedState = "baseline";
            reason = "Recent performance remained within the baseline range.";
        }
    }

    const track = selectTrack(
        catalogue,
        selectedState,
        session.musicDecisions.length,
    );
    if (!track) {
        selectedState = "silent";
        reason +=
            " No suitable music file was available, so playback must remain silent.";
    }
    return {
        id: `decision-${session.musicDecisions.length + 1}`,
        blockNumber,
        windowStartMs,
        windowEndMs,
        ...current,
        baselineInitiationLatencyMs: baseline.medianInitiationLatencyMs,
        baselineFirstPassEntryDurationMs:
            baseline.medianFirstPassEntryDurationMs,
        previousState,
        selectedState,
        previousTrackId,
        selectedTrackId: track?.id ?? null,
        reason,
    };
}
