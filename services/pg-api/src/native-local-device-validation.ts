import {HttpError,type SqlClient} from './contracts.ts'
import {validateMcpArguments} from './mcp-validation.ts'
import {parseLocalDevice,type LocalInput} from '../../../shared/native-local-device-contract.mjs'
export async function validateNativeLocalArguments(db:SqlClient,id:string,input:LocalInput){
 const raw=(await db.query<{value:unknown}>('SELECT agentstudio.native_local_list() AS value')).rows[0]?.value
 if(!Array.isArray(raw))throw Error('native_local_invalid_projection');const device=raw.map(parseLocalDevice).find(d=>d.id===id),tool=device?.catalog.find(t=>t.name===input.tool)
 if(!device||device.revoked||!tool)throw new HttpError(409,'native_local_tool_unavailable')
 if(!await validateMcpArguments({name:tool.name,description:tool.description,input_schema:tool.inputSchema,read_only:false,destructive:true,requires_tasks:false},input.arguments))throw new HttpError(400,'invalid_native_local_device_value')
}
