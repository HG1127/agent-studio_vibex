import type {SqlClient,SqlPool} from './contracts.ts'
// The implementation freshly audits the selected profile on this same client.
export function verifyEmployeeStaff084ApiClient(db:SqlClient,selected:{profile:string;source_sha256:string;target:{system_identifier:string;database_oid:string}}):Promise<Readonly<{profile:string;quality:boolean}>>
export function inspectEmployeeStaff084StatisticsPool(pool:SqlPool,selected:Parameters<typeof verifyEmployeeStaff084ApiClient>[1]):Promise<'installed'>
