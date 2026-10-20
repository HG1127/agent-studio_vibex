import { lazy, Suspense, useEffect, useState } from "react"
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom"
import { getStudioAccountInfo, verifyStudioSession, type StudioSessionStatus } from "@/lib/studioAuth"
import { StudioErrorBoundary } from "@/components/site/StudioErrorBoundary"

// Keep the existing feature routes; gate all of them behind a verified
// PocketBase studio_users session. There is no platform SSO.
// Opt-in, loopback-only PG testing route. Never substitutes the existing employee login.
const PG_PILOT_LOCAL_ONLY = import.meta.env.DEV &&
  import.meta.env.VITE_AGENT_STUDIO_PG_PILOT_UI_ENABLED === "true"
// Keep pilot code entirely OUT of production bundles, not merely inaccessible.
const PgPilotRoute = PG_PILOT_LOCAL_ONLY
  ? lazy(() => import("./pages/PgPilot/PgPilotPage.tsx"))
  : null
const HomeRoute = lazy(() => import("./pages/Home/index.tsx"))
const AgentCreateRoute = lazy(() => import("./pages/AgentCreate/AgentCreatePage.tsx"))
const InternalOverviewRoute = lazy(() => import("./pages/InternalOverview/index.tsx"))
const InternalTemplatesRoute = lazy(() => import("./pages/InternalTemplates/index.tsx"))
const AgentRunRoute = lazy(() => import("./pages/AgentRun/index.tsx"))
const ModelConnectionsRoute = lazy(() => import("./pages/ModelConnections/index.tsx"))
const VersionReleaseRoute = lazy(() => import("./pages/VersionRelease/index.tsx"))
const ToolConnectionsRoute = lazy(() => import("./pages/ToolConnections/index.tsx"))
const RunDetailRoute = lazy(() => import("./pages/RunDetail/index.tsx"))
const TemplateMarketRoute = lazy(() => import("./pages/TemplateMarket/index.tsx"))
const WorkflowCanvasRoute = lazy(() => import("./pages/WorkflowCanvas/index.tsx"))
const ScheduledTasksRoute = lazy(() => import("./pages/ScheduledTasks/index.tsx"))
const KnowledgeBasesRoute = lazy(() => import("./pages/KnowledgeBases/index.tsx"))
const ToolHubRoute = lazy(() => import("./pages/ToolHub/index.tsx"))
const HarnessRoute = lazy(() => import("./pages/Harness/HarnessPage.tsx"))
const IntegrateRoute = lazy(() => import("./pages/Integrate/index.tsx"))
const PluginMarketRoute = lazy(() => import("./pages/PluginMarket/index.tsx"))
const LoginRoute = lazy(() => import("./pages/Login/LoginPage.tsx"))
const StaffRoute = lazy(() => import("./pages/Staff/StaffPage.tsx"))
const ManagerRoute = lazy(() => import("./pages/Manager/ManagerPage.tsx"))
const AgentCollaborationRoute = lazy(() => import("./pages/AgentCollaboration/AgentCollaborationPage.tsx"))

function RouteLoading() {
  return <main className="flex min-h-screen items-center justify-center bg-background px-6" role="status" aria-live="polite">
    <span className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
    <span className="text-sm text-muted-foreground">正在验证账号并打开工作台…</span>
  </main>
}

function AuthGate() {
  const [state, setState] = useState<StudioSessionStatus | "checking">("checking")
  const location = useLocation()
  useEffect(() => {
    let mounted = true
    void verifyStudioSession().then(result => {
      if (mounted) setState(result)
    })
    return () => { mounted = false }
  }, [])
  if (state === "checking") return <RouteLoading />
  if (state === "signed_out")
    return <Navigate to={"/login?next=" + encodeURIComponent(location.pathname + location.search)} replace />
  if (state === "unavailable") {
    return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-lg font-semibold text-foreground">暂时无法验证员工登录状态</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        独立账号服务暂时不可达或请求被中断。为保护业务数据，验证恢复之前不会打开工作台，也不会仅因网络故障清除登录信息。
      </p>
      <button type="button" onClick={() => {
        setState("checking")
        void verifyStudioSession().then(setState)
      }} className="rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        重试身份验证
      </button>
    </main>
  }
  return <Outlet />
}

function AdminGate() {
  // Navigation visibility is not a security boundary. The API checks the
  // actual verified identity again for every staff/manager action.
  if (getStudioAccountInfo()?.role !== "admin")
    return <Navigate to="/" replace />
  return <Outlet />
}

function App() {
  const location = useLocation()
  return <StudioErrorBoundary key={location.pathname}>
    <Suspense fallback={<RouteLoading />}>
    <Routes>
      {PgPilotRoute && <Route path="/pg-pilot" element={<PgPilotRoute />} />}
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<AuthGate />}>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/agent-create" element={<AgentCreateRoute />} />
        <Route path="/internal-templates" element={<InternalTemplatesRoute />} />
        <Route path="/agent-collaboration" element={<AgentCollaborationRoute />} />
        <Route element={<AdminGate />}>
          <Route path="/internal-overview" element={<InternalOverviewRoute />} />
          <Route path="/staff" element={<StaffRoute />} />
          <Route path="/manager" element={<ManagerRoute />} />
        </Route>
        <Route path="/agent-run" element={<AgentRunRoute />} />
        <Route path="/model-connections" element={<ModelConnectionsRoute />} />
        <Route path="/version-release" element={<VersionReleaseRoute />} />
        <Route path="/tool-connections" element={<ToolConnectionsRoute />} />
        <Route path="/run-detail" element={<RunDetailRoute />} />
        <Route path="/template-market" element={<TemplateMarketRoute />} />
        <Route path="/workflow-canvas" element={<WorkflowCanvasRoute />} />
        <Route path="/scheduled-tasks" element={<ScheduledTasksRoute />} />
        <Route path="/knowledge-bases" element={<KnowledgeBasesRoute />} />
        <Route path="/tool-hub" element={<ToolHubRoute />} />
        <Route path="/harness" element={<HarnessRoute />} />
        <Route path="/integrate" element={<IntegrateRoute />} />
        <Route path="/plugin-market" element={<PluginMarketRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </Suspense>
  </StudioErrorBoundary>
}
export default App
