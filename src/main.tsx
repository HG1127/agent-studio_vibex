import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"
import { BrowserRouter } from "react-router-dom"
import { getBasename } from "./lib/pb"
import { installUnsavedHistoryGuard } from "./lib/unsavedNavigation"
import { confirmInStudio } from "./lib/studioDialogs"
import { StudioDialogHost } from "./components/site/StudioDialogHost"

// Capture browser Back/Forward before BrowserRouter attaches its own listener.
const uninstallHistoryGuard = installUnsavedHistoryGuard(window, message => confirmInStudio(message))
if (import.meta.hot) import.meta.hot.dispose(uninstallHistoryGuard)

createRoot(document.getElementById("root")!).render(
  <StrictMode><StudioDialogHost/><BrowserRouter basename={getBasename()}><App /></BrowserRouter></StrictMode>,
)
