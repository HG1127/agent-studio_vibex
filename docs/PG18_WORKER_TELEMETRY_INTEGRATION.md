# PostgreSQL Worker telemetry integration

This optional, default-off implementation connects the existing eight Worker
lifecycles to the separate `telemetry_v1` database through a root-owned Unix
socket broker. It does not initialize, activate or deploy that database.
PocketBase remains the current application runtime. Production remains NO-GO.

Workers receive a fixed-path boot token, never a telemetry database password.
Only the existing genuine Root Controller can obtain the private bridge that
opens the corresponding minimal writer-role connection. Each report uses a
one-use chained permit and the existing bounded reporter: 30-second interval,
5-second send ceiling. Reader leases remain 5 seconds and the Native HTTP
budget remains 8 seconds. An uncertain acknowledgement closes the channel;
there is no automatic reconnect, generation replacement or report replay.

The optional signed `worker_heartbeat_control_profile_v2` adds writer settings.
The original closed v1 profile stays valid; v1 rejects a writer field. V2 with
writers omitted or `{ "enabled": false }` performs no writer enrollment. Worker
entry points load the new lifecycle only when
`AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED` is exactly `true`, after their existing
preflight. Readiness follows actual startup checks. Draining follows the
actual synchronous gate that closes new claims. A local acknowledgement or
configuration hint is never readiness authority.

The trusted launcher and host configuration must provide all of these before
enabling the feature:

- Exclusively reserve the signed non-root boot UID pool and never reuse an
  issued UID, even after a failed start or Root restart. The live `/proc`
  observation supplements reservation; it does not establish reservation.
- Deliver the issued token bytes to the exact existing unit credential path
  using a read-only bind/mount, UID ownership and mode `0400`, with trusted
  root-owned ancestors. Root stages private delivery descriptors; this code
  does not install, mount or start services. Ordinary root `0440` plus an ACL
  is refused. `DynamicUser` alone does not ensure a UID is never reused.
- Keep the eight writer groups distinct from each other and from Native's
  group. Remove inherited credential/socket descriptors and capabilities or
  process-memory access that could bypass the UID boundary. Retain the
  existing business-credential boundary when selecting a fresh Worker UID.
- Launch bindings in a controlled sequence: the Root admits one writer
  operation and has no application queue. Concurrent binding can return busy;
  it does not authorize reconnect or replacement credentials. The knowledge
  index/query service uses one atomic fresh UID batch, with independent
  tokens, roles, generations, permits and report sequences. Rotating only one
  of its issued generations cannot silently rebind the other.
- Re-enroll and sign the actual integrated source/runtime closure through the
  unchanged verifier. Historical profile/source receipts cannot be reused for
  changed source bytes.

Root review has verified exact integration of six new modules, eight test
files and eight changed existing files; the autonomous wrapper is unchanged.
The integrated scoped pure/refusal/compatibility checks passed 194 tests, and
30 existing entry checks passed. Both actual TypeScript compiler graphs
passed with strict checking and no emitted files. These checks exercise
protocols, refusal, source ordering and local models. They do not establish
successful Linux credential delivery, real writer-role SQL, actual Worker
reporting or operational readiness. The new genuine hosted verification is
being prepared separately, and the final whole-candidate regression, real
employee UAT, long-running operation, backup/restore and complete rollback
remain required.
