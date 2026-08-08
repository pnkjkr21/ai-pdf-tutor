import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PdfStorage, StoredPdf } from "./storage";

function resolveStorageRoot(): string {
  const configured = process.env.PDF_STORAGE_PATH ?? "./storage/pdfs";
  return path.isAbsolute(configured)
    ? configured
    : path.join(process.cwd(), configured);
}

function sanitizeFileName(originalName: string): string {
  const base = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

/**
 * Local filesystem PdfStorage for MVP.
 * Paths stored in Postgres are relative to PDF_STORAGE_PATH.
 */
export class LocalPdfStorage implements PdfStorage {
  private readonly root: string;

  constructor(root = resolveStorageRoot()) {
    this.root = root;
  }

  async save(params: {
    lessonId: string;
    originalName: string;
    bytes: Buffer;
  }): Promise<StoredPdf> {
    if (!params.bytes.length) {
      throw new Error("Cannot store empty PDF buffer");
    }
    if (!params.lessonId.trim()) {
      throw new Error("lessonId is required");
    }

    const safeName = sanitizeFileName(params.originalName);
    const relativePath = path.join(params.lessonId, safeName);
    const absolutePath = path.join(this.root, relativePath);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, params.bytes);

    return {
      storagePath: relativePath,
      byteSize: params.bytes.byteLength,
    };
  }

  async read(storagePath: string): Promise<Buffer> {
    const absolutePath = this.resolveSafe(storagePath);
    return readFile(absolutePath);
  }

  async deleteLessonFiles(lessonId: string): Promise<void> {
    // This is a recursive delete, so validate harder than resolveSafe alone:
    // "a/b" is relative, has no "..", and resolves inside the root, yet would
    // wipe a nested tree. cuids are [a-z0-9]+, so this costs nothing.
    if (!/^[A-Za-z0-9_-]+$/.test(lessonId)) {
      throw new Error("Invalid lessonId");
    }

    const directory = this.resolveSafe(lessonId);
    if (path.resolve(directory) === path.resolve(this.root)) {
      throw new Error("Refusing to delete storage root");
    }

    // force: true makes a missing directory a no-op (idempotent).
    await rm(directory, { recursive: true, force: true });
  }

  /** Prevent path traversal outside the storage root. */
  private resolveSafe(storagePath: string): string {
    if (!storagePath || path.isAbsolute(storagePath)) {
      throw new Error("Invalid storage path");
    }
    if (storagePath.includes("..")) {
      throw new Error("Invalid storage path");
    }
    const absolutePath = path.join(this.root, storagePath);
    const normalizedRoot = path.resolve(this.root);
    const normalizedTarget = path.resolve(absolutePath);
    if (
      normalizedTarget !== normalizedRoot &&
      !normalizedTarget.startsWith(normalizedRoot + path.sep)
    ) {
      throw new Error("Invalid storage path");
    }
    return absolutePath;
  }
}

/** Default singleton for server code. */
export const localPdfStorage = new LocalPdfStorage();
