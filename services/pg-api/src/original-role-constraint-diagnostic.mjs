// Failure observations only. Inputs are the ORIGINAL expr() result strings;
// no SQL, expression text or error is parsed, emitted or normalized here.
import {createHash} from 'node:crypto'
const expectedConstraintCount=78,maxBytes=262144,maxDepth=64,maxNodes=16384,maxPath=16
const kinds=Object.freeze({name:'name',string:'string',number:'number',interval:'interval',call:'call',cast:'cast',array:'array','+':'add','-':'subtract','=':'equal','<>':'not_equal','>':'greater','<':'less','>=':'greater_equal','<=':'less_equal','~':'match','!~':'not_match',and:'and',or:'or',in:'in','is-null':'is_null','is-not-null':'is_not_null'})
const missing=Symbol(),hash=v=>createHash('sha256').update(v===missing?'original_role_constraint_ast_missing_v1':JSON.stringify(v)).digest('hex')
function read(value){
 if(value===null)return {value:null}
 if(typeof value!=='string'||value.length>maxBytes||Buffer.byteLength(value,'utf8')>maxBytes)return null
 let root;try{root=JSON.parse(value)}catch{return null}
 let nodes=0
 function list(v,depth){if(!Array.isArray(v)||depth>maxDepth||++nodes>maxNodes)return false;return v.every(item=>node(item,depth+1))}
 function node(v,depth){
  if(depth>maxDepth||++nodes>maxNodes||!Array.isArray(v)||typeof v[0]!=='string'||!Object.hasOwn(kinds,v[0]))return false
  const tag=v[0]
  if(['name','string','number','interval'].includes(tag))return v.length===2&&typeof v[1]==='string'
  if(tag==='call')return v.length===3&&typeof v[1]==='string'&&list(v[2],depth+1)
  if(tag==='cast')return v.length===3&&typeof v[1]==='string'&&node(v[2],depth+1)
  if(tag==='array')return v.slice(1).every(item=>node(item,depth+1))
  if(tag==='in')return v.length===3&&node(v[1],depth+1)&&list(v[2],depth+1)
  if(tag==='is-null'||tag==='is-not-null')return v.length===2&&node(v[1],depth+1)
  if(tag==='and'||tag==='or')return v.length>=3&&v.slice(1).every(item=>node(item,depth+1))
  return v.length===3&&node(v[1],depth+1)&&node(v[2],depth+1)
 }
 return node(root,0)?{value:root}:null
}
function kind(value){
 if(value===missing)return 'missing'
 if(value===null)return 'null'
 if(typeof value==='string')return 'atom'
 if(Array.isArray(value))return typeof value[0]==='string'&&Object.hasOwn(kinds,value[0])?kinds[value[0]]:'list'
 return 'unavailable'
}
function firstDifference(actual,expected,path=[]){
 if(actual===expected)return null
 const a=kind(actual),e=kind(expected)
 if(a!==e||!Array.isArray(actual)||!Array.isArray(expected))return {actual,expected,path,a,e}
 for(let i=0;i<Math.max(actual.length,expected.length);i++){const found=firstDifference(i<actual.length?actual[i]:missing,i<expected.length?expected[i]:missing,[...path,i]);if(found)return found}
 return null
}
export function originalRoleConstraintExpressionDiagnostic(expectedIndex,actualAst,expectedAst){
 try{
  if(!Number.isSafeInteger(expectedIndex)||expectedIndex<0||expectedIndex>=expectedConstraintCount)return null
  const actual=read(actualAst),expected=read(expectedAst);if(!actual||!expected)return null
  const found=firstDifference(actual.value,expected.value);if(!found)return null
  return {expected_constraint_index:expectedIndex,ast_index_path:found.path.slice(0,maxPath),path_truncated:found.path.length>maxPath,actual_node_kind:found.a,expected_node_kind:found.e,actual_node_sha256:hash(found.actual),expected_node_sha256:hash(found.expected)}
 }catch{return null}
}
export function emitOriginalRoleConstraintDifference(expectedIndex,actualAst,expectedAst){
 try{const value=originalRoleConstraintExpressionDiagnostic(expectedIndex,actualAst,expectedAst);if(!value)return;const line='original_role_constraint_expression_diagnostic '+JSON.stringify(value)+'\n';if(line.length<=768)process.stderr.write(line)}catch{}
}
