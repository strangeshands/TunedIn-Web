import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BlockMeasures, Session, TaskEvent } from "./types.js";

const EXPORT_DIR = resolve("exports");
mkdirSync(EXPORT_DIR, { recursive: true });

function safeName(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "_");
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

// Thesis-aligned raw event format: append-friendly JSON Lines.
export function appendRawEvent(session: Session, event: TaskEvent) {
  const path = resolve(
    EXPORT_DIR,
    `${safeName(session.participantId)}_${session.id}_events.jsonl`,
  );

  appendFileSync(
    path,
    `${JSON.stringify({
      sessionId: session.id,
      participantId: session.participantId,
      ...event,
    })}\n`,
    "utf8",
  );
}

// Thesis-aligned processed data format: CSV.
export function writeMeasuresCsv(session: Session, measures: BlockMeasures[]) {
  const header = [
    "participant_id",
    "session_id",
    "order_id",
    "block",
    "condition",
    "duration_seconds",
    "records_presented",
    "validated_records",
    "validated_record_throughput",
    "median_initiation_latency_ms",
    "median_first_pass_entry_duration_ms",
    "first_pass_record_error_rate",
    "first_pass_record_accuracy",
    "median_time_to_successful_validation_ms",
    "correction_cycles",
    "correction_cycles_per_validated_record",
  ];

  const rows = measures.map((result) => [
    session.participantId,
    session.id,
    session.orderId,
    result.block,
    result.condition,
    result.durationSeconds,
    result.recordsPresented,
    result.validatedRecords,
    result.validatedRecordThroughput,
    result.medianInitiationLatencyMs,
    result.medianFirstPassEntryDurationMs,
    result.firstPassRecordErrorRate,
    result.firstPassRecordAccuracy,
    result.medianTimeToSuccessfulValidationMs,
    result.correctionCycles,
    result.correctionCyclesPerValidatedRecord,
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");

  const path = resolve(
    EXPORT_DIR,
    `${safeName(session.participantId)}_${session.id}_measures.csv`,
  );

  writeFileSync(path, `${csv}\n`, "utf8");
  return path;
}
