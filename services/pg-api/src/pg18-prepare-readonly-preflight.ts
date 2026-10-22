#!/usr/bin/env node
// One-shot PREPARE readonly preflight. No Worker serve mode or model calls.
import {runPg18NativeWorkerReadonlyPreflight} from "./pg18-native-worker-readonly.ts"
if(process.argv.length===3&&process.argv[2]==="--preflight"){
  void runPg18NativeWorkerReadonlyPreflight("prepare").catch(()=>{
    process.stderr.write("PG18_PREPARE_READONLY_PREFLIGHT_REFUSED\n")
    process.exitCode=3
  })
}else{
  process.stderr.write("PG18_PREPARE_PREFLIGHT_EXPLICIT_MODE_REQUIRED\n")
  process.exitCode=2
}
