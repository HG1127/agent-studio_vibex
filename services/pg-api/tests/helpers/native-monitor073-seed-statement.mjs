// Test-only deterministic SQL statement builder. No driver, connection, SQL
// execution, fixture opener or runtime permission. Only the five reviewed
// metadata plan tables may be seeded; read receipts must come from real ACKs.
import {nativeMonitorTables} from '../../src/native-monitor-inbox-schema.ts'
const seedNames=new Set(['native_monitor_imports','native_monitor_cases','native_monitor_monitors','native_monitor_checks','native_monitor_events'])
const tables=new Map(nativeMonitorTables.filter(t=>seedNames.has(t.name)).map(t=>[t.name,t]))
function record(raw,code){
 if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw Error(code)
 const descriptors=Object.getOwnPropertyDescriptors(raw)
 if(Reflect.ownKeys(raw).some(k=>typeof k!=='string'||!descriptors[k]?.enumerable||!Object.hasOwn(descriptors[k],'value')))throw Error(code)
 return descriptors
}
export function nativeMonitor073SeedStatement(row){
 const entry=record(row,'monitor073_seed_table')
 if(Reflect.ownKeys(row).length!==2||!entry.table||!entry.value||typeof entry.table.value!=='string')throw Error('monitor073_seed_table')
 const table=tables.get(entry.table.value)
 if(!table||!/^[a-z_][a-z0-9_]*$/.test(table.name))throw Error('monitor073_seed_table')
 const value=entry.value.value,fields=record(value,'monitor073_seed_column'),columns=table.columns.map(c=>c.name)
 if(Reflect.ownKeys(value).length!==columns.length||columns.some(k=>!/^[a-z_][a-z0-9_]*$/.test(k)||!Object.hasOwn(fields,k))||Object.keys(fields).some(k=>!columns.includes(k)))throw Error('monitor073_seed_column')
 return{text:'INSERT INTO agentstudio.'+table.name+'('+columns.join(',')+') VALUES('+columns.map((_,i)=>'$'+(i+1)).join(',')+')',values:columns.map(k=>fields[k].value)}
}
