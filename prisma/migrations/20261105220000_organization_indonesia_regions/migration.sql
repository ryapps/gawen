ALTER TABLE "Organization"
ADD COLUMN "provinceCode" TEXT,
ADD COLUMN "provinceName" TEXT,
ADD COLUMN "regencyCode" TEXT,
ADD COLUMN "regencyName" TEXT,
ADD COLUMN "districtCode" TEXT,
ADD COLUMN "districtName" TEXT,
ADD COLUMN "villageCode" TEXT,
ADD COLUMN "villageName" TEXT;

UPDATE "Organization"
SET
    "provinceName" = NULLIF(BTRIM("province"), ''),
    "regencyName" = NULLIF(BTRIM("city"), '');
