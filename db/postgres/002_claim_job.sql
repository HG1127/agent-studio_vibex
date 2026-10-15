-- V8 design contract, NOT executed automatically by the current V7 worker.
-- A single atomic statement using the agentstudio_worker DB role.
-- Parameters: $1=worker_id (text), $2=lease_seconds (integer, 15..300).
-- The caller must verify the returned lease_token+lease_version before every
-- subsequent business state update. No unguarded retried external POST.
WITH candidate AS MATERIALIZED (
  SELECT queued_job.id
  FROM agentstudio.jobs AS queued_job
  WHERE queued_job.attempts < queued_job.max_attempts
    AND (
      (status = 'queued' AND scheduled_at <= clock_timestamp())
      OR (status = 'leased' AND lease_until <= clock_timestamp())
    )
    -- No automated replay while ANY external write for this run may have
    -- succeeded. A human must resolve started/unknown effects first.
    AND (queued_job.run_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM agentstudio.external_effects AS effect
      WHERE effect.run_id=queued_job.run_id
        AND effect.owner_user_id=queued_job.owner_user_id
        AND effect.status IN ('started','unknown')
    ))
    AND length($1::text) BETWEEN 1 AND 120
    AND $2::integer BETWEEN 15 AND 300
  ORDER BY queued_job.scheduled_at, queued_job.id
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE agentstudio.jobs AS j SET
  status = 'leased',
  attempts = j.attempts + 1,
  lease_owner = $1::text,
  lease_token = gen_random_uuid(),
  lease_version = j.lease_version + 1,
  lease_until = clock_timestamp() + ($2::integer * INTERVAL '1 second'),
  updated_at = clock_timestamp()
FROM candidate AS c
WHERE j.id = c.id
RETURNING j.id,j.owner_user_id,j.run_id,j.kind,j.payload,
          j.lease_token,j.lease_version,j.lease_until,j.attempts;
