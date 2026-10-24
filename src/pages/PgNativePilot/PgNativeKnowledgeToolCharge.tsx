export default function PgNativeKnowledgeToolCharge({checked,disabled,onChange}:{checked:boolean;disabled:boolean;onChange:(value:boolean)=>void}){
  return <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" className="mt-1.5" checked={checked} disabled={disabled}
    onChange={event=>onChange(event.target.checked)}/>我确认本次语义查询可能产生费用，使用我自己的检索配置，仅批准当前步骤。</label>
}
