# Historical Workflow sample provenance (SQL043)

This is isolated migration source. PocketBase remains the current runtime and
production cutover remains NO-GO. Old data may be discarded; authorization,
functional parity and operational acceptance still apply.

The existing historical-output checkbox now sends the owned source run,
Workflow revision, exact output version and only the fields automatically
reused. Manual task input, per-node overrides and loop samples remain manual.
Overriding every automatic field produces an explicit manual request. Historical
samples are checked against a fresh server reconstruction, never a client graph.

SQL043 follows SQL042. A private NOLOGIN role records one immutable target debug
digest and the original source-state digest. It has SELECT/INSERT only on the
forced-RLS provenance ledger, no raw business-table, credential or vector grants.
The ledger duplicates no prompt, sample output, key, lease or evidence text.
Capture locks the owned source until the target transaction commits; a missing
or mismatching registration rolls the transaction back.

The existing knowledge observation gate also checks this lineage at approval,
Worker transitions, private dispatch before and after credential loading,
provider return, and public reads. Each source keeps its own semantic/keyword
evidence checks. Chains stop after eight runs and reject cycles. Source output,
instruction or original evidence changes make dependent runs unavailable;
regranting access does not resurrect an older grant version. Ordinary manual
Workflow input stays independent. Debug tasks without an original proof fail
closed after SQL043, including legacy records.

Unavailable debug tasks hide inherited instruction, result, step output,
citations and pending approval. List previews and idempotent replay use the same
checks. Output views clear cached samples on hide and before refresh; prepared
historical drafts clear when the source disappears or changes. An uncertain
submission retains its frozen request for exact recovery, while its historical
text stays hidden until its source is freshly available. The server checks the
original proof before admitting a new task or confirming an old one.

Native API, bound Broker, native model Worker and V2 Worker startup/preflight
require the reviewed SQL043 schema and private privilege audit. Old, wholly
unmigrated isolated stages retain their pre-SQL043 manual debug tests; partial
installations refuse. Review-only bundles include the catalog audit, never an
installed service or secret. Their manifests contain 24 and 21 files.

Embedded SQL/private mTLS tests cover exact versions and text, owner isolation,
manual overrides, missing proofs, source edits, revoke/regrant, bounded multi-run
chains, credential and provider races, public redaction and privilege drift.
Hosted PG18 adds Native Cookie, separate restricted logins and reader-owned
private dispatch; browser CI covers historical preparation, lost-response
recovery, cache clearing and source-change redaction. Exact-commit outcomes must
be checked in draft PR26 before accepting this increment.

Remaining migration work includes schedule/collaboration/administration parity,
an authoritative fresh-init sequence and migration map, employee UAT, target
network/access checks, sustained OS Worker operation, actual backup/restore and
rollback rehearsal, and signed GO/NO-GO acceptance. Synthetic CI alone does not
complete those conditions.
