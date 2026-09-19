import type { Session } from "./types.js";

// Prototype storage only.
// This intentionally stays in memory for now while the study flow is being tested.
// SQLite can replace this module later without changing the frontend API.
export const sessions = new Map<string, Session>();
