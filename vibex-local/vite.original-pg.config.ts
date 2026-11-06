import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

// Isolated review build of the original employee UI. This is not a deployment
// or an acceptance claim for pages whose backend adapters are still pending.
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
export default defineConfig(({command})=>{
  if(command!=='build')throw Error('original_pg_ui_requires_guarded_https_test_host')
  return {
    root:repo,
    envDir:false,
    envPrefix:[],
    publicDir:path.join(repo,'public'),
    plugins:[react()],
    resolve:{alias:{'@':path.join(repo,'src')}},
    define:{
      'import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED':JSON.stringify('true'),
      'import.meta.env.VITE_AGENT_STUDIO_PG_PILOT_UI_ENABLED':JSON.stringify('false'),
      'import.meta.env.VITE_AGENT_STUDIO_PG_NATIVE_LOCAL_UI_ENABLED':JSON.stringify('false'),
    },
    build:{
      outDir:path.join(repo,'dist-original-pg'),
      emptyOutDir:false,
      sourcemap:false,
      manifest:true,
      rollupOptions:{input:path.join(repo,'index.html')},
    },
  }
})
