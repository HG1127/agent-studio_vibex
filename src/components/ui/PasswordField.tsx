import {useId,useRef,useState,type InputHTMLAttributes} from "react"
import {Eye,EyeOff,LockKeyhole} from "lucide-react"
import {passwordAdvice} from "@/lib/accountUx"
type Props=Omit<InputHTMLAttributes<HTMLInputElement>,"type"|"value">&{label:string;value:string;advice?:boolean;hint?:string}
export function PasswordField({label,value,advice=false,hint,id,className="",onKeyUp,onKeyDown,...props}:Props){
  const generated=useId(),inputId=id||generated,ref=useRef<HTMLInputElement>(null)
  const [visible,setVisible]=useState(false),[caps,setCaps]=useState(false)
  const guidance=passwordAdvice(value)
  return <div className="min-w-0 space-y-1.5">
    <label htmlFor={inputId} className="block text-sm font-medium text-foreground">{label}{props.required&&<span className="ml-1 text-muted-foreground" aria-hidden>*</span>}</label>
    <div className="relative min-w-0">
      <input {...props} ref={ref} id={inputId} aria-label={props["aria-label"]||label} type={visible?"text":"password"} value={value}
        maxLength={props.maxLength??128} spellCheck={false} autoCapitalize="none"
        aria-describedby={[hint||advice?inputId+"-hint":"",caps?inputId+"-caps":"",props["aria-describedby"]||""].filter(Boolean).join(" ")||undefined}
        onKeyUp={e=>{setCaps(e.getModifierState("CapsLock"));onKeyUp?.(e)}}
        onKeyDown={e=>{setCaps(e.getModifierState("CapsLock"));onKeyDown?.(e)}}
        className={"min-h-11 w-full min-w-0 rounded-xl border border-input bg-background py-2.5 pl-3 pr-12 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60 "+className}/>
      <button type="button" tabIndex={0} disabled={props.disabled} aria-label={(visible?"隐藏":"显示")+label} aria-pressed={visible}
        onClick={()=>{setVisible(v=>!v);ref.current?.focus({preventScroll:true})}}
        className="absolute inset-y-0 right-1 grid w-10 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary">
        {visible?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}
      </button>
    </div>
    {caps&&<p id={inputId+"-caps"} role="status" className="text-xs text-amber-700">大写锁定已开启（Caps Lock）</p>}
    {(advice||hint)&&<p id={inputId+"-hint"} className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0"/>{hint||guidance.label}</p>}
  </div>
}
