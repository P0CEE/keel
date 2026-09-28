-- ADR 0013: the API and the worker act as keel_app, which owns nothing and
-- cannot bypass row-level security. The role running the migrations owns the
-- tables. keel_app is created without LOGIN: a deployment either grants it
-- LOGIN with a password, or connects as a login role that `withScope` drops
-- to keel_app for each transaction.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'keel_app') THEN
    CREATE ROLE keel_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;--> statement-breakpoint
GRANT keel_app TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO keel_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO keel_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO keel_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO keel_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO keel_app;--> statement-breakpoint
-- The scope of the current transaction, set by withScope with
-- set_config(..., true). A custom setting reads as '' once a transaction that
-- set it has ended, hence NULLIF: outside a scope both return NULL, and a
-- policy comparing against NULL matches no row.
CREATE FUNCTION keel_current_household() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.household_id', true), '')::uuid $$;--> statement-breakpoint
CREATE FUNCTION keel_current_member() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '') $$;
