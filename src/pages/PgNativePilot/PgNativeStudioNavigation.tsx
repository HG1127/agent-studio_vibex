import {useEffect,useRef,useState,type ComponentType} from 'react'
import {nativeStudioGroups,nativeStudioGroup,searchNativeStudioItems,type NativeStudioScreen} from '@/lib/pgNativeStudioNavigation'
export type NativeStudioNavigationItem={key:NativeStudioScreen;label:string;icon:ComponentType<{size?:number}>;count:number|null}
export default function PgNativeStudioNavigation({items,selected,disabled,onNavigate}:{items:NativeStudioNavigationItem[];selected:NativeStudioScreen;disabled:boolean;onNavigate:(screen:NativeStudioScreen)=>void}){
 const [query,setQuery]=useState(''),[expanded,setExpanded]=useState(false),search=useRef<HTMLInputElement>(null)
 useEffect(()=>{const focus=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();search.current?.focus();search.current?.select()}};window.addEventListener('keydown',focus);return()=>window.removeEventListener('keydown',focus)},[])
 const matches=searchNativeStudioItems(items,query)
 return <nav aria-label="独立 PostgreSQL 功能" className="min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-white p-3 lg:self-start">
  <div className="flex min-w-0 items-center justify-between gap-2 lg:hidden"><p className="min-w-0 break-words text-sm font-medium">{items.find(item=>item.key===selected)?.label??'当前工作区'}</p><button type="button" className="min-h-10 shrink-0 rounded-lg border px-3 text-sm" aria-expanded={expanded||Boolean(query)} aria-controls="native-studio-navigation-items" onClick={()=>{setExpanded(value=>!value);setQuery('')}}>{expanded?'收起功能菜单':'切换工作区'}</button></div>
  <label className="block text-xs font-medium text-slate-600">查找功能 <span className="text-slate-400">Ctrl / ⌘ K</span><input ref={search} type="search" aria-label="查找工作台功能" className="mt-1 min-h-10 w-full min-w-0 rounded-lg border px-3 text-sm" maxLength={100} value={query} onFocus={()=>setExpanded(true)} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){setQuery('');setExpanded(false);search.current?.blur()}}} /></label>
  <div id="native-studio-navigation-items" className={(expanded||query?'grid':'hidden')+' grid-cols-1 gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-1'}>{nativeStudioGroups.map(group=>{
   const rows=matches.filter(item=>nativeStudioGroup(item.key)===group);if(!rows.length)return null
   return <div key={group} role="group" aria-label={group}><p className="mb-1 px-2 text-xs font-semibold text-slate-500">{group}</p><div className="space-y-1">{rows.map(item=><button key={item.key} type="button" disabled={disabled} aria-current={selected===item.key?'page':undefined} onClick={()=>{onNavigate(item.key);setQuery('');setExpanded(false)}} className={'flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium disabled:opacity-40 '+(selected===item.key?'bg-indigo-50 text-indigo-700':'text-slate-600 hover:bg-slate-50')}><item.icon size={17}/><span className="min-w-0 flex-1 break-words">{item.label}</span>{item.count!==null&&<span className="text-xs tabular-nums">{item.count}</span>}</button>)}</div></div>
  })}</div>
  {!matches.length&&<p role="status" className="px-2 py-3 text-sm text-slate-500">没有匹配的可用功能，请换个关键词。</p>}
 </nav>
}
