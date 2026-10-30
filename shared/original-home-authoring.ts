/** Original Home presentation/requirements only; never an execution grant. */
export type OriginalHomeAuthoring=Readonly<{
  format:'agentstudio.home-authoring.v1'
  source:'create'|'template'
  template_key:string
  tool_requirements:readonly string[]
}>

function invalid():never{throw Error('invalid_original_home_authoring')}
export function parseOriginalHomeAuthoring(raw:unknown):OriginalHomeAuthoring{
  if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))invalid()
  const descriptors=Object.getOwnPropertyDescriptors(raw),keys=['format','source','template_key','tool_requirements']
  if(Reflect.ownKeys(raw).length!==keys.length||keys.some(k=>!descriptors[k]?.enumerable||!Object.hasOwn(descriptors[k],'value')))invalid()
  const format=descriptors.format?.value,source=descriptors.source?.value,templateKey=descriptors.template_key?.value,tools=descriptors.tool_requirements?.value
  if(format!=='agentstudio.home-authoring.v1'||source!=='create'&&source!=='template'||typeof templateKey!=='string'||templateKey.length>120||/[\u0000-\u001f\u007f]/.test(templateKey)||templateKey!==templateKey.trim()||source==='create'&&templateKey!==''||source==='template'&&!templateKey)invalid()
  if(!Array.isArray(tools)||tools.length>20||Reflect.ownKeys(tools).length!==tools.length+1)invalid()
  const names:string[]=[]
  for(let i=0;i<tools.length;i++){
    const d=Object.getOwnPropertyDescriptor(tools,String(i))
    if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||!d.value.trim()||d.value.length>300||/[\u0000-\u001f\u007f]/.test(d.value))invalid()
    names.push(d.value)
  }
  return Object.freeze({format,source,template_key:templateKey,tool_requirements:Object.freeze(names)})
}
