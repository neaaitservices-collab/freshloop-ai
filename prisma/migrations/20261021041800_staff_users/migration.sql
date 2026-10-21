CREATE TYPE "Role" AS ENUM ('ADMIN', 'STORE_MANAGER', 'RECEIVING_CLERK', 'FLOOR_STAFF', 'DELI_CHEF');

CREATE TABLE "staff_users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'FLOOR_STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_users_email_key" ON "staff_users"("email");
CREATE INDEX "staff_users_role_idx" ON "staff_users"("role");

INSERT INTO "staff_users" ("id", "name", "email", "position", "role", "createdAt", "updatedAt") VALUES
  ('staff-admin', 'Store Admin', 'admin@freshloop.test', 'Owner', 'ADMIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('staff-manager', 'Store Manager', 'manager@freshloop.test', 'Store manager', 'STORE_MANAGER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('staff-receiving', 'Receiving Clerk', 'receiving@freshloop.test', 'Back door', 'RECEIVING_CLERK', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('staff-floor', 'Floor Staff', 'floor@freshloop.test', 'Produce floor', 'FLOOR_STAFF', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('staff-kitchen', 'Deli Chef', 'kitchen@freshloop.test', 'Deli kitchen', 'DELI_CHEF', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
