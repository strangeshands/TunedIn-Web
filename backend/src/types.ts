export type Condition = "No music" | "Static music" | "Adaptive music";
export type OrderId = "A" | "B" | "C";

export type EventType =
  | "record_presented"
  | "first_key"
  | "record_submitted"
  | "validation_result";

export type TaskEvent = {
  blockNumber: number;
  recordId: string;
  eventType: EventType;
  clientTimeMs: number;
  payload?: Record<string, unknown>;
  receivedAt?: string;
};

export type Block = {
  block: number;
  condition: Condition;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
};

export type Session = {
  id: string;
  participantId: string;
  orderId: OrderId;
  conditionOrder: Condition[];
  createdAt: string;
  updatedAt: string;
  blocks: Map<number, Block>;
  events: TaskEvent[];
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
