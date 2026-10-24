// Pure validation shared by the private RPC and model transports. Bounds count Unicode
// codepoints and separately limit the serialized evidence's UTF-8 bytes.
export interface ModelKnowledgeEvidence {citation:string;snippet:string}
export const modelKnowledgeEvidenceLimits=Object.freeze({items:6,citation:200,snippet:320,bytes:14336})
function refuse():never{throw Error("invalid_model_knowledge_evidence")}
function characters(value:string):number{
  let count=0
  for(const point of value){
    const code=point.codePointAt(0)!
    if(code>=0xd800&&code<=0xdfff)refuse()
    count++
  }
  return count
}
export function safeModelKnowledgeEvidence(raw:unknown):ModelKnowledgeEvidence[]|undefined{
  if(raw===undefined)return undefined
  if(!Array.isArray(raw)||raw.length>modelKnowledgeEvidenceLimits.items)refuse()
  const result=raw.map(value=>{
    if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).length!==2||!Object.hasOwn(value,"citation")||!Object.hasOwn(value,"snippet")||
       typeof value.citation!=="string"||typeof value.snippet!=="string")refuse()
    const citation=characters(value.citation),snippet=characters(value.snippet)
    if(citation<1||citation>modelKnowledgeEvidenceLimits.citation||snippet<1||snippet>modelKnowledgeEvidenceLimits.snippet||
       /[\u0000-\u001f\u007f]/u.test(value.citation)||/[\u0000\u007f]/u.test(value.snippet))refuse()
    return {citation:value.citation,snippet:value.snippet}
  })
  if(new TextEncoder().encode(JSON.stringify(result)).byteLength>modelKnowledgeEvidenceLimits.bytes)refuse()
  return result
}
