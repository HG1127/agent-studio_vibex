import type {CompleteProfileSnapshot} from './pg18-complete-profile-source.mjs'
import type {CompleteProfileTarget} from './pg18-complete-profile.ts'
export type EmployeeUi078Step=Readonly<{path:string;version:string;sha256:string;sql:string}>
export type EmployeeUi078Snapshot=Readonly<{
 base:CompleteProfileSnapshot;source_sha256:string;manifest:Readonly<{profile:'complete069-employee-ui078';metadata_interface:Readonly<{signature:string;body_sha256:string}>}>;
 steps:readonly EmployeeUi078Step[];tables:readonly string[];roles:readonly string[];versions:readonly string[];
 literal_ledger:readonly Readonly<{version:string;description:string}>[];base_functions:readonly string[];functions:readonly string[];ledger_rpc_body_sha256:string;
}>
export const employeeUi078Profile:'complete069-employee-ui078'
export const employeeUi078Receipt:'pg18_complete069_employee_ui078_001'
export const employeeUi078CatalogReceipt:'pg18_employee_ui078_catalog_001'
export const employeeUi078SqlPins:readonly Readonly<{path:string;version:string;sha256:string}>[]
export function employeeUi078SqlBody(relative:string,bytes:Buffer):string
export function captureEmployeeUi078Sources():Promise<EmployeeUi078Snapshot>
export function assertEmployeeUi078Snapshot(snapshot:EmployeeUi078Snapshot,expected:string):void
export function assertEmployeeUi078Deployment(snapshot:EmployeeUi078Snapshot,expected:string):void
export function employeeUi078ReceiptBody(snapshot:EmployeeUi078Snapshot,target:CompleteProfileTarget,catalogSha256:string):string
export function employeeUi078Plan(snapshot:EmployeeUi078Snapshot):Readonly<Record<string,unknown>>
