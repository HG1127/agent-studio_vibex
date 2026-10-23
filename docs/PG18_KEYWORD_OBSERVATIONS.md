# Retained free keyword Tool evidence

This isolated migration increment closes the reproduced stale keyword Tool
approval/history path for direct Workflow Tools, Workflow Agents and autonomous
Agents. PocketBase remains the current runtime. Production cutover is **NO-GO**.

## Source identity and content lifetime

SQL041 adds a private append-only `knowledge_keyword_observations` ledger. An
approved Tool lookup records its verified reader, run, step and input hash,
original sealed lease/effect identity, selected KB/grant revisions, bounded
document/chunk references and digests. It stores neither the query nor excerpts,
task prompts, credentials, vectors or bearer lease tokens. The query is hashed.

Lookup and source capture occur in the reserved private Tool dispatch transaction.
The same existing literal search, at most two hits per selected KB and three KBs,
returns bounded business evidence. A digest of the selected indexed corpus also
changes when new or removed content would invalidate a zero-hit lookup. Document
timestamp hashing uses epoch values so session time zones cannot change a proof.

Every later approval, result/list/step/output/history read and private effect
dispatch uses the combined semantic/keyword source check. A queued semantic query
also checks earlier free keyword evidence immediately before paying, even when its
own KB is unchanged. Separate credential loading is followed by another source
check; Model/Tool responses are checked again before publishing. Changed content,
document metadata, revoked/regranted access or disabled employees hide retained
outputs and block later effects. They never substitute newly fetched text into an
already approved input or automatically resend an ambiguous provider request.

Keyword lookup has no dependency on an embedding profile, embedding consent,
semantic Tool permission or per-query fee acknowledgement. Owner-private keyword
lookup also works with sharing disabled. The SQL041 fixtures create no embedding
profile and exercise all three execution paths with these capabilities off.

## Privilege and startup boundary

The new `agentstudio_knowledge_keyword` role is NOLOGIN/NOINHERIT with no role
memberships. It may SELECT/INSERT only its FORCE-RLS private ledger. It has no raw
document/chunk, authentication, credential, vector, query-job or ordinary business
table access. Its API entry points return bounded evidence or a Boolean. Metadata
checks stay behind the existing execution helper, and content hashing stays behind
the existing content helper. Internal snapshot/digest functions are unavailable to
API, Worker and Broker roles. Runtime logins cannot read or mutate the ledger.

Catalog audits run even when semantic execution is disabled and reject partial
installation, unsafe roles/memberships, additional column/table/function grants,
missing replay keys, altered RLS/policies or unsafe helper ownership/search paths.
PostgreSQL's predefined all-data administration roles are distinguished from
service roles; runtime login membership is independently restricted.

Reviewed V2 service startup and shared knowledge startup require SQL041. Older
isolated schema fixtures retain their pre-041 adapter for migration-stage tests;
partially installed SQL041 never falls back. Apply SQL041 only after SQL040 in the
fresh disposable migration target. Do not alter an already applied predecessor.
No new operator opt-in, service activation or deployment is performed here.

## Validation and outstanding scope

The local combined keyword/semantic suite passed 17 tests using embedded SQL,
actual private mTLS and synthetic provider callbacks. It covers three runtimes,
result/list/history redaction, content and grant changes, zero-hit corpus changes,
post-credential and in-flight response changes, cross-KB queued-query refusal,
default-off keyword behavior and adversarial role/grant/RLS/replay mutations.

Actual PG18 CI includes Native Cookie approved free keyword Tools in all three
runtimes, the private ledger, restricted login/helper denial and revocation
checks. Browser fixtures load SQL041. Acceptance requires the reviewed commit's
hosted checks to pass; [draft PR 26](https://github.com/HG1127/agent-studio_vibex/pull/26)
records the current exact-commit evidence. Local checks alone cannot establish
hosted acceptance or production readiness.

Single-shot Agent initial grounding and public/view lifetime checks, automatic
historical debug/cross-run sample lineage, remaining functional parity, real
employee UAT, target network/access, sustained OS Worker operation and actual
backup/restore/rollback acceptance remain required. This increment does not prove
those broader migration conditions.
