import type {DescriptivePatchOperatorJournal} from './agent-descriptive-patch-operator-core.ts'
export type DescriptivePatchOperatorJson=null|boolean|number|string|readonly DescriptivePatchOperatorJson[]|{readonly [key:string]:DescriptivePatchOperatorJson}
export type DescriptivePatchOperatorCliConfig=Readonly<{
  mode:'plan';expected_source_sha256:string
}>|Readonly<{
  mode:'preflight'|'apply'|'recover';expected_source_sha256:string
  files:Readonly<Record<'APPROVAL_FILE'|'PREDECESSOR_APPROVAL_FILE'|'BACKUP_MANIFEST_FILE'|'BACKUP_ARCHIVE_FILE'|'RESTORE_EVIDENCE_FILE'|'ADMIN_PASSWORD_FILE'|'RUNTIME_MANIFEST_FILE',string>>
  approval_sha256:string;predecessor_approval_sha256:string;admin_password_sha256:string
  runtime_manifest_sha256:string;runtime_lock_sha256:string
  journal_file?:string;journal_sha256?:string
}>
export type DescriptivePatchOperatorFileMetadata=Readonly<{
  type:'file'|'directory'|'other';symlink:boolean;uid:number;gid:number;mode:number;nlink:number;size:number
}>
// Host arguments model the pure argument policy only. Actual IO and run use
// real Linux UID/GID and the fixed module root; operational env substitution refuses.
export function parseDescriptivePatchOperatorCliArguments(argv:readonly string[],env?:Readonly<Record<string,string|undefined>>,platform?:NodeJS.Platform,uid?:number,gid?:number):DescriptivePatchOperatorCliConfig
export function assertDescriptivePatchOperatorExternalPath(file:string,projectRoot:string):void
export function assertDescriptivePatchOperatorFileMetadata(metadata:DescriptivePatchOperatorFileMetadata,kind:'directory'|'private-directory'|'private-file'|'journal-file'|'source-file',maxBytes?:number):void
export function parseDescriptivePatchOperatorJson(raw:string|Uint8Array):DescriptivePatchOperatorJson
export function formatDescriptivePatchOperatorJournalLine(record:DescriptivePatchOperatorJournal,sequence:number,previousSha256:string):Readonly<{line:string;sha256:string}>
export function parseDescriptivePatchOperatorJournalFile(raw:string|Uint8Array,bindingSha256:string):Readonly<{
  records:readonly DescriptivePatchOperatorJournal[];sha256:string;last_entry_sha256:string
}>
export function runDescriptivePatchOperatorCli(argv:readonly string[],env?:NodeJS.ProcessEnv):Promise<Readonly<Record<string,unknown>>>
