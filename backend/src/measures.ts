import type { BlockMeasures, Session } from "./types.js";

type RecordState = {
  presentedAt?: number;
  firstKeyAt?: number;
  firstSubmissionAt?: number;
  firstPassAccepted?: boolean;
  validatedAt?: number;
  submissionCount: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function calculateBlockMeasures(
  session: Session,
  blockNumber: number,
): BlockMeasures | null {
  const block = session.blocks.get(blockNumber);
  if (!block) return null;

  const records = new Map<string, RecordState>();
  const events = session.events
    .filter((event) => event.blockNumber === blockNumber)
    .sort((a, b) => a.clientTimeMs - b.clientTimeMs);

  for (const event of events) {
    const record = records.get(event.recordId) ?? { submissionCount: 0 };

    if (event.eventType === "record_presented" && record.presentedAt === undefined) {
      record.presentedAt = event.clientTimeMs;
    }

    if (event.eventType === "first_key" && record.firstKeyAt === undefined) {
      record.firstKeyAt = event.clientTimeMs;
    }

    if (event.eventType === "record_submitted") {
      record.submissionCount += 1;
      if (record.firstSubmissionAt === undefined) {
        record.firstSubmissionAt = event.clientTimeMs;
      }
    }

    if (event.eventType === "validation_result") {
      const accepted = event.payload?.accepted === true;

      if (record.firstPassAccepted === undefined) {
        record.firstPassAccepted = accepted;
      }

      if (accepted && record.validatedAt === undefined) {
        record.validatedAt = event.clientTimeMs;
      }
    }

    records.set(event.recordId, record);
  }

  const values = [...records.values()];
  const validated = values.filter((record) => record.validatedAt !== undefined);
  const firstPassKnown = values.filter(
    (record) => record.firstPassAccepted !== undefined,
  );

  const initiationLatencies = values
    .filter(
      (record) =>
        record.presentedAt !== undefined && record.firstKeyAt !== undefined,
    )
    .map((record) => record.firstKeyAt! - record.presentedAt!);

  const firstPassEntryDurations = values
    .filter(
      (record) =>
        record.firstKeyAt !== undefined &&
        record.firstSubmissionAt !== undefined,
    )
    .map((record) => record.firstSubmissionAt! - record.firstKeyAt!);

  const validationTimes = validated
    .filter((record) => record.presentedAt !== undefined)
    .map((record) => record.validatedAt! - record.presentedAt!);

  const firstPassErrors = firstPassKnown.filter(
    (record) => record.firstPassAccepted === false,
  ).length;

  const correctionCycles = validated.reduce(
    (sum, record) => sum + Math.max(0, record.submissionCount - 1),
    0,
  );

  const durationSeconds = block.durationSeconds ?? 0;
  const durationMinutes = durationSeconds / 60;

  return {
    block: block.block,
    condition: block.condition,
    durationSeconds,
    recordsPresented: values.length,
    validatedRecords: validated.length,
    validatedRecordThroughput:
      durationMinutes > 0 ? validated.length / durationMinutes : 0,
    medianInitiationLatencyMs: median(initiationLatencies),
    medianFirstPassEntryDurationMs: median(firstPassEntryDurations),
    firstPassRecordErrorRate:
      firstPassKnown.length > 0 ? firstPassErrors / firstPassKnown.length : null,
    firstPassRecordAccuracy:
      firstPassKnown.length > 0
        ? (firstPassKnown.length - firstPassErrors) / firstPassKnown.length
        : null,
    medianTimeToSuccessfulValidationMs: median(validationTimes),
    correctionCycles,
    correctionCyclesPerValidatedRecord:
      validated.length > 0 ? correctionCycles / validated.length : null,
  };
}

export function calculateSessionMeasures(session: Session): BlockMeasures[] {
  return [...session.blocks.keys()]
    .sort((a, b) => a - b)
    .map((blockNumber) => calculateBlockMeasures(session, blockNumber))
    .filter((result): result is BlockMeasures => result !== null);
}
