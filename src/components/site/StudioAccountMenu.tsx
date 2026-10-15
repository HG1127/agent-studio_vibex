import { useEffect, useState } from "react"
import { ChevronDown, LogOut, Settings, UsersRound } from "lucide-react"
import { Link } from "react-router-dom"
import { fetchStudioAccountInfo, logoutStudioAccount, type StudioProfile } from "@/lib/studioAuth"

export function StudioAccountMenu() {
  const [profile, setProfile] = useState<StudioProfile | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let active = true
    void fetchStudioAccountInfo().then(info => { if (active) setProfile(info) })
    return () => { active = false }
  }, [])
  return (
    <div className="relative min-w-0">
      <button type="button" aria-haspopup="menu" aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-background px-2 py-2 text-left text-sm hover:bg-muted"
        onClick={() => setOpen(current => !current)}>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 font-semibold text-primary">
          {profile?.display_name.slice(0,1) || "?"}
        </span>
        <span className="min-w-0 flex-1 truncate">{profile?.display_name || "我的账号"}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div role="menu" className="absolute bottom-full left-0 z-50 mb-2 w-60 overflow-hidden rounded-xl border border-border bg-card p-2 shadow-xl">
          <div className="border-b border-border px-2 py-2 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">{profile?.display_name || "已登录"}</p>
            <p className="mt-1 break-all">{profile?.email || ""}</p>
          </div>
          <Link to="/staff" role="menuitem" onClick={() => setOpen(false)}
            className="mt-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted">
            {profile?.role === "admin" ? <UsersRound size={16} /> : <Settings size={16} />}
            {profile?.role === "admin" ? "员工与权限" : "修改密码"}
          </Link>
          <button type="button" role="menuitem" onClick={logoutStudioAccount}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-destructive hover:bg-muted">
            <LogOut size={16} /> 退出登录
          </button>
        </div>
      )}
    </div>
  )
}
