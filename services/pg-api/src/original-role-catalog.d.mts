import type {SqlClient} from './contracts.ts'
export const originalRoleCatalogSQL:string
export function assertOriginalRoleCatalog(raw:unknown,options?:{purpose:'startup'|'transaction'}):Readonly<{database_oid:string;source_sha256:string}>
export function verifyOriginalRoleCatalog(db:SqlClient,options?:{purpose:'startup'|'transaction'}):Promise<Readonly<{database_oid:string;source_sha256:string}>>
