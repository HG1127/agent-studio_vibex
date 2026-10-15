import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"
import { BrowserRouter } from "react-router-dom"
import { getBasename } from "./lib/pb"

createRoot(document.getElementById("root")!).render(
  <StrictMode><BrowserRouter basename={getBasename()}><App /></BrowserRouter></StrictMode>,
)
