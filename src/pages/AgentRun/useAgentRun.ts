// Static build selection: Native never invokes the PocketBase hook or browser tick.
export * from './usePocketBaseAgentRun.ts'
import {usePocketBaseAgentRun} from './usePocketBaseAgentRun.ts'
import {usePgOriginalAgentRun} from './usePgOriginalAgentRun.ts'
export const useAgentRun=import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true'?usePgOriginalAgentRun:usePocketBaseAgentRun
