import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session } from "../../shared/types.js";
import { validateSession } from "./sessionValidation.js";

export type SessionLoadIssue = { file: string; error: string };

/** One process owns this repository. Different sessions can be written concurrently. */
export class SessionStore {
    readonly sessions = new Map<string, Session>();
    readonly loadIssues: SessionLoadIssue[] = [];
    private readonly pending = new Map<string, Promise<void>>();

    constructor(readonly directory: string) {}

    async load() {
        await mkdir(this.directory, { recursive: true });
        for (const file of (await readdir(this.directory)).filter(file => file.endsWith(".json"))) {
            try {
                const value: unknown = JSON.parse(await readFile(join(this.directory, file), "utf8"));
                validateSession(value);
                this.checkId(value.id);
                if (file !== `${value.id}.json`) throw new Error("Session ID does not match its filename.");
                this.sessions.set(value.id, value);
            } catch (error) {
                // Preserve the original file for researcher recovery. Never replace it with defaults.
                this.loadIssues.push({ file, error: error instanceof SyntaxError ? "Malformed JSON." : error instanceof Error ? error.message : String(error) });
            }
        }
    }

    save(session: Session): Promise<void> {
        this.checkId(session.id);
        session.updatedAt = new Date().toISOString();
        // Capture NOW, before yielding: later mutations must not change an already queued save.
        const snapshot = JSON.stringify(session, null, 2);
        const previous = this.pending.get(session.id) ?? Promise.resolve();
        const file = join(this.directory, `${session.id}.json`);
        const operation = previous.catch(() => undefined).then(async () => {
            await writeFile(`${file}.tmp`, snapshot, "utf8");
            await rename(`${file}.tmp`, file);
        });
        this.pending.set(session.id, operation);
        // Reserve new sessions immediately so concurrent create requests see them.
        this.sessions.set(session.id, session);
        const cleanup = () => {
            if (this.pending.get(session.id) === operation) this.pending.delete(session.id);
        };
        void operation.then(cleanup, cleanup);
        return operation;
    }

    private checkId(id: string) {
        if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Invalid session ID.");
    }
}
