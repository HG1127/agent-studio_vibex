# PG18 knowledge queries: execution-source foundation

Status: isolated, inactive foundation (SQL039). Existing Agent/Workflow knowledge
tools still perform keyword retrieval. This change does not enable semantic tool
execution, charge a real provider, change the PocketBase runtime, or approve a
production migration.

Standalone reader queries already fence the reader's current profile, consent,
knowledge ACL and content. An execution query also needs to stop when its
originating approved task changes. SQL039 adds that additional dispatch fence.

## Guarantees added

- The internal repository method requires an approved, running knowledge tool,
  its original effect and separate private Broker reservation, the current job
  lease, and the verified reader. There is no new HTTP endpoint.
- The repository entry point defaults disabled. Only synthetic fixtures opt in
  to it today. It reconstructs the verified pending tool, checks the exact query
  and KB IDs, and caps results at six; ordinary API repositories do not opt in.
- A source seal captures the current checkpoint hash and configured KB scope.
  Claim, reserve, the final pre-provider check and completion check the same
  source. Approval, parent approval, lease, root revision or checkpoint changes
  prevent dispatch or discard an in-flight result.
- Workflow tools, Workflow Agent children and autonomous Agent children use
  their respective execution roots. Knowledge scope comes from the stored graph
  or frozen Agent spec, with at most three bases.
- Request identity is a deterministic truncated SHA-256 UUID over the fixed
  namespace, verified reader, run and step. It does not depend on the Worker,
  lease or query text. A unique logical-step index provides a second replay
  fence. A replacement Worker cannot reseal an existing query onto a new lease;
  changing the payload conflicts with its existing request digest.
- Source seals retain a lease hash, never the bearer token. Run deletion does
  not cascade into the query/billing ledger. Existing receipt TTL, current ACL,
  current content and vector checks remain in force.
- A separate NOLOGIN/NOINHERIT helper has only the metadata columns needed to
  validate the source. It cannot read model keys, auth records, documents,
  vectors or query jobs, and cannot write tables. No service can assume it.
  Catalog audits reject unsafe grants, role membership, missing source routines,
  lost RLS and removal of the logical-step unique index, including when query
  capability is disabled. Older schemas without any SQL039 footprint remain
  supported.

The source fence supplements existing current knowledge checks. It does not
replace the Tool Broker's full resource/snapshot verification. Completed
receipts remain historical, reader-scoped receipts; they are not authorization
to use cached text in a later model call.

## Verification

`services/pg-api/tests/knowledge-execution-source.test.mjs` prepares real synthetic
runs, employee decisions, Worker leases and Broker reservations against the
embedded PostgreSQL engine. It covers successful reader-paid retrieval, foreign
readers, changed KB scope, stable identity across replacement leases, pre-call
revocation, in-flight revocation, Agent parent/spec changes and privilege damage.

The PG18 bound-runtime CI additionally applies SQL039 to disposable real PG18 and
uses restricted service logins and the existing private mTLS query transport.
Only the provider response is synthetic. Run the focused suite with
`pnpm --dir services/pg-api test:knowledge-query`; repository checks remain
`pnpm check` and `pnpm test:e2e:parallel`.

## Work still required before semantic tools can be enabled

1. Add a closed semantic/hybrid binding to stored tool/spec configuration and
   display a separate per-step fee acknowledgement tied to the actual query.
2. Derive the paid request exclusively from the verified pending tool, pass full
   resource checks, and dispatch outside any SQL transaction using this source
   seal. Keep preparation and preview free of provider effects.
3. Return bounded runtime evidence (six items, 320 codepoints per snippet,
   200 per citation, existing UTF-8/wire limits), with durable receipt provenance.
4. Revalidate cached provenance, ACL, content and vectors before later generation.
   Present the resulting frozen prompt for a new approval; never replace an
   already approved prompt.
5. Add independent operator gates and complete full private execution, employee
   UI and real PG18 tests for those adapters.

Formal migration remains NO-GO pending these integration steps, remaining
functionality parity, employee UAT, target networking/access review, long-running
Worker validation, backup/restore and signed cutover/rollback verification.
