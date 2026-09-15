-- AlterTable
ALTER TABLE "Tour" ADD COLUMN     "itinerary" JSONB NOT NULL DEFAULT '[]';
