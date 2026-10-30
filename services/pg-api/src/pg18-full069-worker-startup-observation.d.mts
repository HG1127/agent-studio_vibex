export declare const workerStartupDiagnosticPurpose: 'OBSERVE_DISPOSABLE_ORIGINAL_FIVE_WORKER_STARTUP_ONLY'
export type WorkerStartupEntry = 'prepare' | 'model' | 'workflow_safe' | 'workflow_v2' | 'agent_autonomous'
export type WorkerStartupFailureData = Readonly<{
 event: 'full069_original_worker_startup_failure'; entry: WorkerStartupEntry; phase: string
 error_class: 'Error' | 'TypeError' | 'RangeError' | 'SyntaxError' | 'ReferenceError' | null
 sqlstate: string | null; error_code: string | null; observed_data_only: true
 runtime_authorization: false; qualifies_run: false; production_GO: false
}>
export declare function workerStartupDiagnosticEntry(env: NodeJS.ProcessEnv, platform: string, uid: number | undefined, nodeMajor: string, argv: string[], execArgv: string[]): WorkerStartupEntry | null
export declare function workerStartupFailureData(entry: string, phase: string, error: unknown): WorkerStartupFailureData | null
export declare function parseWorkerStartupFailureData(raw: unknown): WorkerStartupFailureData
export declare function reportWorkerStartupFailure(phase: string, error: unknown): void
