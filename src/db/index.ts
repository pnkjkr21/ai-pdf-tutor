import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "ai-pdf-tutor.sqlite");

function resolveDbPath(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url === ":memory:") return url || DEFAULT_DB_PATH;
  if (url.startsWith("file:")) {
    return url.replace(/^file:/, "");
  }
  return url;
}

function createSqlite() {
  const dbPath = resolveDbPath();
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

const globalForDb = globalThis as unknown as {
  __pdfTutorSqlite?: Database.Database;
  __pdfTutorDb?: ReturnType<typeof drizzle<typeof schema>>;
  __pdfTutorMigrated?: boolean;
};

const sqlite = globalForDb.__pdfTutorSqlite ?? createSqlite();
const db = globalForDb.__pdfTutorDb ?? drizzle(sqlite, { schema });

if (!globalForDb.__pdfTutorMigrated) {
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  globalForDb.__pdfTutorMigrated = true;
}

if (process.env.NODE_ENV !== "production") {
  globalForDb.__pdfTutorSqlite = sqlite;
  globalForDb.__pdfTutorDb = db;
}

export type AppDatabase = typeof db;
export { db, sqlite, schema };
