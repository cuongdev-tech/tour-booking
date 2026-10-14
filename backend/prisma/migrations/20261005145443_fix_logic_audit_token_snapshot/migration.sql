-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "adultUnitPrice" INTEGER,
ADD COLUMN     "childUnitPrice" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;
