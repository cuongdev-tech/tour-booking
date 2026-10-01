-- CreateTable
CREATE TABLE "TourDate" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "capacity" INTEGER NOT NULL,
    "booked" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TourDate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TourDate_tourId_idx" ON "TourDate"("tourId");

-- CreateIndex
CREATE UNIQUE INDEX "TourDate_tourId_date_key" ON "TourDate"("tourId", "date");

-- AddForeignKey
ALTER TABLE "TourDate" ADD CONSTRAINT "TourDate_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;
