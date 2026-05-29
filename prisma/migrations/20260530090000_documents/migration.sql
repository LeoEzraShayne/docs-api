-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('REQUIREMENTS', 'BASIC_DESIGN', 'DETAILED_DESIGN', 'UNIT_TEST', 'INTEGRATION_TEST');

-- CreateEnum
CREATE TYPE "DocumentSourceType" AS ENUM ('PROJECT', 'REQUIREMENTS_VERSION', 'BASIC_DESIGN_VERSION', 'DETAILED_DESIGN_VERSION', 'DIRECT_INPUT', 'PASTED_DESIGN');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "lastGenerateAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "quality" TEXT NOT NULL DEFAULT 'standard',
    "sourceType" "DocumentSourceType" NOT NULL,
    "sourceDocumentVersionId" TEXT,
    "inputJson" JSONB NOT NULL DEFAULT '{}',
    "selectedSheets" JSONB NOT NULL DEFAULT '[]',
    "extractedJson" JSONB NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "remainingGenerations" INTEGER NOT NULL DEFAULT 3,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_projectId_type_key" ON "Document"("projectId", "type");

-- CreateIndex
CREATE INDEX "Document_projectId_updatedAt_idx" ON "Document"("projectId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNo_key" ON "DocumentVersion"("documentId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_idempotencyKey_key" ON "DocumentVersion"("documentId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "DocumentVersion_sourceDocumentVersionId_idx" ON "DocumentVersion"("sourceDocumentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentGrant_documentId_key" ON "DocumentGrant"("documentId");

-- CreateIndex
CREATE INDEX "DocumentGrant_userId_expiresAt_idx" ON "DocumentGrant"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_sourceDocumentVersionId_fkey" FOREIGN KEY ("sourceDocumentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGrant" ADD CONSTRAINT "DocumentGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGrant" ADD CONSTRAINT "DocumentGrant_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
