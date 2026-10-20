import path from "node:path"
import {defineConfig} from "vite"
import react from "@vitejs/plugin-react"

// Separate PG18 frontend artifact; NEVER overwrite dist/ (8090 PocketBase).
const repo=path.resolve(__dirname,"..")
export default defineConfig({
  root:path.join(repo,"pg18-app"),
  publicDir:false,
  plugins:[react()],
  resolve:{alias:{"@":path.join(repo,"src")}},
  build:{
    outDir:path.join(repo,"dist-pg18"),
    emptyOutDir:true,
    sourcemap:false,
    manifest:true,
    rollupOptions:{input:path.join(repo,"pg18-app","index.html")}
  }
})
