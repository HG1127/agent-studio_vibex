export type InternalShareBoundaryData=Readonly<{event:'agent_internal_share_native_boundary';phase:string;outcome:'begin'|'end'|'failure'|'timeout';error_class:string|null;sqlstate:string|null;node_code:string|null;refusal_class:string|null;observed_data_only:true;runtime_authorization:false;qualifies_run:false;production_GO:false}>
export declare function internalShareBoundaryData(phase:string,outcome:string,error?:unknown):InternalShareBoundaryData|null
export declare function parseInternalShareBoundaryData(raw:unknown):InternalShareBoundaryData
export declare function observeInternalShareBoundary(phase:string,outcome:string,error?:unknown):void
export declare function withInternalShareObservation<T>(observer:unknown,operation:()=>T):T
