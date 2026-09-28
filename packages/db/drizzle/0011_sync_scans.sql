-- ADR 0013: bank.sync-due scans every household for the connections whose
-- next sync is due. Ids only; each sync then runs in one scoped transaction
-- per connection, as the member who consented (the accounts are theirs).
CREATE FUNCTION keel_connections_due(due_before timestamptz)
  RETURNS TABLE (
    household_id uuid,
    connection_id uuid,
    consented_by text,
    next_sync_at timestamptz
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT household_id, id, consented_by, next_sync_at
    FROM bank_connections
    WHERE status = 'active' AND next_sync_at <= due_before
    ORDER BY next_sync_at
  $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION keel_connections_due(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION keel_connections_due(timestamptz) TO keel_app;--> statement-breakpoint
-- bank.reconcile works on a whole household, but a private account is only
-- visible to its owner: the job runs once per member, each seeing their own
-- accounts and the joint ones. Ids only.
CREATE FUNCTION keel_household_member_ids(household uuid)
  RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT user_id FROM household_members
    WHERE household_id = household
    ORDER BY joined_at, user_id
  $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION keel_household_member_ids(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION keel_household_member_ids(uuid) TO keel_app;
