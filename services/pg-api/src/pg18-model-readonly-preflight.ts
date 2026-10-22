#!/usr/bin/env node
// One-shot MODEL readonly preflight; no model provider, queue or serve mode.
import {runPg18NativeWorkerReadonlyPreflight} from "./pg18-native-worker-readonly.ts"
if(process.argv.length===3&&process.argv[2]==="--preflight"){
  void runPg18NativeWorkerReadonlyPreflight("model").catch(()=>{
    process.stderr.write("PG18_MODEL_READONLY_PREFLIGHT_REFUSED\n")
    process.exitCode=3
  })
}else{
  process.stderr.write("PG18_MODEL_PREFLIGHT_EXPLICIT_MODE_REQUIRED\n")
  process.exitCode=2
}
