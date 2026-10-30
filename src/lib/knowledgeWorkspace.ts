export type KnowledgeView='documents'|'search'|'sharing'|'settings'
export function knowledgeView(value:string|null,isOwner:boolean):KnowledgeView{
  if(value==='search'||value==='sharing')return value
  return value==='settings'&&isOwner?'settings':'documents'
}
/** Never replace an explicit unavailable library with another library's data. */
export function selectedKnowledgeId(rows:readonly {id:string}[],requested:string):string{
  return requested?rows.some(row=>row.id===requested)?requested:'':rows[0]?.id||''
}
export function visibleKnowledgeDocuments<T extends {filename:string}>(rows:readonly T[],query:string):T[]{
  const q=query.trim().toLocaleLowerCase()
  return rows.filter(row=>!q||row.filename.toLocaleLowerCase().includes(q))
}
