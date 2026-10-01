-- One-off data backfill for flexible pricing (already applied locally).
UPDATE "Tour" SET "childPrice" = FLOOR("price" * 0.75)::int, "childMaxAge" = 11 WHERE "childPrice" IS NULL;
UPDATE "Tour" SET "addons" = '[{"id":"insurance-plus","name":"Bảo hiểm du lịch nâng cao","price":100000,"perPerson":true},{"id":"private-pickup","name":"Xe đón riêng tại khách sạn","price":500000,"perPerson":false}]' WHERE "addons" = '[]'::jsonb;
