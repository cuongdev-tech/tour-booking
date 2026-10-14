-- AlterTable
ALTER TABLE "TourDate" ADD COLUMN     "guideId" TEXT,
ADD COLUMN     "vehicleId" TEXT;

-- CreateTable
CREATE TABLE "AdminAction" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guide" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Bus',
    "seats" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAction_adminId_idx" ON "AdminAction"("adminId");

-- CreateIndex
CREATE INDEX "AdminAction_action_idx" ON "AdminAction"("action");

-- CreateIndex
CREATE INDEX "AdminAction_entityType_idx" ON "AdminAction"("entityType");

-- CreateIndex
CREATE INDEX "AdminAction_createdAt_idx" ON "AdminAction"("createdAt");

-- CreateIndex
CREATE INDEX "Guide_active_idx" ON "Guide"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plate_key" ON "Vehicle"("plate");

-- CreateIndex
CREATE INDEX "Vehicle_active_idx" ON "Vehicle"("active");

-- CreateIndex
CREATE INDEX "TourDate_guideId_idx" ON "TourDate"("guideId");

-- CreateIndex
CREATE INDEX "TourDate_vehicleId_idx" ON "TourDate"("vehicleId");

-- AddForeignKey
ALTER TABLE "TourDate" ADD CONSTRAINT "TourDate_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "Guide"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourDate" ADD CONSTRAINT "TourDate_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAction" ADD CONSTRAINT "AdminAction_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
