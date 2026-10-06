export type Condition = "No music" | "Static music" | "Adaptive music";
/** Configured condition-order key, for example "A" or "Adaptive-only". */
export type OrderId = string;
export type StudyMode = "Formative" | "Pilot" | "Main";
export type StudyTiming = {
    practiceSeconds: number;
    baselineSeconds: number;
    blockSeconds: number;
};
export type Stage =
    | "participant"
    | "practice"
    | "baseline-intro"
    | "baseline"
    | "calibration-results"
    | "audio-check"
    | "block-intro"
    | "task"
    | "block-results"
    | "complete";
export type MusicClass = "baseline" | "reduced" | "elevated";

/** One manifest-approved audio file with fixed playback metadata. */
export type MusicTrack = {
    id: string;
    musicClass: MusicClass;
    relativeFilePath: string;
    composer: string;
    compositionId: string;
    rotationIndex: number;
    sourceSha256: string;
    integratedLoudnessLufs: number;
    truePeakDbtp: number;
    playbackGainDb: number;
};

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

/** Playback outcome reported by the browser after an adaptive decision. */
export type MusicTransition = {
    id: string;
    decisionId: string;
    blockNumber: number;
    previousTrackId: string | null;
    selectedTrackId: string | null;
    startedMs: number;
    completedMs: number;
    configuredCrossfadeMs: number;
    outcome: "playing" | "silent" | "failed";
    error: string | null;
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
    studyMode: StudyMode;
    timing: StudyTiming;
    orderId: OrderId;
    conditionOrder: Condition[];
    createdAt: string;
    updatedAt: string;
    configVersion: string;
    buildVersion: string;
    taskVersion: string;
    audioIntegration: "rule-engine";
    comfortCheckCompletedAt: string | null;
    blocks: Block[];
    events: TaskEvent[];
    musicTracks: MusicTrack[];
    musicDecisions: MusicDecision[];
    musicTransitions: MusicTransition[];
};
export type Block = {
    number: number;
    condition: Condition;
    startedAt: string;
    endedAt: string | null;
    durationSeconds: number | null;
    initialMusicTrackId: string | null;
};
