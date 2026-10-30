# Local file action contract — 2026-10-29

The requested tool names and argument names are retained. `capabilities` is always
`{edit:boolean,move:boolean,delete:boolean,open:boolean}`; absent flags default to
false. `readOnly` / `read_only` forbids mutations. File-only scopes permit only
read/stat and explicitly enabled open/reveal of that exact file.

- `files.stat {root,path}` returns JSON `{root,path,size,sha256,directory}`.
  SHA256 is computed only for regular files at most 8 MiB; larger files and
  directories return `sha256:null`. Mutation tools reject larger sources.
- `files.update {root,path,text,expected_sha256}`: at most 64 KiB valid UTF-8
  source and replacement. Requires edit. Returns JSON with exact post-effect
  SHA256 and `recovery_id` after verification.
- `files.mkdir {root,path}` and `files.copy {root,path,destination}` require
  create (a non-readOnly folder grant). Copy is one regular file, at most 8 MiB.
- `files.move {root,path,destination,expected_sha256}`: one regular file within
  the same root, exclusive destination, requires move.
- `files.trash {root,path,expected_sha256}` requires delete. Returns JSON
  `{trash_id,root,path,size,sha256,...}`. No directory move/deletion.
- `files.trash_list {root}` returns JSON `{entries:[{trash_id,path,size,
  created_at,sha256}],truncated}` (up to 40 entries).
- `files.restore {root,trash_id}` requires delete plus create, restores only
  the validated original relative path without overwrite.
- `files.open {root,path}` / `files.reveal {root,path}` require open. Open uses
  a conservative inert extension allowlist and fixed Windows Explorer invocation;
  it opens on the connected PC, not inside the workbench. Reveal selects a file
  on that PC. Neither operation permits directories or arbitrary applications.

All file schemas reject unknown fields, enumerate eligible root IDs, and carry
`x-studio-permission-revision` when configured. Results remain within the existing
12,000 character limit. Sources/destinations inside the hidden protected
`.agent-studio-trash` vault cannot be accessed using generic tools. Updates also
retain originals in this vault; trash_list contains deletions only. Recovery
receipts distinguish completed effects from interrupted/uncertain operations;
clients must not automatically retry a mutation after an uncertain result.

Editor integration constraint: the existing `files.read` API still returns at
most 12,000 characters (and UTF-8 decoding can remove a BOM). Before enabling an
editor hydrated from that response, the host must check that SHA256 of its exact
UTF-8 text equals `files.stat.sha256`; otherwise show a bounded preview and refuse
to save it as the whole original. The 64 KiB update limit also permits an explicit
complete replacement supplied by the user. This preserves the old read/output
contract without silently turning a truncated preview into a destructive edit.
`files.list` and `trash_list` reduce the entry count if necessary to return valid
bounded JSON, setting `truncated:true`.

Workbench summaries and grant-save/grant-edit payloads carry `capabilities`.
An edit of an existing grant must explicitly include all four flags; unsupported
older connectors reject that payload rather than silently dropping it. Native
confirmation remains required before any permission change. A changed revision
invalidates jobs created under an older revision.

No claim of isolation against hostile external OS races: the connector serializes
its own mutations, checks links/hardlinks and revalidates parents immediately
before effects. Full browser UI/integration/packaging is owned by the host.
