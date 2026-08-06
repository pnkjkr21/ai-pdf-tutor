/**
 * Abstract PDF storage so MVP local disk can later swap to S3/R2/Supabase.
 */

export type StoredPdf = {
  /** Opaque storage key / relative path persisted in Postgres */
  storagePath: string;
  byteSize: number;
};

export type PdfStorage = {
  /**
   * Persist PDF bytes. Implementations must reject empty buffers.
   * @returns storage path to save on PdfAsset.storagePath
   */
  save(params: {
    lessonId: string;
    originalName: string;
    bytes: Buffer;
  }): Promise<StoredPdf>;

  /** Read previously stored PDF bytes by storage path. */
  read(storagePath: string): Promise<Buffer>;

  /** Delete stored object if present (idempotent). */
  delete(storagePath: string): Promise<void>;
};
