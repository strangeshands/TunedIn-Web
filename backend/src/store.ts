import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Session } from "../../shared/types.js";
import { root } from "./config.js";

export const dataDir = join(root, "backend/data");
mkdirSync(dataDir, { recursive: true });
export const sessions = new Map<string, Session>();
for (const file of readdirSync(dataDir).filter(file => file.endsWith(".json"))) {
  const session = JSON.parse(readFileSync(join(dataDir, file), "utf8")) as Session;
  sessions.set(session.id, session);
}

// TODO(SQLite): Replace this JSON repository with SQLite transactions.
// Required tables and every saved field are in docs/sqlite-schema.sql and docs/DATA-DICTIONARY.md.
// Preserve session/event/block/measure/export behavior and unique (session_id, sequence) events.
export function saveSession(session: Session) {
  session.updatedAt = new Date().toISOString();
  const file = join(dataDir, `${session.id}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify(session, null, 2), "utf8");
  renameSync(`${file}.tmp`, file);
  sessions.set(session.id, session);
}
