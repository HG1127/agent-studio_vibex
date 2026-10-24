import {useState,type FormEvent} from "react"

export type PgConfigEditTarget={
  kind:"agents"|"workflows"|"knowledge"
  id:string
  revision:number
  name:string
  detail:string
}
const field="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
export default function PgConfigRecordEditor({
  target,busy,onSave,onCancel,
}:{
  target:PgConfigEditTarget
  busy:boolean
  onSave:(name:string,detail:string)=>Promise<void>
  onCancel:()=>void
}){
  const [name,setName]=useState(target.name)
  const [detail,setDetail]=useState(target.detail)
  const wantsDetail=target.kind!=="workflows"
  const submit=(event:FormEvent)=>{
    event.preventDefault()
    if(busy||!name.trim()||(wantsDetail&&target.kind==="agents"&&!detail.trim()))
      return
    void onSave(name.trim(),detail.trim())
  }
  return <section className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="mb-4">
      <h2 className="font-semibold">编辑已保存配置</h2>
      <p className="mt-1 text-xs text-slate-500">
        基于修订版本 {target.revision} 更新自己的记录，冲突时不会覆盖其他更改。
      </p>
    </div>
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1 text-sm font-medium">
        配置名称
        <input autoFocus required maxLength={120} className={field}
          value={name} onChange={event=>setName(event.target.value)}/>
      </label>
      {wantsDetail&&<label className="block space-y-1 text-sm font-medium">
        {target.kind==="agents"?"Agent 目标":"知识库简介"}
        <textarea required={target.kind==="agents"}
          maxLength={target.kind==="agents"?3000:1000} rows={3}
          className={field} value={detail}
          onChange={event=>setDetail(event.target.value)}/>
      </label>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          保存修改
        </button>
        <button type="button" disabled={busy} onClick={onCancel}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700">
          取消
        </button>
      </div>
    </form>
  </section>
}
