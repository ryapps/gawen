ALTER TABLE "Organization"
ADD COLUMN "setupCompletedAt" TIMESTAMP(3);

UPDATE "Organization"
SET "setupCompletedAt" = "updatedAt"
WHERE NULLIF(BTRIM("businessType"), '') IS NOT NULL;
