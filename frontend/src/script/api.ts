import type {
    BlockMeasures,
    Condition,
    OrderId,
    SourceRecord,
    TaskEvent,
} from "../../../shared/types";

/**
 * Sends a request to the local backend API.
 *
 * If `body` is provided, it sends a POST request with JSON data.
 * If no `body` is provided, it sends a GET request.
 *
 * @typeParam T - The expected data type returned by the backend.
 * @param path - The API route, such as "/api/sessions".
 * @param body - Optional data sent to the backend.
 * @returns The backend response converted to the expected TypeScript type.
 * @throws An error when the backend responds with an unsuccessful status.
 */
async function request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(path, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        throw new Error((await response.json()).error ?? "Request failed");
    }

    return response.json() as Promise<T>;
}

/**
 * Creates a new participant session in the backend.
 *
 * The backend saves the participant ID, assigned order,
 * and condition order, then returns a unique session ID.
 *
 * @param data - Participant and condition-order information.
 * @returns The newly created session ID.
 */
export function createSession(data: {
    participantId: string;
    orderId: OrderId;
    conditionOrder: Condition[];
}) {
    return request<{ sessionId: string }>("/api/sessions", data);
}

/**
 * Starts a practice or experimental block in the backend.
 *
 * The backend creates the block and returns the first
 * fictional source record for the participant to enter.
 *
 * @param sessionId - The current participant session ID.
 * @param blockNumber - `0` for practice, then `1` to `3`
 * for the experimental blocks.
 * @param condition - The assigned condition for this block.
 * @returns The first source record for the block.
 */
export function startApiBlock(
    sessionId: string,
    blockNumber: number,
    condition: Condition,
) {
    return request<{ record: SourceRecord }>(
        `/api/sessions/${sessionId}/blocks/${blockNumber}/start`,
        { condition },
    );
}

/**
 * Saves one raw task-interaction event in the backend.
 *
 * Examples include record presentation and the participant's
 * first task-relevant character entry.
 *
 * The backend assigns the final event sequence number.
 *
 * @param sessionId - The current participant session ID.
 * @param event - The task event and its browser timestamp.
 * @returns The number of events saved by the backend.
 */
export function sendTaskEvent(
    sessionId: string,
    event: Omit<TaskEvent, "sequence">,
) {
    return request<{ saved: number }>(`/api/sessions/${sessionId}/events`, {
        events: [event],
    });
}

/**
 * Sends the participant's entered values to the backend
 * for validation against the current source record.
 *
 * The backend checks the values, saves the submission and
 * validation result, and returns incorrect fields. If correct,
 * it also returns the next source record.
 *
 * @param sessionId - The current participant session ID.
 * @param blockNumber - The current practice or experimental block.
 * @param recordId - The ID of the source record being submitted.
 * @param values - Values entered in the three form fields.
 * @param clientTimeMs - Browser `performance.now()` timestamp
 * when the participant submitted the record.
 * @returns The validation result and, when accepted, next record.
 */
export function submitRecord(
    sessionId: string,
    blockNumber: number,
    recordId: string,
    values: Record<string, string>,
    clientTimeMs: number,
) {
    return request<{
        accepted: boolean;
        incorrectFields: string[];
        nextRecord: SourceRecord | null;
    }>(`/api/sessions/${sessionId}/blocks/${blockNumber}/submit`, {
        recordId,
        values,
        clientTimeMs,
    });
}

/**
 * Finishes a practice or experimental block.
 *
 * The backend saves its duration, calculates the block's
 * measures, and writes the updated backend export files.
 *
 * @param sessionId - The current participant session ID.
 * @param blockNumber - The completed block number.
 * @param durationSeconds - Total block duration in seconds.
 * @returns Backend-calculated measures for the block.
 */
export function finishApiBlock(
    sessionId: string,
    blockNumber: number,
    durationSeconds: number,
) {
    return request<{ measures: BlockMeasures }>(
        `/api/sessions/${sessionId}/blocks/${blockNumber}/finish`,
        { durationSeconds },
    );
}

/**
 * Saves confirmation that the manual audio-comfort check
 * was completed before the timed experimental blocks begin.
 *
 * This does not play or measure audio.
 *
 * @param sessionId - The current participant session ID.
 * @returns Confirmation from the backend.
 */
export function confirmComfortCheck(sessionId: string) {
    return request<{ ok: true }>(
        `/api/sessions/${sessionId}/comfort-check`,
        {},
    );
}

/**
 * Creates the backend download address for an export file.
 *
 * @param sessionId - The current participant session ID.
 * @param file - Export filename, such as "blocks.csv".
 * @returns A relative backend download URL.
 */
export function exportUrl(sessionId: string, file: string) {
    return `/api/sessions/${sessionId}/export/${file}`;
}
