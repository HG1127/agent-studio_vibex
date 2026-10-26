import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mcpResult, desktopResult } from './result.mjs'

const ownDir = path.dirname(fileURLToPath(import.meta.url))
const objectSchema = properties => ({ type: 'object', properties, additionalProperties: false })
const string = { type: 'string' }
const browserTools = new Set(['browser_navigate', 'browser_snapshot', 'browser_click', 'browser_type',
  'browser_fill_form', 'browser_select_option', 'browser_press_key', 'browser_wait_for', 'browser_tabs', 'browser_close'])
const desktopTools = new Set(['Snapshot', 'Screenshot', 'Click', 'Type', 'Scroll', 'ControlStatus'])
const protectedPart = p => /^(?:\.env.*|\.git|\.aws|\.ssh|\.codex|\.local-device-credentials\.json|pb_data|node_modules|credentials.*|.*\.(?:db|sqlite|pem|key))$/i.test(p)

export async function createRuntime(config) {
  if (!Array.isArray(config.roots) || !config.roots.length) throw Error('workspace_roots_required')
  const roots = new Map()
  for (const r of config.roots) {
    if (!/^[a-z][a-z0-9_-]{0,30}$/.test(r.name) || roots.has(r.name) || !path.isAbsolute(r.path)) throw Error('invalid_root')
    const real = await fs.realpath(r.path)
    if (!(await fs.stat(real)).isDirectory()) throw Error('invalid_root')
    roots.set(r.name, real)
  }
  async function resolveFile(args, allowMissing = false) {
    const root = roots.get(args.root)
    if (!root || typeof args.path !== 'string' || args.path.length > 1000 || /[:\x00-\x1f]/.test(args.path) || path.isAbsolute(args.path)) throw Error('path_denied')
    const parts = args.path.replaceAll('\\', '/').split('/').filter(Boolean)
    if (parts.some(p => p !== '.' && (p === '..' || p.endsWith('.') || p.endsWith(' ') || protectedPart(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p)))) throw Error('path_denied')
    let target = root
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === '.') continue
      target = path.join(target, parts[i])
      try {
        const stat = await fs.lstat(target)
        if (stat.isSymbolicLink() || stat.isFile() && stat.nlink > 1) throw Error('linked_path_denied')
        const real = await fs.realpath(target)
        if ((config.deniedPaths || []).some(p => path.resolve(p).toLowerCase() === real.toLowerCase())) throw Error('private_file_denied')
        const rel = path.relative(root, real)
        if (rel.startsWith('..') || path.isAbsolute(rel)) throw Error('path_denied')
      } catch (e) { if (!(allowMissing && i === parts.length - 1 && e.code === 'ENOENT')) throw e }
    }
    return target
  }
  const catalog = [], handlers = new Map(), clients = []
  function add(name, description, inputSchema, handler) {
    catalog.push({ name, description, inputSchema }); handlers.set(name, handler)
  }
  const fileSchema = { ...objectSchema({ root: { type: 'string', enum: [...roots.keys()] }, path: string }), required: ['root', 'path'] }
  add('files.list', '列出授权目录中的文件，path 可填 .', fileSchema, async args => {
    const list = await fs.readdir(await resolveFile(args), { withFileTypes: true })
    const visible = list.filter(x => !protectedPart(x.name) && !x.isSymbolicLink())
    return JSON.stringify({ root: args.root, path: args.path, truncated: visible.length > 200,
      entries: visible.slice(0, 200).map(x => ({ name: x.name, directory: x.isDirectory() })) })
  })
  add('files.read', '读取授权目录中的 UTF-8 文本文件（最多 64 KiB）', fileSchema, async args => {
    const file = await fs.open(await resolveFile(args), 'r')
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.size > 65536 || stat.nlink > 1) throw Error('file_size_or_type_denied')
      return await file.readFile('utf8')
    } finally { await file.close() }
  })
  add('files.write', '新建 UTF-8 文本文件；拒绝覆盖已有文件，父目录必须已存在',
    { ...fileSchema, properties: { ...fileSchema.properties, text: string }, required: ['root', 'path', 'text'] }, async args => {
      if (typeof args.text !== 'string' || Buffer.byteLength(args.text) > 16000) throw Error('text_too_large')
      await fs.writeFile(await resolveFile(args, true), args.text, { flag: 'wx', mode: 0o600 })
      return '已新建文件：' + args.root + '/' + args.path
    })
  const apps = config.apps || {}
  if (Object.keys(apps).length) {
    for (const app of Object.values(apps)) {
      if (!path.isAbsolute(app.command) || !Array.isArray(app.args) || app.args.some(a => typeof a !== 'string')) throw Error('invalid_application')
    }
    add('apps.launch', '启动本机预先配置的软件；参数固定，不能执行模型提供的命令',
      { ...objectSchema({ app: { type: 'string', enum: Object.keys(apps) } }), required: ['app'] }, async args => {
        if (!Object.hasOwn(apps, args.app)) throw Error('application_denied')
        const app = apps[args.app]
        await new Promise((resolve, reject) => {
          const child = spawn(app.command, app.args, { shell: false, windowsHide: true, stdio: 'ignore', env: getDefaultEnvironment() })
          child.once('error', reject); child.once('spawn', () => { child.unref(); resolve() })
        })
        return '已启动：' + args.app + '（未验证软件内部操作）'
      })
  }
  async function connectMcp(name, command, args, cwd, allow, extraEnv = {}, imagesEnabled = false) {
    let observedAt = 0
    const client = new Client({ name: 'agent-studio-local', version: '1.0.0' }, { capabilities: {} })
    const transport = new StdioClientTransport({ command, args, cwd, stderr: 'pipe',
      env: { ...getDefaultEnvironment(), ...extraEnv }, maxBufferSize: 2 * 1024 * 1024 })
    transport.stderr?.on('data', () => {}) // Do not copy MCP secrets into application logs.
    clients.push(client)
    await client.connect(transport)
    const listed = await client.listTools()
    for (const tool of listed.tools) {
      if (!allow.has(tool.name)) continue
      const schema = structuredClone(tool.inputSchema)
      // Do not advertise upstream file-output options that this executor denies.
      if (name === 'browser') {
        delete schema.properties?.filename
        if (schema.required) schema.required = schema.required.filter(key => key !== 'filename')
      }
      const description = name === 'browser'
        ? '截图和快照直接返回；禁止传 filename 或指定输出文件。' + (tool.description?.slice(0, 500) || tool.name)
        : tool.description?.slice(0, 600) || tool.name
      add(name + '.' + tool.name, description, schema, async (input, signal) => {
        let callInput = input
        const desktopAction = name === 'desktop' && ['Click', 'Type', 'Scroll'].includes(tool.name)
        if (name === 'desktop') {
          if (['Snapshot', 'Screenshot'].includes(tool.name)) {
            observedAt = 0
            callInput = { ...input, region: config.desktop.region, ...(tool.name === 'Snapshot' ? { use_vision: true } : {}) }
          } else if (desktopAction) {
            if (Date.now() - observedAt > 30000) throw Error('desktop_observation_expired')
            const loc = input.loc, region = config.desktop.region
            if (input.label != null || !Array.isArray(loc) || loc.length !== 2 || !loc.every(Number.isInteger) ||
                loc[0] < region[0] || loc[0] >= region[2] || loc[1] < region[1] || loc[1] >= region[3]) throw Error('desktop_coordinate_denied')
            // Consume the observation before the effect; never reuse it after
            // failure/cancellation. A fresh post-action screenshot is required.
            observedAt = 0
          }
        }
        if (name === 'browser') {
          if (input.filename !== undefined) throw Error('browser_output_path_denied')
          if (tool.name === 'browser_navigate') {
            const url = new URL(input.url)
            if (url.username || url.password || !config.browser.allowedOrigins.includes(url.origin)) throw Error('browser_origin_denied')
          }
        }
        const result = await client.callTool({ name: tool.name, arguments: callInput }, undefined, { signal, timeout: 60000 })
        let output = name === 'desktop' ? desktopResult(result) : mcpResult(result, imagesEnabled)
        if (name === 'desktop') {
          if (desktopAction) {
            const observed = await client.callTool({ name: 'Screenshot', arguments: { region: config.desktop.region } }, undefined, { signal, timeout: 15000 })
            const captured = desktopResult(observed)
            if (typeof captured === 'string') throw Error('desktop_screenshot_missing', { cause: captured })
            output = { text: String(output).slice(0, 1800) + '\n' + captured.text.slice(0, 10000), images: captured.images }
          }
          if (typeof output !== 'string' && output.images.length) observedAt = Date.now()
          else if (['Snapshot', 'Screenshot'].includes(tool.name)) throw Error('desktop_screenshot_missing', { cause: output })
        }
        // Recent Playwright MCP versions save implicit snapshots to a local
        // file. An explicit read-only snapshot returns the actual page tree.
        if (name === 'browser' && !['browser_snapshot', 'browser_close', 'browser_take_screenshot'].includes(tool.name)) {
          const observed = await client.callTool({ name: 'browser_snapshot', arguments: {} }, undefined, { signal, timeout: 15000 })
          const pageText = (observed.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n')
          output = String(output).slice(0, 1800) + '\n' + pageText.slice(0, 10000)
        }
        return output
      })
    }
  }
  try {
    if (config.desktop?.enabled === true) {
      const d = config.desktop, r = d.region
      if (process.platform !== 'win32' || !path.isAbsolute(d.python || '') || !Array.isArray(r) || r.length !== 4 ||
          !r.every(Number.isInteger) || r[2] <= r[0] || r[3] <= r[1] || r[2] - r[0] > 1920 || r[3] - r[1] > 1080) throw Error('invalid_desktop_config')
      await connectMcp('desktop', d.python, ['-m', 'windows_mcp', 'serve', '--transport', 'stdio', '--tools', [...desktopTools].join(',')],
        [...roots.values()][0], desktopTools, { ANONYMIZED_TELEMETRY: 'false', PYTHONIOENCODING: 'utf-8' }, true)
      for (const tool of catalog.filter(t => t.name.startsWith('desktop.'))) {
        tool.description = 'Windows 桌面：截图会传给本次模型。点击/输入/滚动需先在30秒内截图；仅接受 loc，禁止 label。固定屏幕范围 ' + JSON.stringify(d.region) + '；操作后自动截图。' + tool.description.slice(0, 400)
      }
    }
    if (config.browser?.enabled) {
      if (!Array.isArray(config.browser.allowedOrigins) || !config.browser.allowedOrigins.length) throw Error('browser_origins_required')
      for (const origin of config.browser.allowedOrigins) {
        const url = new URL(origin)
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw Error('invalid_browser_origin')
      }
      const allow = new Set(browserTools)
      if (config.browser.images === true) allow.add('browser_take_screenshot')
      await connectMcp('browser', process.execPath, [path.join(ownDir, 'browser-server.mjs')], [...roots.values()][0], allow,
        { STUDIO_BROWSER_CONFIG: JSON.stringify(config.browser) }, config.browser.images === true)
    }
    // Local configuration is trusted administrator input, never model input.
    // Use explicit executable paths and per-server tool allowlists.
    for (const [name, server] of Object.entries(config.mcpServers || {})) {
      if (!/^[a-z][a-z0-9_-]{0,24}$/.test(name) || ['files', 'apps', 'browser', 'desktop'].includes(name) ||
          !path.isAbsolute(server.command) || !Array.isArray(server.tools) || !server.tools.length) throw Error('invalid_mcp_config')
      await connectMcp(name, server.command, server.args || [], [...roots.values()][0], new Set(server.tools), {}, server.images === true)
    }
  } catch (e) { await Promise.allSettled(clients.map(c => c.close())); throw e }
  return {
    tools: catalog,
    async execute(input, signal) {
      signal?.throwIfAborted()
      const handler = handlers.get(input.tool)
      if (!handler || !input.arguments || typeof input.arguments !== 'object' || Array.isArray(input.arguments)) throw Error('tool_denied')
      const output = await handler(input.arguments, signal)
      return typeof output === 'string' ? output.slice(0, 12000) : output
    },
    close: () => Promise.allSettled(clients.map(c => c.close())),
  }
}
