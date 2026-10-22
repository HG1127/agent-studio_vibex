# PG18 MCP connections and discovery — 2026-10-23

This increment follows local commit `2b29492`. It remains unuploaded and does
not change the running PocketBase site. Production cutover remains **NO-GO**.

## Implemented flow

The employee's tool-connections section now contains an independent MCP panel.
Connection creation, revision-checked editing/removal, masked request headers,
explicit tool discovery and a bounded tool/schema catalog use Native Cookie
authentication and owner RLS. Merely opening the panel makes no MCP request.
Configuration writes require the server configuration capability; discovery
requires an additional independent capability. Nothing queues an Agent job or
calls an MCP tool.

The proposed migration `pg_v9_029_mcp_connections.sql` follows reviewed migration
028. It adds owner-scoped connection/header tables, composite owner foreign keys,
forced RLS and separate API/Broker column privileges. The ordinary API can write
encrypted headers and read their names, but cannot SELECT credential ciphertext.
The credential Broker has owner-only SELECT and no writes; the Worker receives
no MCP grants. Startup checks these privileges before enabling discovery.
No SQL has been applied to a company database.

Create requests carry a stable UUID and a keyed creation fingerprint. A repeated
identical request returns the same connection; conflicting or foreign UUIDs
cannot overwrite it. Header values are encrypted with the existing AES-GCM key.
Blank header values on edit retain stored values only for an existing header
of the same name; additions and renames require a new value. Explicit removal
deletes the header. Every update invalidates the previous catalog and increments the
revision. Discovery compares metadata/header identities and uses CAS when saving
its result, so a concurrent edit cannot publish an older catalog.

The client retains uncertain create requests privately in memory, including the
original UUID and frozen body. It blocks other changes until an explicit read
reconciles the state. If the UUID is absent, an explicit retry reuses that same
body/UUID. Pending headers are absent from public view snapshots. Logout,
disposal and late reads cannot repopulate another employee's state. The panel
remains mounted across feature tabs within the same employee session so an
uncertain save is still available for reconciliation when returning. Its private
state is discarded when the employee session ends. Discovery rate keys include
the verified identity; a foreign connection still returns 404 while its owner is
discovering.

## Protocol and network

The discovery adapter first sends the modern `tools/list` request with matching
per-request protocol metadata and HTTP headers for 2026-07-28. A legacy HTTP 400
can initiate an initialization handshake; negotiated versions are bounded to
2025-11-25, 2025-06-18 and 2025-03-26. A negotiated session ID remains ephemeral
and is used only within that discovery. A modern header/version error cannot
silently downgrade the protocol. Discovery accepts JSON or request-scoped SSE,
including comments, CRLF and multi-line data, and requires one matching response.
Server-initiated requests are rejected; sampling, roots and elicitation are not
advertised. Transport failures are not retried.

HTTPS targets use validated public DNS and pinned addresses, verified TLS,
bounded request/response sizes, a 20-second total discovery deadline, no proxy,
no redirect, no reconnect and no cookie storage. Endpoint paths/query strings
are fixed configuration and never parameter templates. Protocol, forwarding,
Host and framing headers cannot be supplied as credentials.

At most five pages and fifty distinct tools enter a 64 KiB UTF-8 catalog; each
input schema is at most 8 KiB with bounded nesting. Invalid tool definitions and
definitions reflecting credential values are omitted. Invalid `x-mcp-header`
annotations cannot become usable catalog entries. Read-only/destructive hints
are descriptive and grant no permission. Async-task requirements are shown.
Audit records contain only counts, version, revision and fixed status/error
codes, never credentials, URLs, tool bodies or raw vendor error messages.

Primary protocol references: [2026-07-28 Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http),
[version negotiation](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning),
[2025-11-25 transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

## Isolated activation prerequisites

Do not apply the migration or activate discovery in production from this document.
For an explicitly authorized disposable target, review/apply migration 029 after
028 and validate the API/Broker/Worker privileges. Discovery requires the existing
non-root HTTPS configuration UAT prerequisites, the separate Broker credential
file, and both additional environment declarations:

```text
AGENT_STUDIO_PG18_MCP_DISCOVERY_UAT_ENABLED=true
AGENT_STUDIO_PG18_MCP_DISCOVERY_UAT_APPROVED=APPROVE_DISPOSABLE_PG18_MCP_DISCOVERY_ONLY
```

These declarations do not authorize Agent MCP execution or Smithery management.
No runtime flags or credentials were activated during implementation.

## Evidence and outstanding work

`pnpm test:pg18:mcp-discovery`: **13/13** focused checks passed with synthetic
SQL, Native Cookie requests, fake public-DNS/network responses, client recovery
and static SSR. They verify permission denial, duplicate/foreign creation,
concurrent configuration changes, known denials, safe errors, protocol versions,
SSE parsing and escaped UI. The final focused rerun passed **13/13** after the
header rename, tab lifetime and identity-scoped rate-key fixes.

Full regression evidence for this increment:

| Workspace | Complete check | Real isolated PocketBase E2E | Production bundle isolation |
| --- | --- | --- | --- |
| Main D-drive tree | 417/417 + frontend types/build | 23/23, two workers, 119.6 s | 90 assets |
| Isolated candidate | 317/317 + frontend types/build | 19/19, two workers, 118.6 s | 95 assets |

The final UI fixes were followed by focused tests, frontend/API TypeScript checks
and the PG-only build (**5 JS assets**). Candidate checks use the existing D-drive
PocketBase executable through `POCKETBASE_BIN`, never a committed binary.
The read-only cutover inventory finds **268** frontend files and **38** still
depending on PocketBase; `cutover_allowed` remains **false**. These dependency
counts are not a percentage of functional completion.

Hosted PostgreSQL 18 source now applies migration 029 and checks the flow using
separate API/identity/Worker/Broker roles and Native HTTPS. Hosted browser source
covers MCP configuration and explicit discovery without extra jobs/model calls.
Those new hosted cases have **not run**; no actual external MCP server, browser
acceptance or screenshot verification is claimed.

Next: bind discovered MCP tools to Agent/Workflow snapshots, implement approved
private Tool Broker calls with protocol/schema pins and ambiguity/no-resend
handling, then complete Smithery catalog/key/namespace/managed connection/OAuth
setup and refresh. The earlier PocketBase custom remote MCP and Smithery paths
remain required; this increment does not substitute HTTP tools for them.
Shared/semantic knowledge, remaining schedules/collaboration, target operations,
employee UAT, sustained Workers and restore/rollback signoff remain open.
