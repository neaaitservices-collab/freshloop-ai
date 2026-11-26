-- staff_users.deactivated_at
-- NULL means the employee can sign in. Existing rows stay active; nothing is backfilled.
--
-- Deploy order: apply this migration in production BEFORE deploying app code
-- that reads or writes deactivated_at. Production migrate needs Nelson's
-- explicit yes and a Supabase backup. Do not apply it to a shared database
-- from a laptop, CI, or an agent.

ALTER TABLE "staff_users" ADD COLUMN "deactivated_at" TIMESTAMP(3);

CREATE INDEX "staff_users_deactivated_at_idx" ON "staff_users"("deactivated_at");
