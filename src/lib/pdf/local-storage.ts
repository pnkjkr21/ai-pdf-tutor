import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
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

  async delete(storagePath: string): Promise<void> {
    try {
      const absolutePath = this.resolveSafe(storagePath);
      await unlink(absolutePath);
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? (error as { code?: string }).code
          : undefined;
      if (code !== "ENOENT") {
        throw error;
      }
    }
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
