// Synthetic administrator-configured MCP process, used only by the guarded CI
// child CLI. It never reads a credential, network endpoint or arbitrary path.
import {Server} from '@modelcontextprotocol/sdk/server/index.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
const [work,gate]=process.argv.slice(2)
if(process.platform!=='linux'||!path.isAbsolute(work??'')||!path.isAbsolute(gate??'')||!path.basename(path.dirname(work)).startsWith('native-local-cli-genuine-')||!path.basename(gate).startsWith('credentials-native-ci-'))throw Error('synthetic_mcp_fixture_scope_required')
process.stdin.once('end',()=>process.exit(0))
const server=new Server({name:'native-local-ci-gated',version:'1.0.0'},{capabilities:{tools:{}}})
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{name:'commit_once',description:'Synthetic CI gate; fixed new-only file, no arbitrary execution',inputSchema:{type:'object',additionalProperties:false,properties:{label:{type:'string'}},required:['label']}}]}))
server.setRequestHandler(CallToolRequestSchema,async request=>{
 if(request.params.name!=='commit_once'||typeof request.params.arguments?.label!=='string')throw Error('synthetic_tool_denied')
 await fs.writeFile(gate+'.entered',String(process.pid),{flag:'wx',mode:0o600})
 const until=Date.now()+30000
 while(Date.now()<until){try{await fs.access(gate);const file=path.join(work,'gated-once.txt');await fs.writeFile(file,'synthetic-gated-effect',{flag:'wx'});return{content:[{type:'text',text:'Synthetic fixed file created'}]}}catch(e){if(e.code!=='ENOENT')throw e}await delay(100)}
 throw Error('synthetic_gate_timeout')
})
await server.connect(new StdioServerTransport())
