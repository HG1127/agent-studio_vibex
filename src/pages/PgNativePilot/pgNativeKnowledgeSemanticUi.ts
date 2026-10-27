export const semanticButton="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium disabled:opacity-40"
export const semanticField="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-sm disabled:opacity-40"
export function semanticError(error:unknown){
  const e=error as {status?:number;code?:string}
  if(e?.status===401)return "员工登录已失效，请重新登录。"
  if(e?.code==="shared_semantic_incompatible")return "部分共享知识库未允许语义查询，或模型不兼容。请核对共享权限，或选择关键词模式。"
  if(e?.code==="embedding_not_indexed")return "尚无可用语义索引，请由所有者先完成索引，或选择关键词模式。"
  if(e?.status===403||e?.status===404)return "当前授权已变化，或所选知识库不再可用。请刷新当前状态。"
  if(e?.status===409)return "模型、授权或内容版本已变化，请刷新后重新确认。"
  if(e?.status===429)return "请求过于频繁或待处理查询过多，请稍后核对状态。"
  if(e?.status===400)return "请检查所选模型、服务地址、知识库和查询内容。"
  return "请求结果尚未确认，请核对回执后继续。"
}
