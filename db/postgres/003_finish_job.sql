-- V8 design contract for a successful/terminal finish, NOT wired to V7.
-- Parameters: $1=job UUID, $2=lease token UUID,
--             $3=lease version bigint, $4=worker ID text,
--             $5=terminal status ('succeeded' or 'failed').
-- Zero returned rows = lost/expired lease. Do not acknowledge stale workers.
UPDATE agentstudio.jobs SET
  status = $5::text,
  lease_owner = NULL,
  lease_token = NULL,
  lease_until = NULL,
  updated_at = clock_timestamp()
WHERE id = $1::uuid
  AND lease_token = $2::uuid
  AND lease_version = $3::bigint
  AND lease_owner = $4::text
  AND lease_until > clock_timestamp()
  AND status = 'leased'
  AND $5::text IN ('succeeded','failed')
RETURNING id,owner_user_id,status,lease_version;
