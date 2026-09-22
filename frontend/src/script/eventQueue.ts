import type { TaskEvent } from "../../../shared/types";
import { sendTaskEvent } from "./api";

// Stores unsent raw events in the browser before requesting the backend.
// The backend is still the source of truth for measures and exports.
export class EventQueue {
    private sequence = 0;
    constructor(private readonly sessionId: string) {}

    async send(event: Omit<TaskEvent, "sequence">) {
        this.sequence += 1;
        return sendTaskEvent(this.sessionId, event);
    }
}
