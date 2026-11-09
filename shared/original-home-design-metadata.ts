/** Local provenance/tool descriptions only. This never grants model/tool access. */
export type OriginalHomeDesignMetadata=Readonly<{request_id:string;tool_requirements:readonly string[]}>
export function normalizeOriginalHomeDesignMetadata(raw:unknown):OriginalHomeDesignMetadata{
 const invalid=():never=>{throw Error('invalid_original_home_design_metadata')}
 if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
 const keys=Reflect.ownKeys(raw),descriptors=Object.getOwnPropertyDescriptors(raw)
 if(keys.length!==2||keys.some(key=>typeof key!=='string'||!['request_id','tool_requirements'].includes(key)))return invalid()
 for(const key of ['request_id','tool_requirements'])if(!descriptors[key]?.enumerable||!Object.hasOwn(descriptors[key]!,'value'))return invalid()
 const id=descriptors.request_id!.value,rawTools=descriptors.tool_requirements!.value
 if(typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)||!Array.isArray(rawTools)||Object.getPrototypeOf(rawTools)!==Array.prototype||rawTools.length>20||Reflect.ownKeys(rawTools).length!==rawTools.length+1)return invalid()
 const tools:string[]=[]
 for(let i=0;i<rawTools.length;i++){const d=Object.getOwnPropertyDescriptor(rawTools,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='string'||!d.value.trim()||d.value.length>300||/[\u0000-\u001f\u007f]/.test(d.value))return invalid();tools.push(d.value)}
 return Object.freeze({request_id:id,tool_requirements:Object.freeze(tools)})
}
