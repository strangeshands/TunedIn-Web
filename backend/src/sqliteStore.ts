import { mkdir, readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import type { Session, TaskEvent } from "../../shared/types.js";
import { validateSession } from "./sessionValidation.js";

export type Receipt = { requestId: string; request: string; response: string };
export const schema = `
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
 session_id TEXT NOT NULL REFERENCES sessions(id), event_id TEXT NOT NULL,
 sequence INTEGER NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)),
 event_json TEXT NOT NULL, PRIMARY KEY(session_id, event_id), UNIQUE(session_id, sequence)
);
CREATE TABLE IF NOT EXISTS submission_receipts (
 session_id TEXT NOT NULL REFERENCES sessions(id), request_id TEXT NOT NULL,
 request_json TEXT NOT NULL, response_json TEXT NOT NULL, PRIMARY KEY(session_id, request_id)
);
PRAGMA user_version = 1;
`;

/** SQLite is authoritative. JSON files are imported once and never rewritten. */
export class SqliteStore {
    readonly sessions = new Map<string, Session>();
    readonly loadIssues: { file: string; error: string }[] = [];
    private db!: DatabaseSync;
    constructor(readonly directory: string) {}

    async load() {
        await mkdir(this.directory, { recursive: true });
        this.db = new DatabaseSync(join(this.directory, "study.sqlite"));
        this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
        if (this.db.prepare("PRAGMA journal_mode").get()!.journal_mode !== "wal" ||
            this.db.prepare("PRAGMA synchronous").get()!.synchronous !== 2)
            throw new Error("SQLite durable journaling could not be enabled.");
        const version = this.db.prepare("PRAGMA user_version").get()!.user_version as number;
        if (version > 1) throw new Error("Study database is newer than this app. Use the matching app version.");
        this.db.exec(schema);
        // Database corruption is fatal: never silently fall back to stale JSON backups.
        for (const row of this.db.prepare("SELECT id, snapshot FROM sessions").all()) {
            const session = JSON.parse(row.snapshot as string) as Session;
            session.events = this.readEvents(row.id as string, true);
            validateSession(session);
            this.sessions.set(session.id, session);
        }
        for (const file of (await readdir(this.directory)).filter(file => file.endsWith(".json"))) {
            // Do not let a legacy backup replace an authoritative SQLite session.
            const id = file.slice(0, -5);
            if (this.sessions.has(id)) continue;
            try {
                const value: unknown = JSON.parse(await readFile(join(this.directory, file), "utf8"));
                validateSession(value);
                if (value.id !== id) throw new Error("Session ID does not match its filename.");
                this.commit(value);
            } catch (error) {
                this.loadIssues.push({ file, error: error instanceof SyntaxError ? "Malformed JSON." : error instanceof Error ? error.message : String(error) });
            }
        }
    }

    nextSequence(session: Session) {
        const row = this.db.prepare("SELECT COALESCE(MAX(sequence), 0) AS sequence FROM events WHERE session_id = ?").get(session.id)!;
        return session.events.reduce((max, event) => Math.max(max, event.sequence), row.sequence as number) + 1;
    }

    receipt(sessionId: string, requestId: string): Receipt | null {
        const row = this.db.prepare("SELECT request_json, response_json FROM submission_receipts WHERE session_id = ? AND request_id = ?").get(sessionId, requestId);
        return row ? { requestId, request: row.request_json as string, response: row.response_json as string } : null;
    }

    event(sessionId: string, eventId: string): TaskEvent | null {
        const row = this.db.prepare("SELECT event_json FROM events WHERE session_id = ? AND event_id = ?").get(sessionId, eventId);
        return row ? JSON.parse(row.event_json as string) : null;
    }

    auditEvents(sessionId: string) {
        return this.db.prepare("SELECT event_json, active FROM events WHERE session_id = ? ORDER BY sequence").all(sessionId)
            .map(row => ({ ...JSON.parse(row.event_json as string), includedInCurrentAttempt: row.active === 1 }));
    }

    private readEvents(id: string, active: boolean): TaskEvent[] {
        return this.db.prepare(`SELECT event_json FROM events WHERE session_id = ? ${active ? "AND active = 1" : ""} ORDER BY sequence`)
            .all(id).map(row => JSON.parse(row.event_json as string));
    }

    /** No await inside the transaction: event IDs, raw events, and receipts commit together. */
    commit(session: Session, receipt?: Receipt) {
        if (!/^[A-Za-z0-9_-]+$/.test(session.id)) throw new Error("Invalid session ID.");
        session.updatedAt = new Date().toISOString();
        for (const block of session.blocks) block.attemptId ??= `legacy-${block.number}-${block.startedAt}`;
        for (const event of session.events) {
            event.eventId ??= `${session.id}:legacy:${event.sequence}`;
            event.attemptId ??= session.blocks.find(block => block.number === event.blockNumber)?.attemptId;
        }
        const { events, ...metadata } = session;
        let transactionOpen = false;
        try {
            this.db.exec("BEGIN IMMEDIATE");
            transactionOpen = true;
            this.db.prepare("INSERT INTO sessions(id, snapshot) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET snapshot = excluded.snapshot")
                .run(session.id, JSON.stringify(metadata));
            // Append new raw events; existing event contents are immutable. Only attempt
            // membership changes when a researcher restarts an interrupted block.
            const existing = new Map(this.db.prepare("SELECT event_id, event_json, active FROM events WHERE session_id = ?")
                .all(session.id).map(row => [row.event_id as string, row]));
            const incomingIds = new Set(events.map(event => event.eventId!));
            const deactivate = this.db.prepare("UPDATE events SET active = 0 WHERE session_id = ? AND event_id = ?");
            for (const [id, row] of existing) {
                if (row.active === 1 && !incomingIds.has(id)) deactivate.run(session.id, id);
            }
            const insert = this.db.prepare("INSERT INTO events(session_id,event_id,sequence,active,event_json) VALUES(?,?,?,1,?)");
            for (const event of events) {
                const previous = existing.get(event.eventId!);
                const json = JSON.stringify(event);
                if (previous) {
                    if (previous.event_json !== json) throw new Error("An existing event ID cannot be changed.");
                    if (previous.active !== 1) throw new Error("An archived event cannot be added to a new attempt.");
                } else {
                    insert.run(session.id, event.eventId!, event.sequence, json);
                }
            }
            if (receipt) this.db.prepare("INSERT INTO submission_receipts(session_id,request_id,request_json,response_json) VALUES(?,?,?,?)")
                .run(session.id, receipt.requestId, receipt.request, receipt.response);
            this.db.exec("COMMIT");
            transactionOpen = false;
            this.sessions.set(session.id, session);
        } catch (error) {
            if (transactionOpen) this.db.exec("ROLLBACK");
            // Route handlers mutate live sessions. Restore committed state after a failed transaction.
            const saved = this.db.prepare("SELECT snapshot FROM sessions WHERE id = ?").get(session.id);
            if (saved) this.sessions.set(session.id, { ...JSON.parse(saved.snapshot as string), events: this.readEvents(session.id, true) });
            else this.sessions.delete(session.id);
            throw error;
        }
    }

    close() { this.db.close(); }
}
