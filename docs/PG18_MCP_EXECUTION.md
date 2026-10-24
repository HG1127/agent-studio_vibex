# PG18 MCP execution candidate — 2026-10-23

This local increment follows `97b0160`. It has not been uploaded or applied to a
company database. PocketBase remains the running application. Production cutover
remains **NO-GO**; disposable old test records do not require an import.

## Implemented behavior

An employee can explicitly read an owned, successfully discovered MCP catalog,
select a concrete tool for a Workflow node or Agent, and save a revision-checked
binding. The binding contains only connection UUID, connection revision, remote
tool name and the SHA-256 of the canonical catalog. No model-selected endpoint,
headers, schema or protocol version can override the server configuration.
All other Agent edits retain these bindings. Portable Workflow JSON removes
employee references; copying nodes within the same editor retains them.

Direct Workflow tools, Workflow Agents and standalone multi-round Agents use the
existing approval/checkpoint/lease machinery. Agent tool schemas are snapshotted
privately and their hashes enter the checkpoint identity. Model prompts receive
only approved aliases, tool descriptions and input schemas. Before every effect,
the API/Broker checks owner, current connection revision, catalog hash and tool
definition again. Approval is for one step and input hash; read-only annotations
never waive approval. Stale or missing metadata disables approval in the UI.

Proposed migration `pg_v9_030_mcp_tool_identity.sql` follows 029 and extends only
the existing direct-tool lease predicate to recognize an MCP binding. It retains
the verified employee identity, owner/approval/lease/hash checks, function grants
and fixed SECURITY DEFINER search path. Startup checks the actual installed
function before execution can be enabled. No new Worker credential privileges
are granted. Header decryption occurs only in the private Broker after the
secondary STARTED reservation; plaintext never crosses the Worker mTLS response.

## Schema, protocol and result limits

AJV 8.20.0 compiles and validates MCP input schemas in a disposable worker thread,
with 64 MiB old-generation memory and a 1.5-second deadline. Draft 2020-12,
2019-09 and draft-07 are supported; an absent dialect defaults to 2020-12.
Unknown formats are annotations; values are not coerced, defaulted or removed.
Remote schema loading and asynchronous validators are disabled. Existing bounded
catalog/schema limits remain in force; arguments are at most 12,000 UTF-8 bytes.
Validation failure occurs before credential release or a remote call. A bounded
cache stores only schema compilation outcomes, never arguments.

Calls pin the discovered protocol version. Modern calls include matching
per-request metadata, method/name and schema-declared parameter headers. Legacy
calls initialize exactly that version, keep the session in memory, send the
initialized notification and make one `tools/call`. There is no version fallback,
redirect, reconnect, session recovery, automatic retry or repeated tool call.
The existing public-DNS-pinned HTTPS transport, verified TLS, body limits and
deadlines apply. JSON and request-scoped SSE require a matching JSON-RPC response.

The adapter extracts bounded text/structured results, redacts configured header
secrets and returns at most 4,000 characters. Resource links are not followed.
Async tasks, server requests, sampling, elicitation/input requests and MRTR are
unsupported and cannot trigger another operation. A valid `isError: true` response
records a failed business operation without resending it; such an error does not
prove the remote service made no partial changes. Lost/malformed responses or
timeouts leave the effect unknown and pause the run for manual reconciliation.
Neither a restarted Worker nor another approval can resend that reserved effect.
Audit records use fixed codes and hashes, without raw parameters, URLs or secrets.

Primary references: [AJV security](https://ajv.js.org/security.html),
[AJV strict mode](https://ajv.js.org/strict-mode.html),
[MCP modern transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http),
[MCP legacy transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

## Isolated activation

Execution is independently disabled by default, including run admission before
job/model planning. The API and private Broker require this same explicit pair:

```text
AGENT_STUDIO_PG_MCP_TOOLS_ENABLED=true
AGENT_STUDIO_PG_MCP_TOOLS_APPROVED=APPROVE_DISPOSABLE_PG18_MCP_TOOLS_ONLY
```

The API additionally requires its existing non-root HTTPS configuration UAT and
Workflow V2 or autonomous Agent grant. The Broker requires its existing Workflow
tool execution grant, restricted API/Broker/identity logins and mTLS prerequisites.
Read-only discovery is separately granted; it does not enable calls. Rejection
and permitted cancellation remain available when execution admission is closed.
No environment flags or live credentials were changed during implementation.

## Verification and remaining work

Seventeen focused synthetic tests passed: protocol/schema validation, all three
execution paths over real local private mTLS, new Worker instances, Native Cookie
client edits, default-closed admission, owner isolation, stale/forged catalog
references, credential-release fences, business failure, ambiguous outcome,
portable graph behavior and escaped static UI/explicit consent.

Full regression results at this candidate:

| Verification | Main working directory | Isolated candidate |
| --- | --- | --- |
| `pnpm check` (tests, TypeScript, build) | 434/434 passed | 334/334 passed |
| `pnpm test:e2e:parallel` | 23/23 passed, 125.9 s | 19/19 passed, 130.7 s |
| API TypeScript | Passed | Passed |
| PG-only web build | Passed, 5 JS assets | Passed, 5 JS assets |
| Production bundle isolation | Passed, 90 assets | Passed, 95 assets |

The main directory contains additional pre-existing application work, accounting
for the different baseline totals. The candidate includes only the explicit
60-file MCP execution increment on top of `97b0160`. Dependencies were installed
from the locked npm versions with lifecycle scripts disabled. Both cutover
reports still deny production activation; the main inventory measures 270
frontend files and 38 files with legacy PocketBase dependencies.

Hosted PG18 restricted-role/HTTPS/mTLS cases now include MCP success, confirmed
business failure, unknown outcome and both Agent paths. The browser source now
covers discovery, Agent binding and one approved synthetic call. These new hosted
cases have **not run**, and no local browser acceptance or live MCP service test
is claimed. SQL role preflight, employee UAT, long-running operation, network
acceptance, backup/restore and rollback signoff remain mandatory.

Smithery managed connection/OAuth setup, remaining shared/semantic knowledge,
schedules/collaboration and the other cutover gates remain separate work. This
increment alone does not establish whole-product feature parity or authorize a
production switch.
