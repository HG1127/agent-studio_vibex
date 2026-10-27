import { lazy, Suspense, useEffect, useState } from "react"
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom"
import { pb } from "@/lib/pb"

// Keep the existing feature routes; gate all of them behind a verified
// PocketBase studio_users session. There is no platform SSO.
// Opt-in, loopback-only PG testing route. Never substitutes the existing employee login.
const PG_PILOT_LOCAL_ONLY = import.meta.env.DEV &&
  import.meta.env.VITE_AGENT_STUDIO_PG_PILOT_UI_ENABLED === "true"
// Keep pilot code entirely OUT of production bundles, not merely inaccessible.
const PgPilotRoute = PG_PILOT_LOCAL_ONLY
  ? lazy(() => import("./pages/PgPilot/PgPilotPage.tsx"))
  : null
const PG_NATIVE_LOCAL_ONLY=import.meta.env.DEV &&
  import.meta.env.VITE_AGENT_STUDIO_PG_NATIVE_LOCAL_UI_ENABLED === "true"
const PgNativePilotRoute=PG_NATIVE_LOCAL_ONLY
  ?lazy(()=>import("./pages/PgNativePilot/PgNativePilotPage.tsx")):null
const HomeRoute = lazy(() => import("./pages/Home/index.tsx"))
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
  const [state, setState] = useState<"checking" | "authenticated" | "guest">("checking")
  const location = useLocation()
  useEffect(() => {
    let mounted = true
    const verify = async () => {
      if (!pb.authStore.isValid) {
        pb.authStore.clear()
        if (mounted) setState("guest")
        return
      }
      try {
        const result = await pb.collection("studio_users").authRefresh()
        if (result.record.active !== true) throw new Error("employee_disabled")
        if (mounted) setState("authenticated")
      } catch {
        pb.authStore.clear()
        if (mounted) setState("guest")
      }
    }
    void verify()
    return () => { mounted = false }
  }, [])
  if (state === "checking") return <RouteLoading />
  if (state === "guest")
    return <Navigate to={"/login?next=" + encodeURIComponent(location.pathname + location.search)} replace />
  return <Outlet />
}

function App() {
  return <Suspense fallback={<RouteLoading />}>
    <Routes>
      {PgPilotRoute && <Route path="/pg-pilot" element={<PgPilotRoute />} />}
      {PgNativePilotRoute && <Route path="/pg-native-pilot" element={<PgNativePilotRoute />} />}
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<AuthGate />}>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/internal-overview" element={<InternalOverviewRoute />} />
        <Route path="/internal-templates" element={<InternalTemplatesRoute />} />
        <Route path="/agent-collaboration" element={<AgentCollaborationRoute />} />
        <Route path="/staff" element={<StaffRoute />} />
        <Route path="/manager" element={<ManagerRoute />} />
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
        <Route path="/integrate" element={<IntegrateRoute />} />
        <Route path="/plugin-market" element={<PluginMarketRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  </Suspense>
}
export default App
