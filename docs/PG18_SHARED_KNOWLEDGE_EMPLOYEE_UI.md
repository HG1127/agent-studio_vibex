# PG18 employee shared knowledge content candidate

Status: local synthetic candidate; **production cutover remains NO-GO**.
Old PocketBase records are disposable test data; no old-record import is needed.

After 63c9c3f, proposed migration 033 and a separately enabled Native Cookie
workspace connect owner-managed employee sharing to actual document operations.
An owner can grant viewer/editor access, change an existing recipient's role,
revoke or explicitly restore a grant, and independently record semantic consent.
Both user status and native account enablement remain required. Readers receive
only authorized metadata, document headers and bounded literal keyword citations.
Editors can import/delete content under the base's original owner; owner/actor
audit records and actor-owned immutable operation receipts are atomic with writes.

## Scope and controls

Migration 032's metadata ACL role retains no document/vector privileges. A second
NOLOGIN/NOINHERIT content role owns six fixed-search-path functions. It can read
only metadata/text columns, cannot select object keys or embeddings, and has no
model, integration or authentication credentials. It has only a metadata timestamp
UPDATE grant needed to lock a base row; the functions do not update that timestamp.
No service login may join either helper role. Default PUBLIC function execution
is revoked. Direct employee base/document/chunk RLS remains owner-private.

The ordinary startup credential inspector audits installed helper roles even
when sharing is off. It rejects unsafe role attributes/membership, model/tool/MCP/
Smithery credential access, and authentication reads beyond the metadata helper's
two account enablement columns. Sharing activation additionally checks forced RLS,
function ownership/search paths, API-only public entrypoint execution, no vector
access and no object-key reads. The inspector uses catalog/privilege queries in
READ ONLY transactions and selects no employee/credential values.

The new `/api/v2/shared-knowledge` namespace is absent from default capabilities
and denied by the native route policy unless config UAT and this independent pair
are both approved in the isolated non-root HTTPS service:

```text
AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_ENABLED=true
AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_APPROVED=APPROVE_DISPOSABLE_PG18_KNOWLEDGE_SHARING_ONLY
```

This is configuration documentation, not a deployment or activation instruction.
Neither flag authorizes a provider request, Agent task or semantic indexing.
Server verification supplies the employee identity; browser employee headers,
owner IDs, external URLs, object keys, parser profiles and raw vectors are not
accepted. Searches put private phrases in POST bodies, not URL query strings.

## Content behavior

TXT, Markdown/MD, CSV, TSV, JSON, HTML/HTM text is kept as plain text. HTML is
escaped on rendering and never executed or fetched. The employee path supports
160,000 Unicode characters and 180-character filenames, rather than inheriting
the old PG pilot's 12,000-character/four-format limit. Lossless 800-character
chunks retain all source text. A base is limited to 100 documents; document
mutation locks and statements have 3-second/5-second timeouts.

PDF/DOCX bytes are parsed in the existing bounded child process. The employee
profile accepts up to 160,000 extracted characters. The legacy private pilot
keeps its prior profile. The server alone chooses the profile; HTTP bodies cannot
change it. Existing 512 KiB input, 25 PDF pages, ZIP entry/4 MiB expansion limits,
concurrency, memory/time limits and child credential isolation remain. Original
binary bytes are not retained. These limits and lack of OCR must remain visible
in acceptance; this does not attest arbitrary large/scanned-document parity.

Uploads and deletes use a frozen UUID, canonical fingerprint and immutable actor
receipt. A delete also fixes the reviewed document UUID/hash. Lost responses do
not auto-resend. The employee panel survives navigation with pending payloads only
in private memory; snapshots/storage contain no document body/bytes. Read-only
receipt recovery or an explicit retry reuses the same request. A historical
receipt cannot recreate a later deleted document or revoked grant. Session
expiry/logout removes the view and fences late responses from another owner.

## Verification

Fifteen synthetic SQL, real Native Cookie HTTP, actual isolated PDF/DOCX parser,
client state and SSR cases passed. They cover viewer/editor enforcement, exact
recipient role changes/restoration, revoke/deactivation, immutable retries,
hash-fixed deletion, full 160k text/format coverage, parser-profile separation,
helper privilege drift, no header impersonation, cross-session state and HTML
escaping. Worker package/readonly entrypoint tests: 9 passed. Python operator/
package tests: 22 passed. Package manifests include the new readonly inspector.

Final local regression, 2026-10-23:

| Check | Main workspace | Isolated candidate |
| --- | --- | --- |
| `pnpm check` (unit / frontend types / normal build) | 476 passed; 90 build assets | 376 passed; 95 build assets |
| `pnpm test:e2e:parallel` (real disposable PocketBase) | 23 passed, 112.2 s | 19 passed, 75.5 s |
| API TypeScript | passed | passed |
| PG-only frontend | 5 JS assets; no legacy PB auth/proxy | 5 JS assets; no legacy PB auth/proxy |
| New sharing cases | 15 passed standalone and in full regression | all 15 included in full regression |
| Worker review package / readonly entrypoint checks | 9 passed | 9 passed |
| Python operator / package checks | 22 passed | 22 passed |
| Native API extracted package | 65 source / 71 packed; manifest, offline plan and default refusal passed | 65 source / 71 packed; manifest, offline plan and default refusal passed |

The main and candidate retain different pre-existing baselines. Package files
are source review artifacts in an external temporary directory, not an installed
or live-validated deployment. The whole-tree inventory still counts 38 PB-related
files out of 275 frontend files in main, and 30 out of 239 in the candidate;
both reports refuse cutover. This is not a completion percentage.

Hosted restricted-role PG18 source adds migration 033 and content/revocation
checks. The browser fixture and new employee sharing spec cover navigation after
a lost response, viewer/editor changes, content operations and revocation. These
new hosted PG18 and real browser cases have **not run**; local SSR is not browser
acceptance. No new CI success is claimed and no source/archive is uploaded.

## Remaining migration work

Shared Agent/Workflow KB selection and execution are still denied by the existing
private resource checks. They must gain current grant checks at every model/tool
boundary, including model turns that reuse earlier retrieved context, before
opening shared bindings. Shared semantic retrieval additionally requires the
reader's own compatible provider/model and billing, independent consent,
dimension-aware persisted indexing and no borrowing of an owner's key or sending
owner documents to a reader's embedding provider. Current PG vector(1536) is a
pilot type; it does not cover PocketBase's supported 2..3072 dimensions.

Schedules, collaboration, remaining feature parity, restricted-role hosted PG18,
real browser/employee UAT, Worker operations and actual backup/restore/rollback
signoff remain required. No real migration, service switch, credential upload,
old-data deletion or paid provider call occurred in this increment.
