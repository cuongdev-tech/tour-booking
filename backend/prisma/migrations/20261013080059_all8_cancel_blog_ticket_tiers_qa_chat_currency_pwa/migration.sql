-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "checkedInAt" TIMESTAMP(3),
ADD COLUMN     "checkedInBy" TEXT,
ADD COLUMN     "comboGroup" TEXT,
ADD COLUMN     "comboId" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'VND',
ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "privateSurcharge" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ticketSignature" TEXT,
ADD COLUMN     "vatAddress" TEXT,
ADD COLUMN     "vatAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vatEmail" TEXT,
ADD COLUMN     "vatName" TEXT,
ADD COLUMN     "vatTaxCode" TEXT;

-- AlterTable
ALTER TABLE "Tour" ADD COLUMN     "priceTiers" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "privateAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "privateSurcharge" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Combo" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tourIds" JSONB NOT NULL DEFAULT '[]',
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "status" "TourStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Combo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "cover" TEXT,
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "tourIds" JSONB NOT NULL DEFAULT '[]',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourQuestion" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TourQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingMessage" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckInLog" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'QR',
    "by" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckInLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Combo_slug_key" ON "Combo"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");

-- CreateIndex
CREATE INDEX "Post_status_idx" ON "Post"("status");

-- CreateIndex
CREATE INDEX "TourQuestion_tourId_idx" ON "TourQuestion"("tourId");

-- CreateIndex
CREATE INDEX "TourQuestion_userId_idx" ON "TourQuestion"("userId");

-- CreateIndex
CREATE INDEX "BookingMessage_bookingId_idx" ON "BookingMessage"("bookingId");

-- CreateIndex
CREATE INDEX "BookingMessage_senderId_idx" ON "BookingMessage"("senderId");

-- CreateIndex
CREATE INDEX "CheckInLog_bookingId_idx" ON "CheckInLog"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "Booking_comboGroup_idx" ON "Booking"("comboGroup");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourQuestion" ADD CONSTRAINT "TourQuestion_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourQuestion" ADD CONSTRAINT "TourQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingMessage" ADD CONSTRAINT "BookingMessage_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingMessage" ADD CONSTRAINT "BookingMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInLog" ADD CONSTRAINT "CheckInLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
