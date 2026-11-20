-- Seed built-in roles so the first OAuth sign-in can become Admin after migrate deploy.
-- Idempotent: safe to re-run on databases that already ran prisma db seed.
INSERT INTO "Role" ("id", "name", "description", "createdAt")
VALUES
  ('clroleviewer000000000001', 'Viewer', 'Can view runs and plans in assigned environments.', CURRENT_TIMESTAMP),
  ('clroleplanner00000000001', 'Planner', 'Can run plans on lower environments (dev, qa, uat).', CURRENT_TIMESTAMP),
  ('clroleapplier00000000001', 'Applier', 'Can plan everywhere and apply on non-prod environments.', CURRENT_TIMESTAMP),
  ('clroleadmin0000000000001', 'Admin', 'Full access: prod applies, destroys, approvals and user management.', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE SET
  "description" = EXCLUDED."description";
