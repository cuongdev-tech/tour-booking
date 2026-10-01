-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "addons" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "addonsTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "adults" INTEGER,
ADD COLUMN     "children" INTEGER;

-- AlterTable
ALTER TABLE "BookingGuest" ADD COLUMN     "isChild" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "helpfulCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Tour" ADD COLUMN     "addons" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "childMaxAge" INTEGER,
ADD COLUMN     "childPrice" INTEGER,
ADD COLUMN     "freeCancelHours" INTEGER;

-- CreateTable
CREATE TABLE "ReviewVote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewVote_reviewId_idx" ON "ReviewVote"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewVote_userId_reviewId_key" ON "ReviewVote"("userId", "reviewId");

-- AddForeignKey
ALTER TABLE "ReviewVote" ADD CONSTRAINT "ReviewVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewVote" ADD CONSTRAINT "ReviewVote_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
