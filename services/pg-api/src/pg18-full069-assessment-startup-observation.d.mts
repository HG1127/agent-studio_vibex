export declare const assessmentStartupDiagnosticPurpose:'OBSERVE_DISPOSABLE_ORIGINAL_ASSESSMENT_STARTUP_ONLY'
export type AssessmentStartupPhase='configuration'|'credential_read'|'tls_validation'|'pg_import'|'pool_create'|'operator_audit'|'design_audit_import'|'design_pool_create'|'design_operator_audit'|'worker_import'|'client_construct'|'heartbeat_open'|'worker_construct'|'design_worker_import'|'design_client_construct'|'design_worker_construct'|'startup_publish'|'loop_start'|'cli_entry'
export type AssessmentStartupFailureData=Readonly<{event:'full069_assessment_worker_startup_failure';entry:'assessment';phase:AssessmentStartupPhase;refusal_class:string;error_class:'Error'|'TypeError'|'RangeError'|'SyntaxError'|'ReferenceError'|null;sqlstate:string|null;error_code:string|null;observed_data_only:true;runtime_authorization:false;qualifies_run:false;production_GO:false}>
export declare function assessmentStartupDiagnosticEntry(env:unknown,platform:string,uid:number|undefined,nodeMajor:string,argv:unknown,execArgv:unknown):'assessment'|null
export declare function assessmentStartupFailureData(phase:string,error:unknown):AssessmentStartupFailureData|null
export declare function parseAssessmentStartupFailureData(raw:unknown):AssessmentStartupFailureData
export declare function reportAssessmentStartupFailure(phase:string,error:unknown):void
