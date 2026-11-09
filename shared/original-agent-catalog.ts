import type {OriginalHomeAuthoring} from './original-home-authoring.ts'

export const originalAgentCatalogSorts=['updated_desc','created_desc','name_asc','name_desc','favorite_desc'] as const
export type OriginalAgentCatalogSort=typeof originalAgentCatalogSorts[number]
export type OriginalAgentCatalogQuery=Readonly<{
 page:number;perPage:number;q:string;source:'all'|'create'|'template';favorite:boolean;sort:OriginalAgentCatalogSort
}>
export type OriginalAgentCatalogRow={
 id:string;owner_user_id:string;name:string;spec:Record<string,unknown>;revision:number
 created_at:string;updated_at:string;authoring:OriginalHomeAuthoring|null;favorite:boolean
}
export type OriginalAgentCatalogPage={items:OriginalAgentCatalogRow[];totalItems:number;page:number;totalPages:number;perPage:number}
/** revision is the unchanged real Agent spec revision, never a bookmark revision. */
export type OriginalAgentCatalogFavorite={agent_spec_id:string;favorite:boolean;revision:number}
const invalid=():never=>{throw Error('invalid_original_agent_catalog_query')}
export function parseOriginalAgentCatalogQuery(raw:unknown):OriginalAgentCatalogQuery{
 if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
 const descriptors=Object.getOwnPropertyDescriptors(raw),allowed=['page','perPage','q','source','favorite','sort']
 if(Reflect.ownKeys(raw).some(k=>typeof k!=='string'||!allowed.includes(k)||!descriptors[k]?.enumerable||!Object.hasOwn(descriptors[k],'value')))invalid()
 const value=(key:string,fallback:string):string=>{const d=descriptors[key];if(!d)return fallback;if(typeof d.value!=='string')invalid();return d.value as string}
 const pageText=value('page','1'),sizeText=value('perPage','18'),q=value('q',''),source=value('source','all'),favorite=value('favorite',''),sort=value('sort','updated_desc')
 if(!/^[1-9][0-9]{0,6}$/.test(pageText)||Number(pageText)>1_000_000||!/^[1-9][0-9]?$/.test(sizeText)||Number(sizeText)>50||q.length>100||/[\u0000-\u001f\u007f]/.test(q)||!['all','create','template'].includes(source)||favorite!==''&&favorite!=='1'||Object.hasOwn(descriptors,'favorite')&&favorite!== '1'||!originalAgentCatalogSorts.includes(sort as OriginalAgentCatalogSort))invalid()
 return Object.freeze({page:Number(pageText),perPage:Number(sizeText),q:q.trim(),source:source as OriginalAgentCatalogQuery['source'],favorite:favorite==='1',sort:sort as OriginalAgentCatalogSort})
}
