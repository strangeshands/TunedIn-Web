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

function firstTrack(
    catalogue: MusicCatalogue,
    state: AdaptiveState,
): MusicTrack | null {
    const options = state === "silent" ? [] : catalogue[state];
    return options[0] ?? null;
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
    // Block 1 is the silent calibration reference.
    const baseline = calculateBlockMeasures(session, 1);
    const previous = session.musicDecisions
        .filter((item) => item.blockNumber === blockNumber)
        .at(-1);
    const previousState: AdaptiveState = previous?.selectedState ?? "baseline";
    // Adaptive blocks begin on the baseline track. Treat it as active before
    // the first decision, so a baseline result does not cause a false change.
    const initialTrack = firstTrack(catalogue, "baseline");
    const previousTrackId =
        previous?.selectedTrackId ?? initialTrack?.id ?? null;
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
        const reduced =
            current.medianInitiationLatencyMs >=
                baseline.medianInitiationLatencyMs * 1.2 ||
            current.medianFirstPassEntryDurationMs >=
                baseline.medianFirstPassEntryDurationMs * 1.2 ||
            current.firstPassRecordErrorRate > 0.15;

        const elevated =
            current.medianInitiationLatencyMs <=
                baseline.medianInitiationLatencyMs * 0.9 &&
            current.medianFirstPassEntryDurationMs <=
                baseline.medianFirstPassEntryDurationMs * 0.9 &&
            current.firstPassRecordErrorRate <= 0.05;

        if (reduced) {
            selectedState = "reduced";
            reason = "Recent performance met a reduced-state trigger.";
        } else if (elevated) {
            selectedState = "elevated";
            reason = "Recent performance met every elevated-state trigger.";
        } else {
            selectedState = "baseline";
            reason =
                "Neither reduced nor elevated trigger conditions were met.";
        }
    }

    // Retain the current track while its state is retained. Select a new
    // manifest track only when the rule selects a different state.
    const track =
        selectedState === previousState
            ? (Object.values(catalogue)
                  .flat()
                  .find((item) => item.id === previousTrackId) ?? null)
            : firstTrack(catalogue, selectedState);
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
