/** Conservative planning hints, never a substitute for server-side permissions
 * or per-call approval. A contradictory annotation cannot authorize auto-binding. */
const normalize=(text:string)=>String(text||'').normalize('NFKC').toLowerCase().replace(/[\s_.:/、—-]+/g,'')
const actions=/\b(?:send|write|create|update|delete|submit|fill|click|upload|export|remove|edit|execute|exec|rename|move|pay|purchase|post|put|patch|launch|approve|transfer)\b|发送|写入|创建|新增|更新|修改|删除|提交|填写|点击|上传|导出|移动|重命名|执行|付款|支付|转账/i
export function toolLooksMutating(name:string,description=''):boolean {
  const text=(name+' '+description).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_./:-]+/g,' ')
  return actions.test(text)
}
const generic=/^(?:search|list|fetch|query|read|write|create|update|delete|send|post|tool|tools|api|mcp|http|get|extract|v\d+)$/i
export function toolRequirementAliases(name:string,title='',id=''):string[]{
  return [name,title,id,...name.split(/[_./:\s-]+/).filter(term=>term.length>=4&&!generic.test(term))].filter(Boolean)
}
/** Recognize explicit resource denials in the user's request only. Do not let a
 * generated goal or an old selection reverse them. Clause boundaries prevent
 * "do not use Slack; search GitHub" from disabling the requested GitHub tool. */
export function requirementDeniesResource(requirement:string,aliases:string[]):boolean {
  const names=aliases.map(normalize).filter(Boolean)
  for(const clause of String(requirement||'').normalize('NFKC').replace(/[’‘]/g,"'").split(/[\n，,。；;!?！？]/)){
    const denial=/(?:不允许|不需要|不要|不得|不能|禁止|无需|无须|避免|拒绝|不使用|不调用|不访问|不连接|do\s+not|don't|must\s+not|never|without|avoid)/ig
    for(const match of clause.matchAll(denial)){
      let tail=clause.slice(match.index!+match[0].length).split(/但是|但|不过|而是|允许|可以|\bbut\b|\bhowever\b/i)[0].trim()
      tail=tail.replace(/^(?:(?:再|去|主动|自动|使用|调用|访问|连接|接入|启用|通过|任何|use|access|call|invoke|connect\s+to|enable|visit)\s*)+/i,'')
      // An action denial such as "do not delete GitHub issues" must not
      // disable a separate read-only GitHub lookup. Writes never auto-bind.
      if(/^(?:删除|发送|修改|创建|写入|上传|导出|delete\b|send\b|write\b|create\b|update\b|upload\b|export\b)/i.test(tail)){
        if(names.some(name=>normalize(tail)===name))return true
        continue
      }
      const target=normalize(tail)
      if(names.some(name=>target.includes(name)))return true
    }
  }
  return false
}
