/**
 * One-shot maintenance: populate PdfAsset.sha256 for rows uploaded before
 * duplicate detection existed. Without it, re-uploading an already-analyzed
 * PDF would not be detected and the feature would look broken.
 *
 *   node scripts/backfill-pdf-hashes.mjs
 *
 * Idempotent (only touches sha256 IS NULL rows), so it is safe to re-run.
 * A missing file is reported rather than fatal: that row keeps sha256 null and
 * therefore never blocks an upload, which is self-correcting.
 *
 * Plain .mjs so it runs under bare `node` — the "@/..." aliases used across
 * src/ do not resolve outside Next, hence the small storage-root duplication.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

/** Mirrors resolveStorageRoot() in src/lib/pdf/local-storage.ts. */
function resolveStorageRoot() {
  const configured = process.env.PDF_STORAGE_PATH ?? "./storage/pdfs";
  return path.isAbsolute(configured)
    ? configured
    : path.join(process.cwd(), configured);
}

const prisma = new PrismaClient();

try {
  const root = resolveStorageRoot();
  const assets = await prisma.pdfAsset.findMany({
    where: { sha256: null },
    select: { id: true, lessonId: true, storagePath: true },
  });

  let updated = 0;
  const missing = [];

  // Sequential on purpose: up to 50 x 10MB buffers must not be resident at once.
  for (const asset of assets) {
    try {
      const bytes = await readFile(path.join(root, asset.storagePath));
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      await prisma.pdfAsset.update({ where: { id: asset.id }, data: { sha256 } });
      console.log(`  ${sha256.slice(0, 16)}…  ${asset.storagePath}`);
      updated += 1;
    } catch (error) {
      missing.push(asset.lessonId);
      console.warn(`  SKIP ${asset.storagePath}: ${error.message}`);
    }
  }

  console.log(
    JSON.stringify({ scanned: assets.length, updated, missing }, null, 2),
  );
  process.exitCode = missing.length === 0 ? 0 : 1;
} finally {
  await prisma.$disconnect();
}
