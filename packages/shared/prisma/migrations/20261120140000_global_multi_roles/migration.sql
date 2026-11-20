-- Collapse per-environment assignments into global role memberships
-- (one row per user+role, environment = '*').

CREATE TABLE "role_assignments_new" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT '*',
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_assignments_new_pkey" PRIMARY KEY ("id")
);

INSERT INTO "role_assignments_new" ("id", "userId", "roleId", "environment", "assignedById", "createdAt", "updatedAt")
SELECT DISTINCT ON ("userId", "roleId")
  "id", "userId", "roleId", '*', "assignedById", "createdAt", "updatedAt"
FROM "RoleAssignment"
ORDER BY "userId", "roleId", "updatedAt" DESC;

DROP TABLE "RoleAssignment";

ALTER TABLE "role_assignments_new" RENAME TO "RoleAssignment";

CREATE UNIQUE INDEX "RoleAssignment_userId_roleId_key" ON "RoleAssignment"("userId", "roleId");
CREATE INDEX "RoleAssignment_roleId_idx" ON "RoleAssignment"("roleId");

ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
