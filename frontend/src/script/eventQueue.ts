import type { TaskEvent } from "../../../shared/types";
import { sendTaskEvent } from "./api";

type QueuedEvent = {
    event: Omit<TaskEvent, "sequence">;
    attempt: Promise<void> | null;
};

/**
 * Retains an event until the backend confirms it. Failed requests stay queued
 * and `flush` retries them before a block is allowed to close.
 */
export class EventQueue {
    private sequence = 0;
    private pending = new Map<number, QueuedEvent>();

    constructor(private readonly sessionId: string) {}

    send(event: Omit<TaskEvent, "sequence">) {
        this.sequence += 1;
        const item: QueuedEvent = { event, attempt: null };
        this.pending.set(this.sequence, item);
        // A later flush retries failures; callers should not lose an event just
        // because a background request briefly failed.
        return this.deliver(this.sequence, item).catch(() => undefined);
    }

    async flush() {
        const deliveries = [...this.pending.entries()].map(([id, item]) =>
            this.deliver(id, item),
        );
        const results = await Promise.allSettled(deliveries);
        const failed = results.find(
            (result): result is PromiseRejectedResult =>
                result.status === "rejected",
        );
        if (failed) throw failed.reason;
    }

    get pendingCount() {
        return this.pending.size;
    }

    private deliver(id: number, item: QueuedEvent): Promise<void> {
        if (item.attempt) return item.attempt;
        item.attempt = sendTaskEvent(this.sessionId, item.event)
            .then(() => {
                this.pending.delete(id);
            })
            .finally(() => {
                item.attempt = null;
            });
        return item.attempt;
    }
}
