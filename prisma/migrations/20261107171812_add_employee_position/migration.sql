-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "position" TEXT;

-- Backfill employee records for existing active employee memberships.
INSERT INTO "Employee" (
    "id",
    "organizationId",
    "userId",
    "employeeCode",
    "fullName",
    "phone",
    "status",
    "hiredAt",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    membership."organizationId",
    membership."userId",
    'EMP-' || upper(replace(gen_random_uuid()::text, '-', '')),
    app_user."name",
    app_user."phone",
    'ACTIVE',
    membership."createdAt"::date,
    membership."createdAt",
    CURRENT_TIMESTAMP
FROM "OrganizationMembership" AS membership
JOIN "User" AS app_user ON app_user."id" = membership."userId"
WHERE membership."role" = 'EMPLOYEE'
  AND NOT EXISTS (
      SELECT 1
      FROM "Employee" AS employee
      WHERE employee."organizationId" = membership."organizationId"
        AND employee."userId" = membership."userId"
  );
