# Frozen research report exports

This is a development capability in the standalone PocketBase/SQLite runtime.
Production remains NO-GO; these tests use synthetic DEMO data. It does not switch
the PostgreSQL experiment, deploy a service, or certify real research quality.

## Employee and Agent flow

Create or bind a business case, save versioned records with real source locators,
and submit `research.freeze.v1`. Wait for the freeze job to succeed. Its immutable
`fact_set_id` pins current records and every referenced historical record version.

POST `/api/business/cases/{case}/reports` accepts `fact_set_id`, a registered
`template_id`, `format`, and a stable `idempotency_key`:

| Template | Meaning | Formats |
| --- | --- | --- |
| `research.brief.v1` | Question summary; declared answer/quote excerpts | HTML, Markdown, DOCX, PDF, XLSX |
| `research.full.v1` | Full answers, fixed-version facts and source quotes | HTML, Markdown, DOCX, PDF, XLSX |
| `research.relationships.v1` | Declared relations, fixed endpoint identities, effective times, evidence and gaps | HTML, Markdown, DOCX, PDF, XLSX |

HTML/Markdown return an actual saved report immediately. Office formats return a
`research.report.v1` job with `file_ready:false`. Poll
`GET /api/business/jobs/{job}`. Only `succeeded` with `artifact.report_id` represents
a completed file. `business_report_render` and `business_job_status` expose the
same flow to an explicitly configured Agent. A failed or cancelled logical request
keeps its idempotent result; an intentional new attempt uses a new key.

The “事实集与报告” panel exposes the three templates, asynchronous progress,
cancellation and authenticated downloads. It does not show a download button for
queued, running, cancelled, failed or source-blocked jobs. A subsequent click after
a confirmed failure creates a new logical attempt. Ambiguous transport retries keep
the original key. Completed report bytes are never regenerated on download.

Every read rechecks active employee/owner/case and current source permissions.
Model-written records also retain their generating Run's source dependencies,
including uncited candidates; a later query Run inherits those dependencies.
Referenced record versions retain the same checks. Revoking a shared source blocks
old fact sets, job receipts, derived results and report downloads. There are no
public file URLs. Historical quality remains a snapshot, not a current pass.

## Worker and file boundaries

Install the root project's locked dependencies and run the existing dedicated Node
Worker. `docx`, `exceljs`, `pdf-lib`, and `@pdf-lib/fontkit` are declared project
dependencies. Codex's bundled artifact libraries are used only for local QA.

Office rendering uses one child at a time per Worker, a 384 MiB V8 heap and a
90-second timeout. The child receives a frozen snapshot and server-generated
document text/hash. Its environment omits Worker/provider credentials. The main
Worker checks returned byte count and binary SHA256 before completion. Rendering
continues alongside interactive advancement; `--once` awaits one report operation.
Worker shutdown terminates its renderer; an abandoned lease can be reclaimed.
Employee cancellation immediately fences file commit. An already running local
render may continue until it returns or reaches the 90-second child timeout.

The server leases for 180 seconds, permits at most three attempts within one hour,
and checks lease token, owner activity, sources and frozen/document hashes again
inside the final transaction. File insertion and successful job receipt commit
together. Cancellation, stale leases and revoked sources cannot commit a file.
Do not run multiple memory-heavy Workers without resource sizing.

Files are capped at 12 MiB. Binary content is stored as canonical base64;
`content_hash` uses the explicitly labelled `base64_utf8_sha256` storage hash.
`manifest.binary_sha256` is the actual file-byte hash verified by the Node Worker.
Downloads decode to bytes; no UTF-8 conversion touches the binary file. MIME,
attachment filename, `nosniff`, `no-store` and HTML sandbox headers are set.

PDFs embed a subset of a local operator-controlled font. Set
`AGENT_STUDIO_REPORT_FONT` on the Node Worker to an installed TTF/OTF/TTC with the
required characters. The font is limited to 32 MiB and is never selected by a
model-supplied path. Defaults search Microsoft YaHei on Windows and Noto Sans CJK
on Linux, with a Latin DejaVu fallback. Missing fonts/glyphs fail explicitly;
right-to-left layout is unsupported. Chinese/English horizontal text is tested.
No font binary is committed or downloaded as a report-generation dependency.

DOCX uses flowing Letter pages, body text and page-number footers. Client font
availability still affects DOCX display. XLSX contains frozen values on
“问题与答案”, “事实与关系”, and “证据定位”; it carries fixed-version payloads and
per-record source mappings. Long cells use continuation rows. No formulas,
external links, macros or embedded scripts are generated. It is a review workbook,
not a financial calculation model or a promise of identical printed pagination.

## Relationship scope and remaining acceptance

`research.relation.v1` binds two distinct entities in the same owned case to their
actual versions. Supported relations require confirmed endpoints and source
evidence. The registered relationship validator checks endpoint versions,
identity, time and append-only human review. Missing end time means unknown end;
it never proves that someone left an organization. Declared introduction records
do not establish real-world willingness or ability to introduce anyone.
Report and workbook labels distinguish question-record quality from
relationship-record quality; `manifest.quality_scope` records that boundary.

Strict paths, independent-source criteria, identity merge/split governance and
domain-event reasoning remain open. Free-text report quality is `unverified` even
when structured records pass. The capability plan keeps office reports at
`configuration_required` until deployment prerequisites are checked; code presence
does not certify the operator's running environment.

Local automated tests verify three templates × five formats (including nine office
files parsed after download), Chinese text
readback, actual byte hashes/MIME, per-record source mappings, Unicode continuation,
formula-like literals, missing fonts, owner/source denial, cancellation, expired
lease recovery and immutable historical bytes. PDF pages and read-only worksheet
views were visually inspected. Native DOCX page QA is still pending: the bundled
renderer requires LibreOffice, which is absent on this Windows host; the attempted
official temporary package download did not complete. The bundled spreadsheet PNG
renderer also terminated natively, so worksheet QA used saved OOXML cell values,
sizes, merges and styles in a Chrome view. Native Office print QA, larger/complex
documents, real employee export UAT, retention/storage governance and production
readiness are not certified by these tests.
