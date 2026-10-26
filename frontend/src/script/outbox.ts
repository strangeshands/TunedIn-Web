import type { TaskEvent } from "../../../shared/types";

export type EventCommand = {
    kind: "event";
    event: Omit<TaskEvent, "sequence">;
};
export type SubmissionCommand = {
    kind: "submission";
    blockNumber: number;
    attemptId: string;
    recordId: string;
    values: Record<string, string>;
    clientTimeMs: number;
};
export type OutboxEntry = {
    position?: number;
    id: string;
    sessionId: string;
    command: EventCommand | SubmissionCommand;
};

let connection: Promise<IDBDatabase> | undefined;
function database() {
    return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("tuned-in-outbox-v1", 1);
        request.onupgradeneeded = () => {
            const entries = request.result.createObjectStore("commands", { keyPath: "position", autoIncrement: true });
            entries.createIndex("id", "id", { unique: true });
            entries.createIndex("sessionId", "sessionId");
        };
        request.onsuccess = () => {
            request.result.onversionchange = () => { request.result.close(); connection = undefined; };
            resolve(request.result);
        };
        request.onerror = () => { connection = undefined; reject(request.error); };
        request.onblocked = () => { connection = undefined; reject(new Error("Close other study tabs to open event storage.")); };
    });
}

// Resolve on transaction completion, not request success: the browser must commit first.
async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await database();
    return new Promise<T>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
            tx = db.transaction("commands", mode, { durability: "strict" });
            const request = operation(tx.objectStore("commands"));
            tx.oncomplete = () => resolve(request.result);
            tx.onabort = () => reject(tx.error ?? new Error("Browser event storage transaction aborted."));
            tx.onerror = () => reject(tx.error ?? new Error("Browser event storage failed."));
        } catch (error) { reject(error); }
    });
}

export async function persistCommand(entry: OutboxEntry) {
    entry.position = await transaction("readwrite", store => store.add(entry)) as number;
}
export async function pendingCommands(sessionId: string): Promise<OutboxEntry[]> {
    return transaction("readonly", store => store.index("sessionId").getAll(sessionId));
}
export async function removeCommand(position: number) {
    await transaction("readwrite", store => store.delete(position));
}
export async function requestPersistentStorage() {
    // A denied persistence request must not prevent normal IndexedDB use.
    try { await navigator.storage?.persist?.(); } catch { /* Browser policy may deny this. */ }
}
