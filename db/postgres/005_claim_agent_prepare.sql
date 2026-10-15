-- V8 prepare-only Worker. Does not claim schedules, knowledge ingest,
-- external tool calls, or real LLM execution.
-- $1=worker_id; $2=lease seconds 15..300.
-- Must run inside a transaction with SET LOCAL ROLE agentstudio_worker.
WITH candidate AS MATERIALIZED (
  SELECT j.id
  FROM agentstudio.jobs AS j
  JOIN agentstudio.runs AS r ON r.id=j.run_id
    AND r.owner_user_id=j.owner_user_id
  JOIN agentstudio.users AS u ON u.id=j.owner_user_id
  WHERE j.kind='run_tick'
    AND j.payload->>'phase'='prepare'
    AND u.status='active'
    AND r.status='queued'
    AND j.attempts<j.max_attempts
    AND (
      (j.status='queued' AND j.scheduled_at<=clock_timestamp())
      OR (j.status='leased' AND j.lease_until<=clock_timestamp())
    )
    AND NOT EXISTS (
      SELECT 1 FROM agentstudio.external_effects AS x
      WHERE x.run_id=j.run_id AND x.owner_user_id=j.owner_user_id
        AND x.status IN ('started','unknown')
    )
    AND length($1::text) BETWEEN 1 AND 120
    AND $2::integer BETWEEN 15 AND 300
  ORDER BY j.scheduled_at,j.id
  FOR UPDATE OF j SKIP LOCKED
  LIMIT 1
)
UPDATE agentstudio.jobs AS j
SET status='leased',
    attempts=j.attempts+1,
    lease_owner=$1::text,
    lease_token=gen_random_uuid(),
    lease_version=j.lease_version+1,
    lease_until=clock_timestamp()+($2::integer*INTERVAL '1 second'),
    updated_at=clock_timestamp()
FROM candidate AS c
WHERE j.id=c.id
RETURNING j.id,j.owner_user_id,j.run_id,j.kind,j.payload,
          j.lease_owner,j.lease_token,j.lease_version,j.lease_until,j.attempts;
