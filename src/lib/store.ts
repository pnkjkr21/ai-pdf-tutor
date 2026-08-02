import type { SessionRecord } from "./types";

/**
 * In-memory session store (swap for Redis/Postgres in production).
 * Survives across hot reloads poorly — fine for local demo.
 */
const globalForStore = globalThis as unknown as {
  __pdfTutorSessions?: Map<string, SessionRecord>;
};

const sessions =
  globalForStore.__pdfTutorSessions ?? new Map<string, SessionRecord>();

if (!globalForStore.__pdfTutorSessions) {
  globalForStore.__pdfTutorSessions = sessions;
}

export function saveSession(session: SessionRecord): void {
  sessions.set(session.id, session);
}

export function getSession(id: string): SessionRecord | undefined {
  return sessions.get(id);
}

export function deleteSession(id: string): void {
  sessions.delete(id);
}
