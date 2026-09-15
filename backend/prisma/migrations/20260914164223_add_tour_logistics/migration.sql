-- AlterTable
ALTER TABLE "Tour" ADD COLUMN     "departureLocation" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "excludedServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "includedServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "transportation" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Tour_departureLocation_idx" ON "Tour"("departureLocation");
