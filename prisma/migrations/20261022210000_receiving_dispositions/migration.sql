-- CreateTable
CREATE TABLE "receiving_dispositions" (
    "id" TEXT NOT NULL,
    "externalLogId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "casesReceived" DOUBLE PRECISION NOT NULL,
    "caseCost" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CREDIT',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "receiving_dispositions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receiving_dispositions_externalLogId_key" ON "receiving_dispositions"("externalLogId");

-- CreateIndex
CREATE INDEX "receiving_dispositions_status_idx" ON "receiving_dispositions"("status");

-- CreateIndex
CREATE INDEX "receiving_dispositions_reason_idx" ON "receiving_dispositions"("reason");
