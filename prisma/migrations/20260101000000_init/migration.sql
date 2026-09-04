-- CreateEnum
CREATE TYPE "DatasetStatus" AS ENUM ('UPLOADING', 'ANALYZING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "LogbookEntryType" AS ENUM ('ANALYSIS', 'INSIGHT', 'DECISION', 'RESEARCH');

-- CreateTable
CREATE TABLE "datasets" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "columns" JSONB NOT NULL,
    "status" "DatasetStatus" NOT NULL DEFAULT 'UPLOADING',
    "error" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_context" (
    "id" TEXT NOT NULL,
    "dataset_id" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "dataset_context_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logbook_entries" (
    "id" TEXT NOT NULL,
    "type" "LogbookEntryType" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence" JSONB,
    "datasetIds" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "logbook_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "datasets_table_name_key" ON "datasets"("table_name");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_context_dataset_id_key" ON "dataset_context"("dataset_id");

-- CreateIndex
CREATE INDEX "logbook_entries_created_at_idx" ON "logbook_entries"("created_at");

-- CreateIndex
CREATE INDEX "logbook_entries_type_idx" ON "logbook_entries"("type");

-- AddForeignKey
ALTER TABLE "dataset_context" ADD CONSTRAINT "dataset_context_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE CASCADE;
