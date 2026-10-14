-- CreateEnum
CREATE TYPE "LoyaltyType" AS ENUM ('EARN', 'REDEEM', 'REFERRAL_REWARD', 'REFERRAL_BONUS');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "loyaltyDiscount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loyaltyUsed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "applicableCategory" "TourCategory",
ADD COLUMN     "applicableTourIds" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "maxDiscount" INTEGER,
ADD COLUMN     "minGuests" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "verifiedTrip" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "videos" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Tour" ADD COLUMN     "departureHour" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT;

-- CreateTable
CREATE TABLE "LoyaltyTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "type" "LoyaltyType" NOT NULL,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_userId_idx" ON "LoyaltyTransaction"("userId");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_bookingId_idx" ON "LoyaltyTransaction"("bookingId");

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
