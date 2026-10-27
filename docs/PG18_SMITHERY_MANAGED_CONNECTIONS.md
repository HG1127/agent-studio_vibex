# PG18 Smithery managed connections — 2026-10-23

This increment follows local candidate `a82644d`. It remains isolated and has
not been uploaded, deployed or applied to a company database. Old PocketBase
test records do not require an import. Production activation remains **NO-GO**.

## Employee flow

The employee can explicitly read their local Smithery configuration, verify and
save a key, read their owned namespaces, search the registry and select a server.
Creating a managed connection requires confirmation of the selected namespace,
server and connection purpose. The official setup page opens only after a user
click. No OAuth link, namespace, registry search or remote refresh opens or runs
automatically. The user returns to refresh the connection status, then explicitly
discovers tools in the MCP panel. Agent/Workflow binding and each tool-call
approval retain their independent grants and the execution checks documented in
`PG18_MCP_EXECUTION.md`.

The client keeps an uncertain request privately in memory. Its public snapshot
contains no key. Exact key-save receipts and stable connection UUIDs allow a
read to reconcile a lost response; retries retain the original body and request
ID. A stuck server reservation can be superseded only by an explicitly selected
remote status refresh, which never repeats a create or revoke. Hidden/disposed
reads, logout and a changed employee lifetime cannot refill the prior view.
The panel remains mounted across feature tabs within the same employee session.

## Storage and owner checks

Proposed migration `pg_v9_031_smithery_managed.sql` follows 030. It adds forced-RLS
credential and managed-connection tables. The API can read key metadata and write
encrypted values, but cannot SELECT credential ciphertext. Only the separate
credential Broker can decrypt an owned key. The Worker receives no new grants;
startup verifies the actual table/column privileges and forced RLS.

Each managed connection maps to one owner MCP connection. A deterministic remote
ID comes from the stable local request UUID, and a server-generated HMAC binds
the remote metadata to the employee and frozen selection. Namespace ownership is
checked through the authenticated `/namespaces` endpoint without search query
parameters. A GET checks an existing remote ID before PUT; a foreign/mismatched
binding can never be adopted or deleted. Public responses omit the binding proof,
key fingerprint, operation token, ciphertext and vendor response extensions.

The ordinary MCP editor cannot edit/delete a managed connection, including when
the Smithery feature is disabled. It can explicitly discover tools after the
managed status is connected. Creating/refreshing a managed connection does not
automatically discover tools or create jobs. Before discovery, it has no usable
catalog. Credentials for the fixed per-connection MCP gateway are encrypted in
the existing header table, readable only by the Broker.

The employee can pause local use without contacting Smithery or deleting the
remote connection. This clears the local catalog/headers, advances revisions and
invalidates an in-flight response token. Explicitly refreshing can resume a
verified connection; its tools must then be discovered and reviewed again.

Saving a rotated key or removing a key atomically disables all of the owner's
managed MCP connections, removes their credential headers, clears catalogs and
advances revisions. Previously approved bindings become stale. Shared owner
locks and operation-token checks prevent a late response using an older key from
re-enabling a connection. Removing a local key leaves remote resources in place;
the UI explains that remote connections should be revoked first if desired.

## Remote operations and uncertain outcomes

Management requests use only `https://api.smithery.ai`, validated public DNS,
pinned addresses and verified TLS. Allowed paths/methods cover namespace and
registry reads plus a specific connection's GET/PUT/DELETE. There is no generic
URL, arbitrary headers, tool RPC, redirect, proxy, cookie jar or automatic retry.
The key travels only in Authorization; a search/path reflecting the key is
rejected. Request/response sizes are bounded, and a management operation shares
a 20-second deadline across its requests. Raw vendor errors never enter the UI
or audit. Catalog responses reflecting the key are omitted.

Create requests reserve a local UUID before remote mutation. Lost/malformed
responses leave an owned, disabled record for explicit reconciliation. Repeating
the original create request returns that record without another PUT. A manual
retry is available only after a remote GET confirmed absence; it reuses the same
remote ID and checks again before writing. Setup links are limited to HTTPS on
`auth.smithery.ai` or `smithery.ai`, without credentials, alternate ports or
fragments. Mock/up-link sessions and mismatched remote identities are rejected.

Revocation first disables local execution and removes its headers/catalog. The
revoke-requested latch prevents any later refresh from re-enabling that resource.
A remote 404 confirms absence; an uncertain delete preserves a disabled
`revoke_unknown` record. Later reads/refreshes can confirm the deletion without
resending it. Audit records distinguish failed/uncertain results with fixed
codes and state, without URLs, secrets or raw request/response bodies.

Primary references: [Smithery Connect](https://smithery.ai/docs/use/connect),
[owned namespaces](https://smithery.ai/docs/api-reference/namespaces/get-users-namespaces-or-search-namespaces),
[registry search](https://smithery.ai/docs/api-reference/servers/list-all-servers),
[specific connection PUT](https://smithery.ai/docs/api-reference/connect/create-or-update-connection).

## Isolated activation and evidence

The existing non-root HTTPS configuration UAT prerequisites, restricted
API/Broker identities and reviewed schema 031 are required. Management additionally
requires both declarations:

```text
AGENT_STUDIO_PG18_SMITHERY_UAT_ENABLED=true
AGENT_STUDIO_PG18_SMITHERY_UAT_APPROVED=APPROVE_DISPOSABLE_PG18_SMITHERY_MANAGEMENT_ONLY
```

This grant enables neither MCP discovery nor tool execution. No live runtime
flags, keys, employee accounts or remote Smithery resources were changed during
implementation. All protocol/repository/Cookie/UI tests use synthetic inputs and
a fake vendor transport.

| Verification | Main working directory | Isolated candidate |
| --- | --- | --- |
| `pnpm check` (tests, TypeScript, build) | 451/451 passed | 351/351 passed |
| `pnpm test:e2e:parallel` | 23/23 passed, 194.6 s | 19/19 passed, 75.6 s |
| API TypeScript | Passed | Passed |
| PG-only web build | Passed, 5 JS assets | Passed, 5 JS assets |
| Production bundle isolation | Passed, 90 assets | Passed, 95 assets |

The seventeen Smithery tests cover owner/CSRF/capability checks, encrypted
credentials, privilege drift (including a partial Worker column grant), stable
requests, local pause/resume, unknown create/delete outcomes, remote absence
recovery, foreign binding proof, key rotation, late responses, client receipts
and escaped SSR/explicit links. Different totals reflect pre-existing work in
the main directory; the candidate is the explicit 33-file increment on a82644d.

An initial over-parallel verification exhausted local memory and interrupted
process startup and builds. Those failed checks were not accepted. Final quality,
candidate PB and PG-only build checks ran one at a time, without relaxing tests
or timeouts. Cutover reports still deny activation: the main source inventory
has 273 frontend files / 38 PocketBase-dependent files; the isolated candidate
has 237 / 30 respectively. These inventories are not a completion percentage.

Hosted PG18 source covers restricted roles, HTTPS Cookies, managed setup,
explicit discovery, both Agent paths over private mTLS, key rotation and revoke.
Browser source covers a lost create response, safe setup link, explicit refresh,
discovery and revoke. These new hosted cases have **not run**; live OAuth,
vendor-network acceptance and local interactive browser acceptance are still
unverified. Remaining product parity, employee UAT, long-running operations,
backup/restore and rollback signoff are still required before a production GO.
