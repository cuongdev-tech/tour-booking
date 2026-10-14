-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "holdExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "gatewayRef" TEXT,
ADD COLUMN     "webhookVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "bookingCode" TEXT NOT NULL,
    "amount" INTEGER,
    "gatewayRef" TEXT,
    "result" TEXT NOT NULL,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookEvent_bookingCode_idx" ON "WebhookEvent"("bookingCode");

-- CreateIndex
CREATE INDEX "WebhookEvent_createdAt_idx" ON "WebhookEvent"("createdAt");
