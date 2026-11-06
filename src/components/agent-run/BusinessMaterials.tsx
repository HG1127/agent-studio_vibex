import {useCallback,useEffect,useRef,useState} from 'react'
import {originalBusinessApi as localApi} from '@/lib/originalBusinessData'

type Material={material_id:string;filename:string;byte_count:number;data_space:string;job_id:string;job_status?:string;job_error?:string;parse:null|{coverage:{extraction_complete:boolean;ocr_performed:boolean;omissions:unknown[];[key:string]:unknown}}}
type Segment={segment_id:string;locator:{page?:number;sheet?:string;cell?:string}}
type Passage={text:string;offset:number;end:number;total_length:number;locator:Segment['locator']}
function location(item:Segment){return item.locator.page?`第 ${item.locator.page} 页`:item.locator.cell?`${item.locator.sheet} · ${item.locator.cell}`:item.segment_id}
function MaterialReader({material}:{material:Material}){
  const [segments,setSegments]=useState<Segment[]>([]),[cursor,setCursor]=useState(0),[more,setMore]=useState(false)
  const [selected,setSelected]=useState(''),[offset,setOffset]=useState('0'),[passage,setPassage]=useState<Passage|null>(null),[error,setError]=useState('')
  const pending=useRef<AbortController|null>(null)
  useEffect(()=>{
    const abort=new AbortController()
    void localApi<{items:Segment[];has_more:boolean}>(`/api/business/materials/${material.material_id}/segments?offset=${cursor}`,undefined,abort.signal)
      .then(value=>{if(!abort.signal.aborted){setSegments(value.items);setMore(value.has_more);setSelected(value.items[0]?.segment_id||'');setOffset('0');setPassage(null);setError('')}})
      .catch(()=>{if(!abort.signal.aborted){setSegments([]);setPassage(null);setError('片段目录不可读取，请检查当前来源权限。')}})
    return ()=>{abort.abort();pending.current?.abort()}
  },[material.material_id,cursor])
  async function read(){
    pending.current?.abort();const abort=new AbortController();pending.current=abort
    setPassage(null);setError('')
    try{const value=await localApi<Passage>(`/api/business/materials/${material.material_id}/read?segment_id=${encodeURIComponent(selected)}&offset=${encodeURIComponent(offset)}&limit=8000`,undefined,abort.signal);if(!abort.signal.aborted)setPassage(value)}
    catch{if(!abort.signal.aborted)setError('片段不可读取：检查范围、解析状态和来源权限。')}
  }
  return <div className="mt-2 space-y-2">
    <label className="block text-xs">原件定位<select className="ml-2 max-w-full rounded border bg-background p-1" value={selected} onChange={e=>{setSelected(e.target.value);setPassage(null);setOffset('0')}}>
      {segments.map(item=><option key={item.segment_id} value={item.segment_id}>{location(item)}</option>)}
    </select></label>
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button type="button" disabled={cursor===0} className="rounded border px-2 py-1" onClick={()=>setCursor(Math.max(0,cursor-50))}>上一批位置</button>
      <button type="button" disabled={!more} className="rounded border px-2 py-1" onClick={()=>setCursor(cursor+50)}>下一批位置</button>
      <label>片段字符起点<input type="number" min={0} className="ml-1 w-24 rounded border bg-background p-1" value={offset} onChange={e=>setOffset(e.target.value)}/></label>
      <button type="button" disabled={!selected} className="rounded border px-2 py-1" onClick={()=>void read()}>读取材料片段</button>
    </div>
    {passage&&<div><p className="text-xs text-muted-foreground">UTF-16 {passage.offset}–{passage.end} / {passage.total_length} · {selected}</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">{passage.text}</pre></div>}
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>
}
export function BusinessMaterials({caseId}:{caseId:string}){
  const [materials,setMaterials]=useState<Material[]>([]),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[version,setVersion]=useState(0)
  const [expanded,setExpanded]=useState('')
  const request=useRef<{file:File;key:string}|null>(null),input=useRef<HTMLInputElement|null>(null)
  const route=`/api/business/cases/${encodeURIComponent(caseId)}/materials`
  const refresh=useCallback(()=>setVersion(v=>v+1),[])
  useEffect(()=>{
    const abort=new AbortController()
    void localApi<{items:Material[]}>(route,undefined,abort.signal).then(value=>{if(!abort.signal.aborted)setMaterials(value.items)})
      .catch(()=>{if(!abort.signal.aborted){setMaterials([]);setError('材料读取未完成，请检查登录与来源权限。')}})
    return ()=>abort.abort()
  },[route,version])
  const pending=materials.some(m=>!m.parse&&(m.job_status==='queued'||m.job_status==='running'))
  useEffect(()=>{if(!pending)return;const timer=window.setInterval(refresh,2000);return ()=>window.clearInterval(timer)},[pending,refresh])
  async function upload(){
    if(!file)return
    if(!file.size||file.size>4194304){setError('请选择 4MiB 以内的非空文件。');return}
    setBusy(true);setError('')
    if(request.current?.file!==file)request.current={file,key:crypto.randomUUID()}
    try{
      const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=()=>reject(Error('file_read_failed'));reader.readAsDataURL(file)})
      await localApi(route,{filename:file.name,base64,idempotency_key:request.current.key})
      request.current=null;setFile(null);if(input.current)input.current.value='';refresh()
    }catch{setError('上传未确认完成；重试沿用同一幂等键。请检查文件格式、登录和权限。')}
    finally{setBusy(false)}
  }
  async function download(material:Material){
    setBusy(true);setError('')
    try{
      const original=await localApi<{base64:string}>(`/api/business/materials/${material.material_id}/original`)
      const binary=atob(original.base64),bytes=new Uint8Array(binary.length)
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i)
      const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),a=document.createElement('a')
      a.href=url;a.download=material.filename;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch{setError('原件当前不可读取，请检查来源权限。')}
    finally{setBusy(false)}
  }
  return <details className="mt-3 rounded border p-3">
    <summary className="cursor-pointer font-medium">原始材料与解析范围</summary>
    <p className="mt-2 text-xs text-muted-foreground">原件私有保存，Worker 后台提取 PDF 文字、DOCX、XLSX 或文本。暂未接入 OCR；图像页、未缓存公式与超限范围会列为遗漏。提取文字不等于整份材料已理解。</p>
    <label className="mt-2 block text-xs">选择原始材料<input ref={input} type="file" accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.tsv" disabled={busy} className="mt-1 block max-w-full" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
    <button type="button" disabled={busy||!file} className="mt-2 rounded border px-3 py-1 text-xs disabled:opacity-50" onClick={()=>void upload()}>上传并后台解析</button>
    <button type="button" className="ml-2 rounded border px-3 py-1 text-xs" onClick={refresh}>刷新材料</button>
    {materials.map(material=><details key={material.material_id} className="mt-2 rounded border p-2" open={expanded===material.material_id} onToggle={event=>{const opened=event.currentTarget.open;setExpanded(previous=>opened?material.material_id:previous===material.material_id?'':previous)}}>
      <summary className="cursor-pointer break-all text-xs">{material.filename} · {material.data_space} · {material.parse?(material.parse.coverage.extraction_complete?'已提取文字':'部分范围未读取'):material.job_status==='failed'?`解析失败 · ${material.job_error||''}`:material.job_status==='cancelled'?'已取消解析':'等待后台解析'}</summary>
      <p className="mt-1 break-all text-xs text-muted-foreground">材料 ID：{material.material_id} · 原件 {material.byte_count} 字节</p>
      <button type="button" disabled={busy} className="mt-2 rounded border px-2 py-1 text-xs" onClick={()=>void download(material)}>下载原件</button>
      {material.parse&&expanded===material.material_id&&<><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(material.parse.coverage,null,2)}</pre><MaterialReader material={material}/></>}
    </details>)}
    {!materials.length&&<p className="mt-2 text-xs text-muted-foreground">尚无当前可读取的材料。</p>}
    {error&&<p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </details>
}
