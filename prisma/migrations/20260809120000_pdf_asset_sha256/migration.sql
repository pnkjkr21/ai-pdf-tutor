-- AlterTable
ALTER TABLE "PdfAsset" ADD COLUMN "sha256" TEXT;

-- CreateIndex
CREATE INDEX "PdfAsset_sha256_idx" ON "PdfAsset"("sha256");
