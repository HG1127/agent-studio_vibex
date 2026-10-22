import {StrictMode} from "react"
import {createRoot} from "react-dom/client"
import "@/index.css"
import PgNativePilotPage from "@/pages/PgNativePilot/PgNativePilotPage"

// Separate PG18-only build entry. It never imports src/App, studioAuth,
// PocketBase, the old 8090 router or the old Worker runtime.
const root=document.getElementById("root")
if(!root)throw Error("pg18_root_missing")
createRoot(root).render(<StrictMode><PgNativePilotPage productionRoot/></StrictMode>)
