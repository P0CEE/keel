-- ADR 0013: the few scans across households (daily advance, schedulers) go
-- through SECURITY DEFINER functions that return ids only. The job then opens
-- one scoped transaction per household.
CREATE FUNCTION keel_household_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT id FROM households ORDER BY id $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION keel_household_ids() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION keel_household_ids() TO keel_app;
