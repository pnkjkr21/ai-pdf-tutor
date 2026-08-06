import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "../src/db";

const configured =
  process.env.DATABASE_URL?.replace(/^file:/, "") ||
  path.join(process.cwd(), "data", "ai-pdf-tutor.sqlite");

if (configured !== ":memory:") {
  fs.mkdirSync(path.dirname(path.resolve(configured)), { recursive: true });
}

migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
console.log(`Migrations applied → ${configured}`);
sqlite.close();
