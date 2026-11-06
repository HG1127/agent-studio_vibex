import type {AgentHttpTool} from './agent-http-tools.ts'
import type {AgentMcpTool} from './mcp-binding.ts'
type Connection={id:string;owner_user_id:string;revision:number;name:string;description:string;enabled:boolean;status:'untested'|'ok'|'error';last_checked_at:string|null}
export type OriginalHomeHttpConnection=Connection&{method:'GET'|'POST';alias:string;binding:AgentHttpTool|null}
export type OriginalHomeMcpConnection=Connection&{catalog_sha256:string|null;tools:{alias:string;tool_name:string;description:string;read_only:boolean;destructive:boolean;binding:AgentMcpTool}[]}
export type OriginalHomeKnowledgeBase={id:string;owner_user_id:string;revision:number;name:string;description:string;created_at:string;updated_at:string;access_role:'owner'|'viewer'|'editor';semantic_allowed:boolean|null;document_count:number;chunk_count:number}
export type OriginalHomeResources={format:'agentstudio.original-home-resources.v1';employee_id:string;knowledge_sharing_enabled:boolean;http_connections:OriginalHomeHttpConnection[];mcp_connections:OriginalHomeMcpConnection[];knowledge_bases:OriginalHomeKnowledgeBase[]}
