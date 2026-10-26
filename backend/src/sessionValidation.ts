/** Runtime checks for JSON read from disk; TypeScript types alone cannot validate it. */
type Check = (value: unknown, path: string) => void;
const fail = (path: string): never => { throw new Error(`Invalid session field: ${path}`); };
const object: Check = (value, path) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path);
};
const string: Check = (value, path) => { if (typeof value !== "string") fail(path); };
const number: Check = (value, path) => { if (typeof value !== "number" || !Number.isFinite(value)) fail(path); };
const nonnegative: Check = (value, path) => { number(value, path); if ((value as number) < 0) fail(path); };
const integer: Check = (value, path) => { nonnegative(value, path); if (!Number.isInteger(value)) fail(path); };
const date: Check = (value, path) => {
    string(value, path);
    if (!Number.isFinite(Date.parse(value as string))) fail(path);
};
const oneOf = (...values: unknown[]): Check => (value, path) => { if (!values.includes(value)) fail(path); };
const nullable = (check: Check): Check => (value, path) => { if (value !== null) check(value, path); };
const array = (check: Check): Check => (value, path) => {
    if (!Array.isArray(value)) fail(path);
    (value as unknown[]).forEach((item, index) => check(item, `${path}[${index}]`));
};
const shape = (fields: Record<string, Check>): Check => (value, path) => {
    object(value, path);
    for (const [key, check] of Object.entries(fields)) check((value as Record<string, unknown>)[key], `${path}.${key}`);
};
const condition = oneOf("No music", "Static music", "Adaptive music");
const state = oneOf("baseline", "reduced", "elevated", "silent");
const optional = (check: Check): Check => (value, path) => { if (value !== undefined) check(value, path); };
const session = shape({
    id: string, participantId: string, studyMode: oneOf("Formative", "Pilot", "Main"),
    timing: shape({ practiceSeconds: nonnegative, baselineSeconds: nonnegative, blockSeconds: nonnegative }),
    orderId: string, conditionOrder: array(condition), createdAt: date, updatedAt: date,
    configVersion: string, buildVersion: string, randomizationSeed: string, taskVersion: string,
    audioIntegration: oneOf("rule-engine"), comfortVolumePercent: nullable(nonnegative),
    comfortCheckCompletedAt: nullable(date), endedEarlyAt: optional(nullable(date)),
    interruptedBlocks: optional(array(shape({ attemptId: optional(string), number: integer, condition, startedAt: date, interruptedAt: date }))),
    blocks: array(shape({ attemptId: optional(string), number: integer, condition, startedAt: date, endedAt: nullable(date),
        durationSeconds: nullable(nonnegative), initialMusicTrackId: nullable(string) })),
    events: array(shape({ eventId: optional(string), attemptId: optional(string), sequence: integer, blockNumber: integer, recordId: string,
        eventType: oneOf("record_presented", "first_key", "record_submitted", "validation_result"),
        clientTimeMs: nonnegative, payload: optional(object) })),
    musicTracks: array(shape({ id: string, musicClass: oneOf("baseline", "reduced", "elevated"),
        relativeFilePath: string, composer: string, compositionId: string, rotationIndex: integer,
        sourceSha256: string, integratedLoudnessLufs: number, truePeakDbtp: number })),
    musicDecisions: array(shape({ id: string, blockNumber: integer, windowStartMs: nonnegative,
        windowEndMs: nonnegative, recordCount: integer, medianInitiationLatencyMs: nullable(number),
        medianFirstPassEntryDurationMs: nullable(number), firstPassRecordErrorRate: nullable(number),
        baselineInitiationLatencyMs: nullable(number), baselineFirstPassEntryDurationMs: nullable(number),
        previousState: state, selectedState: state, previousTrackId: nullable(string),
        selectedTrackId: nullable(string), reason: string })),
    musicTransitions: optional(array(shape({ id: string, decisionId: string, blockNumber: integer,
        previousTrackId: nullable(string), selectedTrackId: nullable(string), startedMs: nonnegative,
        completedMs: nonnegative, configuredCrossfadeMs: nonnegative,
        outcome: oneOf("playing", "silent", "failed"), error: nullable(string) }))),
});

export function validateSession(value: unknown): asserts value is import("../../shared/types.js").Session {
    session(value, "session");
    const saved = value as import("../../shared/types.js").Session;
    // Existing sessions may predate recovery and transition logging.
    saved.endedEarlyAt ??= null;
    saved.interruptedBlocks ??= [];
    saved.musicTransitions ??= [];
}
