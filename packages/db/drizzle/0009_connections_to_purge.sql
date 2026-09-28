-- ADR 0013: bank.purge scans every household for connections whose 30-day
-- grace period has passed. Ids only; the job then reopens one scoped
-- transaction per connection, as the member who consented.
CREATE FUNCTION keel_connections_to_purge(removed_before timestamptz)
  RETURNS TABLE (household_id uuid, connection_id uuid, consented_by text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT household_id, id, consented_by
    FROM bank_connections
    WHERE status = 'removed' AND removed_at < removed_before
    ORDER BY removed_at
  $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION keel_connections_to_purge(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION keel_connections_to_purge(timestamptz) TO keel_app;
