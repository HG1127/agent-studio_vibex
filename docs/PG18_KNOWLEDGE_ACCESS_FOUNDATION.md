# PG18 knowledge sharing permission foundation

Status: local synthetic foundation only; production cutover remains **NO-GO**.
Old PocketBase data is disposable test data; no record import is required.

The existing PocketBase feature supports owner-controlled per-employee viewer
and editor grants, plus separate semantic consent. Team visibility alone does
not reproduce those permissions. This increment establishes those grant records
without opening document, vector or Agent access before the retrieval paths
can enforce revocation correctly.

Proposed migration 032 follows 031. It creates forced-RLS owner-scoped grants
and immutable retry receipts. Grants retain a revision and revoked tombstone;
an owner can revoke a disabled recipient. A grant, role change or semantic change
requires the current revision. At most fifty non-revoked recipients are allowed
per base, serialized by a base row lock. Each request uses a UUID and canonical
fingerprint, with an owner/request advisory lock and durable receipt. Reusing a
request with different content fails. A historical receipt confirms only the
past action; it never restores access after later revocation. Mutations and audit
are atomic, and receipts/audit contain recipient IDs rather than email addresses.

Only bounded metadata functions can inspect shared ownership. Their dedicated
function owner is NOLOGIN, NOINHERIT, NOSUPERUSER and NOBYPASSRLS, with no member
logins and no credentials, document or vector privileges. When native auth is
installed first, the helper can read only account user_id/enablement predicates;
email, password records and sessions remain inaccessible. A native user without
an installed auth account fails closed. Both user status and native account
enablement are checked for the owner and recipient. Active grants sort ahead of
revoked history in the bounded owner list, so old tombstones cannot hide a live
grant from revocation review. Mutation locks/statements have bounded timeouts.
The metadata entry functions have a fixed pg_catalog search path, qualified
names, revoked PUBLIC execution and API-only execution grants. The internal
employee predicate is executable only by its function owner. Install native auth
before migration 032; adding auth later requires a reviewed predicate-grant step
and must not bypass a permission failure. Both the owner and recipient
must be active. Direct API row policies for bases/documents/chunks remain private;
Worker, Broker and identity-dispatch roles receive no sharing privileges.

The native authentication repository gains a server-internal exact email resolver.
It checks the already-verified native caller against current active/enabled
accounts and returns only another active employee's id and display name. It is
not an HTTP employee search endpoint. API and Worker gain no auth schema access.
The permission repository resolves a recipient before opening the business
transaction; it never nests two pools' transactions. The business transaction
then rechecks the native user mapping, owner and recipient activity.

## Verification

Nine focused embedded PostgreSQL/native-auth tests passed, including private RLS,
metadata-only role privileges, exact native recipient lookup, owner/recipient
deactivation, independent semantic consent, CAS races, quota, owner-only receipt
recovery and revocation. The real PG18 TCP suite has added migration and restricted
pool cases; those new hosted cases have **not run**. No hosted CI is claimed from
local results.

Final local regression, 2026-10-23:

| Check | Main workspace | Isolated candidate |
| --- | --- | --- |
| `pnpm check` (unit / frontend types / normal build) | 461 passed; 90 build assets | 361 passed; 95 build assets |
| `pnpm test:e2e:parallel` (real disposable PocketBase) | 23 passed, 110.1 s | 19 passed, 75.5 s |
| API TypeScript | passed | passed |
| PG-only frontend | passed, 5 JS assets; no legacy PB auth/proxy | passed, 5 JS assets; no legacy PB auth/proxy |
| Sharing / native auth focused cases | all 9 included in full regression | documented focused entrypoint: 9 passed |
| Added hosted PG18 test source | syntax checked only | syntax checked only |

Different main/candidate totals reflect their preserved prior baselines. No new
hosted CI, PG18 TCP, browser or employee acceptance is inferred from these results.
This 13-file source increment remains local and unuploaded. No generated archive,
database, credentials, binaries or environment file is committed.

## Remaining integration

No sharing HTTP route, capability, employee panel, shared document upload/search,
Agent/Workflow shared binding or shared execution is enabled by this foundation.
Activation must first verify the new schema, helper role/column grants, fixed
function ownership/search paths and absence of unexpected role membership.
Editor content operations, bounded shared search, and every execution/provider
boundary must recheck current permission. Semantic retrieval also needs the
reader's own compatible provider/model connection, its own billing and consent,
persisted indexing and dimension checks; it must not borrow the owner's key or
send owner documents to a reader's provider. Existing private paths are unchanged.

After integration, hosted restricted-role PG18 and full browser acceptance,
employee UAT, Worker operations, backup/restore and rollback signoff remain
necessary. This local proposal performs no deployment, remote writes, migration
application, real data deletion or paid provider request.
