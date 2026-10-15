-- V8 design contract. Only a currently valid worker may schedule retry.
-- Parameters: $1=job UUID, $2=lease token UUID,
--             $3=lease version bigint, $4=worker ID text,
--             $5=retry delay seconds (1..3600), $6=safe error CODE (not raw input).
-- Ambiguous external writes must NEVER call this statement automatically.
UPDATE agentstudio.jobs AS jobs SET
  status = 'queued',
  scheduled_at = clock_timestamp() + ($5::integer * INTERVAL '1 second'),
  lease_owner = NULL,
  lease_token = NULL,
  lease_until = NULL,
  last_error_code = left($6::text,120),
  updated_at = clock_timestamp()
WHERE id = $1::uuid
  AND lease_token = $2::uuid
  AND lease_version = $3::bigint
  AND lease_owner = $4::text
  AND lease_until > clock_timestamp()
  AND status = 'leased'
  AND attempts < max_attempts
  -- Retry is forbidden until ambiguous external writes are reconciled.
  AND (run_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM agentstudio.external_effects AS effect
    WHERE effect.run_id=jobs.run_id
      AND effect.owner_user_id=jobs.owner_user_id
      AND effect.status IN ('started','unknown')
  ))
  AND $5::integer BETWEEN 1 AND 3600
RETURNING id,status,scheduled_at,lease_version;
