export type Condition = "No music" | "Static music" | "Adaptive music";
export type OrderId = "A" | "B" | "C";
export type Stage =
    | "participant"
    | "baseline"
    | "audio-check"
    | "block-intro"
    | "task"
    | "block-results"
    | "complete";
export type MusicClass = "baseline" | "reduced" | "elevated";

/** One audio file that the backend has found in the project's music folder. */
export type MusicTrack = {
    id: string;
    musicClass: MusicClass;
    relativeFilePath: string;
};

/** Empty arrays are valid: the study must still run without music files. */
export type MusicCatalogue = Record<MusicClass, MusicTrack[]>;
export type AdaptiveState = MusicClass | "silent";

export type MusicDecision = {
    id: string;
    blockNumber: number;
    windowStartMs: number;
    windowEndMs: number;
    recordCount: number;
    medianInitiationLatencyMs: number | null;
    medianFirstPassEntryDurationMs: number | null;
    firstPassRecordErrorRate: number | null;
    baselineInitiationLatencyMs: number | null;
    baselineFirstPassEntryDurationMs: number | null;
    previousState: AdaptiveState;
    selectedState: AdaptiveState;
    previousTrackId: string | null;
    selectedTrackId: string | null;
    reason: string;
};

export type RecordValues = {
    recordCode: string;
    batchCode: string;
    quantity: string;
};
export type SourceRecord = RecordValues & { id: string };
export type EventType =
    | "record_presented"
    | "first_key"
    | "record_submitted"
    | "validation_result";
export type TaskEvent = {
    sequence: number;
    blockNumber: number;
    recordId: string;
    eventType: EventType;
    clientTimeMs: number;
    payload?: Record<string, unknown>;
};

export type BlockMeasures = {
    block: number;
    condition: Condition;
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

export type Session = {
    id: string;
    participantId: string;
    orderId: OrderId;
    conditionOrder: Condition[];
    createdAt: string;
    updatedAt: string;
    configVersion: string;
    taskVersion: string;
    audioIntegration: "rule-engine";
    comfortCheckCompletedAt: string | null;
    blocks: Block[];
    events: TaskEvent[];
    musicTracks: MusicTrack[];
    musicDecisions: MusicDecision[];
};
export type Block = {
    number: number;
    condition: Condition;
    startedAt: string;
    endedAt: string | null;
    durationSeconds: number | null;
};
