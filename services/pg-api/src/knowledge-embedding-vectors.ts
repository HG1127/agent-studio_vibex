// Bound the provider response before accepting any vector into private SQL.
export function unitEmbeddingVector(raw:unknown):number[]{
  if(!Array.isArray(raw)||raw.length<2||raw.length>3072||raw.some(x=>typeof x!=="number"||!Number.isFinite(x)||Math.abs(x)>100000))
    throw Error("invalid_embedding_vector")
  const size=Math.hypot(...raw as number[])
  if(!Number.isFinite(size)||size<1e-8)throw Error("invalid_embedding_vector")
  return (raw as number[]).map(x=>Math.round(x/size*1e7)/1e7)
}
export function safeEmbeddingBatch(raw:unknown,count:number,expectedDimensions:number|null=null):number[][]{
  if(!Number.isSafeInteger(count)||count<1||count>12||!Array.isArray(raw)||raw.length!==count)throw Error("invalid_embedding_batch")
  const result=raw.map(unitEmbeddingVector),dimensions=result[0]!.length
  if(result.some(x=>x.length!==dimensions)||(expectedDimensions!==null&&expectedDimensions!==dimensions))throw Error("embedding_dimensions_changed")
  return result
}
export function embeddingResponse(raw:unknown,count:number,dimensions:number|null):number[][]{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("invalid_embedding_response")
  const data=(raw as {data?:unknown}).data
  if(!Array.isArray(data)||data.length!==count)throw Error("invalid_embedding_response")
  const vectors:unknown[]=new Array(count),seen=new Set<number>()
  for(const item of data){
    if(!item||typeof item!=="object"||Array.isArray(item))throw Error("invalid_embedding_response")
    const {index,embedding}=item as {index?:unknown;embedding?:unknown}
    if(!Number.isSafeInteger(index)||(index as number)<0||(index as number)>=count||seen.has(index as number))throw Error("invalid_embedding_response")
    seen.add(index as number);vectors[index as number]=embedding
  }
  return safeEmbeddingBatch(vectors,count,dimensions)
}
