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
    audioIntegration: "deferred";
    comfortCheckCompletedAt: string | null;
    blocks: Block[];
    events: TaskEvent[];
};
export type Block = {
    number: number;
    condition: Condition;
    startedAt: string;
    endedAt: string | null;
    durationSeconds: number | null;
};
