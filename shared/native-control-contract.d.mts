export const nativeControlOwnerRoute:string
export const nativeControlExecutorRoute:string
export type ControlAction='sites-save'|'file-pick'|'grant-save'|'grant-edit'
export type ControlStatus='queued'|'running'|'committing'|'succeeded'|'failed'|'cancelled'|'expired'|'unknown'
export const nativeControlActions:readonly ControlAction[]
export const nativeControlStatuses:readonly ControlStatus[]
export type ControlCapabilities={edit:boolean;move:boolean;delete:boolean;open:boolean}
export type ControlPayload={permission_revision:string;origins?:string[];kind?:'file'|'folder';grant_id?:string;read_only?:boolean;capabilities?:ControlCapabilities;root_id?:string;remove?:true}
export type ControlIntent={kind:'create';request_id:string;confirm:true;device_id:string;action:ControlAction;payload:ControlPayload}|{kind:'cancel';request_id:string;confirm:true;id:string}
export type ControlReceipt={receipt:{request_id:string;request_sha256:string;kind:'create'|'cancel';id:string;device_id:string;action:ControlAction};replayed:boolean}
export type ControlSummary={protocol:'permissions-v2';version:string;revision:string;applied_revision:string;sites:string[];grants:{id:string;label:string;kind:'file'|'folder';read_only:boolean;capabilities:ControlCapabilities}[];state:'online'|'applying'|'needs-check'}
export type OwnerControlSummary={available:boolean;device_id:string;seen_ms:number}&Partial<ControlSummary>&{reason?:string}
export type ControlRow={id:string;device_id:string;action:ControlAction;status:ControlStatus;result:string;error:string;created_ms:number;deadline_ms:number}
export type ControlDispatch={id:string;action:ControlAction;payload:ControlPayload;claim:string;deadline_ms:number}
export function controlOrigins(raw:unknown):string[]
export function controlCapabilities(raw:unknown,readOnly?:boolean):ControlCapabilities
export function controlPayload(action:unknown,raw:unknown):ControlPayload
export function controlIntent(raw:unknown):ControlIntent
export function controlReceipt(raw:unknown,original:unknown):Promise<ControlReceipt>
export function controlSummary(raw:unknown):ControlSummary
export function ownerControlSummary(raw:unknown,id:string):OwnerControlSummary
export function controlReady(raw:unknown,now?:number):boolean
export function controlRow(raw:unknown,id:string):ControlRow
export function controlDispatch(raw:unknown):ControlDispatch
export function controlDeviceInput(operation:unknown,raw:unknown):unknown
