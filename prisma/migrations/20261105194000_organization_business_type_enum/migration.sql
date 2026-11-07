CREATE TYPE "OrganizationBusinessType" AS ENUM (
    'FOOD_AND_BEVERAGE',
    'RETAIL',
    'SERVICES',
    'BEAUTY_AND_WELLNESS',
    'AUTOMOTIVE',
    'MANUFACTURING',
    'HOSPITALITY',
    'OTHER'
);

ALTER TABLE "Organization"
ALTER COLUMN "businessType" TYPE "OrganizationBusinessType"
USING (
    CASE
        WHEN "businessType" IS NULL THEN NULL
        WHEN UPPER(BTRIM("businessType")) IN (
            'FOOD_AND_BEVERAGE',
            'FOOD AND BEVERAGE',
            'FOOD & BEVERAGE',
            'F&B',
            'FNB',
            'FOOD',
            'BEVERAGE',
            'CAFE',
            'CAFÉ',
            'RESTAURANT',
            'RESTO',
            'CULINARY',
            'MAKANAN DAN MINUMAN',
            'MAKANAN & MINUMAN'
        ) THEN 'FOOD_AND_BEVERAGE'
        WHEN UPPER(BTRIM("businessType")) IN ('RETAIL', 'RETAIL / PERDAGANGAN', 'PERDAGANGAN')
            THEN 'RETAIL'
        WHEN UPPER(BTRIM("businessType")) IN ('SERVICES', 'SERVICE', 'JASA')
            THEN 'SERVICES'
        WHEN UPPER(BTRIM("businessType")) IN (
            'BEAUTY_AND_WELLNESS',
            'BEAUTY AND WELLNESS',
            'BEAUTY & WELLNESS',
            'BEAUTY',
            'WELLNESS',
            'KECANTIKAN',
            'KECANTIKAN DAN KEBUGARAN',
            'KECANTIKAN & KEBUGARAN'
        ) THEN 'BEAUTY_AND_WELLNESS'
        WHEN UPPER(BTRIM("businessType")) IN ('AUTOMOTIVE', 'AUTOMOTIF')
            THEN 'AUTOMOTIVE'
        WHEN UPPER(BTRIM("businessType")) IN ('MANUFACTURING', 'MANUFAKTUR')
            THEN 'MANUFACTURING'
        WHEN UPPER(BTRIM("businessType")) IN (
            'HOSPITALITY',
            'HOTEL',
            'HOSPITALITY / AKOMODASI',
            'PERHOTELAN',
            'PERHOTELAN DAN AKOMODASI',
            'PERHOTELAN & AKOMODASI'
        ) THEN 'HOSPITALITY'
        WHEN UPPER(BTRIM("businessType")) IN ('OTHER', 'LAINNYA')
            THEN 'OTHER'
        ELSE 'OTHER'
    END
)::"OrganizationBusinessType";
