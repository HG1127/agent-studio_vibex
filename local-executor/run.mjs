#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { createRuntime } from './runtime.mjs'
import { connection, executeClaim } from './connection.mjs'

const args = process.argv.slice(2)
if (args.length !== 2 || !['pair', 'run'].includes(args[0])) {
  console.error('用法：pnpm local:pair <本地配置.json> 或 pnpm local:run <本地配置.json>')
  process.exit(1)
}
const configPath = path.resolve(args[1])
const config = JSON.parse(await fs.readFile(configPath, 'utf8'))
const credentials = path.resolve(path.dirname(configPath), config.credentialsFile || '.local-device-credentials.json')
if (args[0] === 'pair') {
  try { await fs.access(credentials); throw Error('credentials_already_exist_revoke_before_repair') }
  catch (e) { if (e.code !== 'ENOENT') throw e }
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  const code = (await prompt.question('粘贴工具中心生成的五分钟配对码：')).trim()
  prompt.close()
  const paired = await connection(config.server)('/pair', { code })
  await fs.writeFile(credentials, JSON.stringify({ ...paired, server: config.server }), { flag: 'wx', mode: 0o600 })
  console.log('电脑已绑定。启动执行器前请核对本地配置中的目录、网站与软件权限。')
} else {
  const auth = JSON.parse(await fs.readFile(credentials, 'utf8'))
  if (auth.server !== config.server) throw Error('credential_server_mismatch')
  const api = connection(config.server, auth.token)
  const runtime = await createRuntime({ ...config, deniedPaths: [credentials, configPath] })
  const stop = new AbortController()
  process.once('SIGINT', () => stop.abort()); process.once('SIGTERM', () => stop.abort())
  console.log('本地执行器在线。仅执行已批准任务；Ctrl+C 停止。')
  try {
    while (!stop.signal.aborted) {
      try {
        const { job } = await api('/poll', { tools: runtime.tools }, stop.signal)
        if (job) await executeClaim(api, runtime, job, stop.signal)
      } catch (e) {
        if (e.status === 401) { console.error('设备授权已失效，请重新绑定。'); break }
        if (!stop.signal.aborted) console.error('连接或执行中断；已开始的操作不会自动重放。')
      }
      await sleep(1500, undefined, { signal: stop.signal }).catch(() => {})
    }
  } finally { await runtime.close() }
}
