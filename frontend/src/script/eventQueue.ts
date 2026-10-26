import type { TaskEvent } from "../../../shared/types";
import { sendTaskEvent, submitRecord } from "./api";
import { pendingCommands, persistCommand, removeCommand, requestPersistentStorage, type OutboxEntry, type SubmissionCommand } from "./outbox";

type Pending = { entry: OutboxEntry; durable: Promise<void> };
type SubmissionResult = Awaited<ReturnType<typeof submitRecord>>;

/** Durable, ordered delivery. Only a matching backend acknowledgement removes a command. */
export class EventQueue {
    private pending = new Map<string, Pending>();
    private tail: Promise<unknown> = Promise.resolve();
    private completedSubmissions = new Map<string, SubmissionResult>();
    private ready: Promise<void>;

    constructor(private readonly sessionId: string, private readonly onFailure?: (error: unknown) => void) {
        this.ready = this.restore();
        // Keep failures observable by flush(), without an unhandled background rejection.
        void this.ready.catch(error => this.onFailure?.(error));
        void requestPersistentStorage();
    }

    send(event: Omit<TaskEvent, "sequence">) {
        const eventId = event.eventId ?? crypto.randomUUID();
        this.enqueue({ id: eventId, sessionId: this.sessionId, command: { kind: "event", event: { ...event, eventId } } });
        // Background delivery can fail; the durable command remains until a later flush succeeds.
        return this.flush().catch(error => this.onFailure?.(error));
    }

    async submit(command: Omit<SubmissionCommand, "kind">): Promise<SubmissionResult> {
        await this.ensureReady();
        // A retry must resolve the original submission, even if its acknowledgement was lost.
        const existing = [...this.pending.values()].find(({ entry }) => entry.command.kind === "submission" &&
            entry.command.blockNumber === command.blockNumber && entry.command.attemptId === command.attemptId &&
            entry.command.recordId === command.recordId);
        const id = existing?.entry.id ?? crypto.randomUUID();
        if (!existing) this.enqueue({ id, sessionId: this.sessionId, command: { kind: "submission", ...command } });
        const results = await this.schedule();
        const result = results.get(id) ?? this.completedSubmissions.get(id);
        if (!result) throw new Error("Submission acknowledgement was unavailable. Retry saving.");
        this.completedSubmissions.delete(id);
        return result;
    }

    async flush() { await this.schedule(); }

    get pendingCount() { return this.pending.size; }

    private restore() {
        return pendingCommands(this.sessionId).then(entries => {
            const fresh = this.pending;
            this.pending = new Map(entries.map(entry => [entry.id, { entry, durable: Promise.resolve() }]));
            for (const [id, item] of fresh) this.pending.set(id, item);
        });
    }

    private async ensureReady() {
        try { await this.ready; } catch {
            this.ready = this.restore();
            await this.ready;
        }
    }

    private enqueue(entry: OutboxEntry) {
        // A storage failure remains attached to this entry and prevents block completion.
        const durable = persistCommand(entry);
        void durable.catch(() => undefined);
        this.pending.set(entry.id, { entry, durable });
    }

    private schedule(): Promise<Map<string, SubmissionResult>> {
        const delivery = this.tail.catch(() => undefined).then(async () => {
            await this.ensureReady();
            const results = new Map<string, SubmissionResult>();
            for (const [id, item] of this.pending) {
                const { entry } = item;
                try { await item.durable; } catch {
                    // Retain the original timestamp/ID while allowing a temporary storage
                    // failure to recover without discarding the in-memory command.
                    item.durable = persistCommand(entry);
                    await item.durable;
                }
                if (entry.command.kind === "event") {
                    const acknowledgement = await sendTaskEvent(this.sessionId, entry.command.event);
                    if (!acknowledgement.acknowledgedEventIds.includes(id)) throw new Error("Backend did not acknowledge this event ID.");
                } else {
                    const command = entry.command;
                    const result = await submitRecord(this.sessionId, command.blockNumber, command.recordId,
                        command.values, command.clientTimeMs, id, command.attemptId);
                    if (result.requestId !== id) throw new Error("Backend did not acknowledge this submission ID.");
                    results.set(id, result);
                    this.completedSubmissions.set(id, result);
                }
                await removeCommand(entry.position!);
                this.pending.delete(id);
            }
            return results;
        });
        this.tail = delivery;
        return delivery;
    }
}
