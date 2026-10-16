import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"
import { BrowserRouter } from "react-router-dom"
import { getBasename } from "./lib/pb"
import { installUnsavedHistoryGuard } from "./lib/unsavedNavigation"

// Capture browser Back/Forward before BrowserRouter attaches its own listener.
const uninstallHistoryGuard = installUnsavedHistoryGuard(window, message => window.confirm(message))
if (import.meta.hot) import.meta.hot.dispose(uninstallHistoryGuard)

createRoot(document.getElementById("root")!).render(
  <StrictMode><BrowserRouter basename={getBasename()}><App /></BrowserRouter></StrictMode>,
)
