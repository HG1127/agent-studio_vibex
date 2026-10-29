# F11/F12 published Agent callers — SQL068 review candidate

This is an isolated PostgreSQL 18 source candidate. Production remains NO-GO.
It does not change the PocketBase/SQLite production runtime or authorize a
deployment, provider request, production migration, or real company data write.
The A authoring chat has run only pure tests and syntax parsing. Root owns actual
installation, full compilation, CI, browser evidence and final acceptance.

## Product behavior

The Native employee Owner opens **API 与网页嵌入**, explicitly enables an aggregate
UTC daily/concurrency budget, selects an immutable published Agent version, and
creates either an API credential or a website embed credential. The response
displays the random plaintext secret once. Only its domain-separated SHA256 and
last eight characters persist. A lost create/rotate acknowledgement can recover
the original receipt and metadata; it cannot recover or reissue the secret.

Both credential types bind their Owner, the published head/version SHA, Native
governance epoch, budget epoch, generation, expiry, exact HTTPS Origins, allowed
published tools and bounded run/model/tool limits. Rotation invalidates the old
generation. A budget edit invalidates old epoch bindings without resetting usage.
A new publish invalidates previous head bindings. Revocation takes effect at
admission and again at Worker/Broker dispatch. Public poll repeats the original
resource and snapshot checks before returning a minimal redacted projection.

The Owner panel supports budget changes; creation, rotation and revocation;
embed appearance and a static preview; an explicitly consented private test;
read-only poll; original UUID recovery; and private invocation history, counters
and links to original Owner tasks. Leaving the panel, losing availability or
changing employee/session clears the displayed secret and fences late responses.

## Authentication and routes

Employee Cookie authentication, Native CSRF and employee identity apply to the
Owner routes below. They never authenticate a public caller. Public routes
require an independent `Bearer acs_...` credential and its exact canonical HTTPS
Origin. An Origin is a browser constraint; the secret remains the bearer
authority. Browser-visible embed credentials are bounded public caller keys, so
Owners must choose their limits accordingly. Arbitrary Owner headers, Native
Cookies/CSRF, employee JWTs, wildcard Origins and alternate Origin spellings are
rejected at the public boundary.

| Route | Purpose |
| --- | --- |
| `GET /api/v2/integrate/agents`, `/keys`, `/budget`, `/embed-config` | Owner workspace and published choices |
| `GET /api/v2/integrate/invocations`, `/stats` | Owner-only retained records and aggregate counters |
| `POST /api/v2/integrate/keys` | Create one credential and once-only secret |
| `POST /api/v2/integrate/keys/:id/reissue` | Explicit generation rotation |
| `DELETE /api/v2/integrate/keys/:id` | Owner-scoped revocation |
| `POST /api/v2/integrate/budget`, `/embed-config` | Explicit budget or appearance change |
| `POST /api/v2/integrate/confirm` | Read the original Owner operation receipt |
| `POST /api/v2/integrate/test-run`, `/test-run/confirm` | Private Owner test or its original receipt |
| `GET /api/v2/integrate/test-run/:invocation` | Private Owner test status |
| `POST /api/v2/public/agent/run` | Admit one original Agent task |
| `POST /api/v2/public/agent/confirm` | Confirm the same original UUID and input |
| `GET /api/v2/public/agent/poll/:invocation` | Minimal public status; no execution |
| `GET /embed.js`, `/embed/:credential` | Static widget and exact-Origin CSP renderer |

Mutations use closed duplicate-free JSON, fatal UTF8 decoding, bounded complete
bodies and explicit fee acknowledgements. Unknown outcomes retain the original
UUID/choice. Clients do not automatically retry a mutation. Confirmation and
polling remain available when new Owner writes or new admissions close.

The static iframe has no raw key, Owner identity, run/checkpoint/resource details
or provider access. Its parent widget holds the caller key in a closure, removes
the original key attribute, and sends only exact-Origin/source-checked messages.
Both widget and SDK use cookie-free public fetches. Preview and poll do not tick
a Worker or call a provider.

## Original execution pipeline

SQL068 creates a sealed private copy of the immutable released Agent snapshot.
The current editable draft is unchanged and the copy is hidden from ordinary
Native Agent CRUD. Admission uses the original `AutonomousAgentRunRepository`
with the verified Owner and the same SQL client/transaction. A deferred receipt
constraint prevents a partial public context or original run from committing.

The existing leased WorkflowV2 Worker, mTLS clients/handlers, lease identity,
private model/tool Broker, secret decryption and external-effect ledger execute
the task. There is no separate caller provider engine. Every pending caller step
requires a reservation for its original live lease, exact checkpoint, source,
generation, Origin, budget, tool alias and optional knowledge consent. Existing
approval alone cannot bypass this check. An absent caller marker does not bypass
the sealed-source guard. Unresolved `started`/`unknown` effects retain the Owner
latch across keys and generations; no automatic replay or quota refund occurs.

## Default-off gates

All feature gates default off. Native management availability, writes, admission
and Worker/Broker execution are independent. Isolated review configuration uses:

```text
AGENT_STUDIO_PG18_AGENT_CALLERS_AVAILABLE=true
AGENT_STUDIO_PG18_AGENT_CALLERS_WRITES_ENABLED=true
AGENT_STUDIO_PG18_AGENT_CALLERS_RUNS_ENABLED=true
AGENT_STUDIO_PG18_AGENT_CALLERS_APPROVED=APPROVE_DISPOSABLE_PG18_PUBLISHED_AGENT_CALLERS_ONLY
AGENT_STUDIO_PG_CALLER_EXECUTION_ENABLED=true
AGENT_STUDIO_PG_CALLER_EXECUTION_APPROVED=PG18_ISOLATED_PUBLISHED_CALLER_EXECUTION_UAT
```

These values do not replace the original Native configuration-write, autonomous
admission, Worker mode, model/tool execution and mTLS approval gates. Startup and
each caller transaction use the actual full catalog/source auditor. SQL068 adds
eight private forced-RLS tables, twenty-eight functions, fifteen API RPC grants
and no roles. Its original 066→065→064→063→062→061→060→059 chain stays intact.
The independent C067 device/office work is neither modified nor implicitly
authorized by this candidate.

## Integration and evidence still required

Apply frozen phase1, phase2 and phase3 only after checking their exact base SHA256
anchors. Merge shared runtime files against current H, preserving Root F29 and C067
changes; never replace a newer shared file wholesale. The ordered install map is
the reviewed original fifty-source 001–066 chain plus own068. Root must include
and independently verify optional067 when testing the complete shared profile.

The genuine fixtures pin a reviewed Git-LF source closure and fail before any
dependency, filesystem, SQL pool or listener if the exact F11/F12 hosted purpose
gate is absent. Refresh pins after final shared-source integration, then inspect
the updated source diff. The dedicated workflow uses only the original guarded
empty PG18 service at loopback port5432. It rejects ordinary/local/root hosts,
production ports, alternate repositories, purpose impersonation and ambient
PG/proxy/Node/TLS injection. These checks are not a substitute for Root's actual
execution evidence.

The authored flow suite covers once-only hashes, foreign Owner denial, public
Cookie/JWT/Origin/header refusal, original admission and confirmation, original
Worker/mTLS/Broker answer and reservations, immutable publish versus draft,
hidden copies, rotation, lost acknowledgement, private Owner test, static embed,
new publish/revoke and unknown outcome latch. Its only model callback returns
synthetic data after actual Broker lease/resource/secret checks; it makes no
external provider request.

The authored database suite applies and restores thirty-one real catalog faults,
tests the original API login and body hashes, deferred incomplete-commit rollback,
same-client original admission rollback, absent transaction context, a real
five-second expiry crossing, aggregate concurrent admissions and immutable DML.
The authored browser suite uses the actual Root Owner page and a second empty
Cookie context on another HTTPS Origin. It exercises the actual external widget,
iframe, CORS/Bearer request, original Worker/mTLS/Broker, public poll, actual
product SDK, lost network acknowledgement and read-only original confirmation.

None of those PG18/browser suites has been executed by A. Root must run the actual
API/frontend compiler and product build, the dedicated flow/database/browser
jobs, the complete shared installer/restore checks, `pnpm check` and the nineteen
isolated PocketBase tests. Employee UAT, networking/access-control/backups and
long-running Worker validation remain production acceptance requirements.
