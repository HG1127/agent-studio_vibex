import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Independent local API target; loopback-only prevents proxying auth tokens to arbitrary hosts.
const pbOrigin = process.env.AGENT_STUDIO_PB_ORIGIN || 'http://127.0.0.1:7000'
const backend = new URL(pbOrigin)
if (backend.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(backend.hostname) || backend.pathname !== '/' || backend.search || backend.hash) {
  throw new Error('AGENT_STUDIO_PB_ORIGIN must be a loopback HTTP origin')
}
const pbProxy = {
  target: pbOrigin,
  changeOrigin: true,
  rewrite: (url: string) => url.replace(/^\/__pb(?=\/|$)/, ''),
}

// The V8 PostgreSQL pilot never shares PocketBase credentials. Fixed loopback
// target prevents untrusted proxy environment values from receiving JWTs.
const pgPilotProxy = {
  target: 'http://127.0.0.1:7402',
  changeOrigin: true,
  rewrite: (url: string) => url.replace(/^\/__pg(?=\/|$)/, ''),
}

// Local dev only: isolated PG18 Native auth Cookie sessions. No PocketBase
// tokens or origin overrides, no remote IP target, never a production proxy.
const pgNativePilotProxy = {
  target: 'http://127.0.0.1:7403',
  changeOrigin: true,
  rewrite: (url: string) => url.replace(/^\/__pg_native(?=\/|$)/, ''),
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 8000,
    strictPort: true,
    proxy: {
      '/__pb': pbProxy,
      // Order is a security boundary: '/__pg' is a prefix of '/__pg_native'.
      // Native cookie sessions MUST NOT be proxied to the OIDC pilot.
      '/__pg_native': pgNativePilotProxy,
      '/__pg': pgPilotProxy,
    }
  },
  preview: {
    host: '127.0.0.1',
    port: 8000,
    strictPort: true,
    proxy: { '/__pb': pbProxy, '/__pg': pgPilotProxy },
  },
})
