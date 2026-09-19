export type Condition =
    | "No music"
    | "Static music"
    | "Adaptive music";

export type TaskEvent = {
    blockNumber: number;
    recordId: string;
    eventType:
        | "record_presented"
        | "first_key"
        | "record_submitted"
        | "validation_result";
    clientTimeMs: number;
    payload?: Record<string, unknown>;
};

export type BlockMeasures = {
    block: number;
    condition: string;
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

export type ParticipantResult = {
    id: string;
    participantId: string;
    orderId: string;
    conditionOrder: string[];
    createdAt: string;
    updatedAt: string;
    measures: BlockMeasures[];
};

const API_URL = "http://127.0.0.1:3001";

async function request<T>(
    path: string,
    options?: RequestInit,
): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options?.headers ?? {}),
        },
    });

    if (!response.ok) {
        const message = await response.text();
        throw new Error(message);
    }

    return response.json();
}

export function createSession(data: {
    participantId: string;
    orderId: string;
    conditionOrder: string[];
}) {
    return request<{ sessionId: string }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify(data),
    });
}

export function startApiBlock(
    sessionId: string,
    blockNumber: number,
    condition: Condition,
) {
    return request<{ ok: boolean }>(
        `/api/sessions/${sessionId}/blocks/${blockNumber}/start`,
        {
            method: "POST",
            body: JSON.stringify({
                condition,
                startedAt: new Date().toISOString(),
            }),
        },
    );
}

export function sendTaskEvent(
    sessionId: string,
    event: TaskEvent,
) {
    return request<{ saved: number }>(
        `/api/sessions/${sessionId}/events`,
        {
            method: "POST",
            body: JSON.stringify({
                events: [event],
            }),
        },
    );
}

export function finishApiBlock(
    sessionId: string,
    blockNumber: number,
    durationSeconds: number,
) {
    return request<{
        ok: boolean;
        measures: BlockMeasures;
    }>(
        `/api/sessions/${sessionId}/blocks/${blockNumber}/finish`,
        {
            method: "POST",
            body: JSON.stringify({
                endedAt: new Date().toISOString(),
                durationSeconds,
            }),
        },
    );
}

export function getParticipantResult(
    participantId: string,
) {
    return request<ParticipantResult>(
        `/api/participants/${encodeURIComponent(participantId)}`,
    );
}