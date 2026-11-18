-- Lock the public schema against the Supabase Data API roles.
--
-- FreshLoop talks to Postgres only through Prisma. DATABASE_URL and DIRECT_URL
-- use the pooler user `postgres.<project-ref>`, which is the `postgres` role.
-- That role owns the tables Prisma creates. On Supabase it also has BYPASSRLS
-- (migrations/db/migrations/10000000000000_demote-postgres.sql). Table owners
-- bypass row level security unless FORCE ROW LEVEL SECURITY is set, so this
-- migration does not FORCE it and does not add policies for anon or authenticated.
--
-- Only schema public is touched. auth, storage, realtime, and other schemas
-- are left alone.
--
-- anon and authenticated exist on Supabase and are absent on plain Postgres,
-- including GitHub Actions (role `ci`). Missing roles are skipped so
-- `prisma migrate deploy` still applies.

DO $$
DECLARE
  api_role text;
  grantor_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);

    -- Defaults for objects the migration runner creates. On Supabase the
    -- runner is postgres, so this is the same ACL as FOR ROLE postgres below.
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
      api_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
      api_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I',
      api_role
    );

    -- Default privileges are stored per grantor role. ALTER DEFAULT PRIVILEGES
    -- without FOR ROLE only changes the current user's entries.
    --
    -- Supabase's Data API auto-expose grants are FOR ROLE postgres
    -- (pg_default_acl.defaclrole = postgres). The initial schema also grants
    -- them FOR ROLE supabase_admin, which applies only to objects that role
    -- creates. Prisma migrates as postgres, so FOR ROLE postgres is the one
    -- that covers new Prisma tables. supabase_admin is revoked only when the
    -- current user may change that role (superuser); hosted postgres is not a
    -- superuser and cannot edit supabase_admin's defaults.
    -- Nested so pg_has_role is not called for a role that is not installed
    -- (plain Postgres has no supabase_admin; a missing role would error).
    FOREACH grantor_role IN ARRAY ARRAY['postgres', 'supabase_admin']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = grantor_role) THEN
        IF pg_has_role(current_user, grantor_role::name, 'MEMBER') THEN
          EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
            grantor_role,
            api_role
          );
          EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
            grantor_role,
            api_role
          );
          EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I',
            grantor_role,
            api_role
          );
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END
$$;

-- Postgres grants EXECUTE to PUBLIC on every new function. Revoking only anon
-- and authenticated leaves that PUBLIC grant, and both roles can still call the
-- function. This strips PUBLIC execute on functions that already exist in
-- public. It does not alter functions in other schemas. Functions owned by
-- another role produce a warning and keep their ACL when this runner cannot
-- revoke them (hosted postgres is not a superuser).
--
-- The built-in default for functions created later is still EXECUTE for PUBLIC.
-- Removing that default is global for the creating role, not limited to public,
-- so this migration does not change it.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      'public',
      table_name
    );
  END LOOP;
END
$$;
