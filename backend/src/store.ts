import { join } from "node:path";
import type { Session } from "../../shared/types.js";
import { root } from "./config.js";
import { SqliteStore, type Receipt } from "./sqliteStore.js";

export const dataDir = process.env.TUNED_IN_DATA_DIR ?? join(root, "backend/data");
export const store = new SqliteStore(dataDir);
await store.load();
export const sessions = store.sessions;
export const sessionLoadIssues = store.loadIssues;
for (const issue of sessionLoadIssues) console.error(`Skipped session file ${issue.file}: ${issue.error}. Original file preserved.`);

// A successful return means SQLite COMMIT completed with synchronous=FULL.
export function saveSession(session: Session, receipt?: Receipt): Promise<void> {
    store.commit(session, receipt);
    return Promise.resolve();
}
