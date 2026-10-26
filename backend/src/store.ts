import { join } from "node:path";
import type { Session } from "../../shared/types.js";
import { root } from "./config.js";
import { SessionStore } from "./sessionStore.js";

export const dataDir = join(root, "backend/data");
const store = new SessionStore(dataDir);
await store.load();
export const sessions = store.sessions;
export const sessionLoadIssues = store.loadIssues;
for (const issue of sessionLoadIssues) {
    console.error(`Skipped session file ${issue.file}: ${issue.error}. Original file preserved.`);
}

// TODO(SQLite): Replace this JSON repository with SQLite transactions.
export function saveSession(session: Session): Promise<void> {
    return store.save(session);
}
