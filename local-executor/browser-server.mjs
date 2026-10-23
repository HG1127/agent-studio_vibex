// Microsoft Playwright MCP over stdio, using a separate browser context.
import { createConnection } from '@playwright/mcp'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createRequire } from 'node:module'
// Use the browser library version bundled with MCP; its private snapshot
// references must match the MCP action implementation.
const { chromium } = createRequire(import.meta.resolve('@playwright/mcp'))('playwright')

const config = JSON.parse(process.env.STUDIO_BROWSER_CONFIG || '{}')
const origins = new Set(config.allowedOrigins || [])
if (!origins.size) throw Error('browser_origins_required')
function allowed(raw) {
  try { const u = new URL(raw); return !u.username && !u.password && ['http:', 'https:'].includes(u.protocol) && origins.has(u.origin) }
  catch { return false }
}
let browser, context
async function getContext() {
  if (context) return context
  browser = await chromium.launch({ headless: config.headless !== false,
    ...(config.executablePath ? { executablePath: config.executablePath } : { channel: config.channel || 'msedge' }) })
  context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true })
  // Every redirect is inspected before the next network request. No arbitrary
  // evaluate/run-code/file-upload tools are exported by the parent executor.
  await context.route('**/*', async route => {
    if (!allowed(route.request().url())) return route.abort('blockedbyclient')
    try {
      const response = await route.fetch({ maxRedirects: 0, timeout: 20000 })
      const location = response.headers().location
      if (location && !allowed(new URL(location, route.request().url()).href)) return route.abort('blockedbyclient')
      await route.fulfill({ response })
    } catch { await route.abort().catch(() => {}) }
  })
  await context.routeWebSocket('**/*', socket => socket.close())
  return context
}
const server = await createConnection({ imageResponses: config.images === true ? 'allow' : 'omit', outputDir: process.cwd(),
  browser: { isolated: false } }, getContext)
await server.connect(new StdioServerTransport())
process.stdin.on('end', async () => { await browser?.close(); process.exit(0) })
