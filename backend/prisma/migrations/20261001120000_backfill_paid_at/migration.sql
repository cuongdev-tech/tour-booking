-- Backfill paidAt for captured payments created before paidAt was recorded,
-- so revenue totals and the monthly chart stay consistent. Approximation:
-- paidAt ~= last payment update (PAID is terminal except via cancellation,
-- which flips status to REFUNDED and is therefore untouched here).
UPDATE "Payment" SET "paidAt" = "updatedAt" WHERE "status" = 'PAID' AND "paidAt" IS NULL;
