// Explicit standalone Agent CLI. Shared module import cannot start a Worker.
import {runV2WorkerCli} from "./workflow-v2-worker-loop.ts"
runV2WorkerCli(true)
