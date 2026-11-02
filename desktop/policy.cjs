'use strict'
const fs = require('node:fs/promises')
const path = require('node:path')
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])
function serverOrigin(value) {
  const u = new URL(String(value).trim())
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/' ||
      !(u.protocol === 'https:' || u.protocol === 'http:' && LOOPBACK.has(u.hostname))) throw Error('请输入 HTTPS 工作台地址（本机测试可用 HTTP localhost），不带路径或账号信息。')
  return u.origin
}
function ownUrl(value, origin) {
  try { return new URL(value).origin === origin } catch { return false }
}
function webUrl(value) {
  try { const u = new URL(value); return !u.username && !u.password && ['https:', 'http:'].includes(u.protocol) } catch { return false }
}
function childEnvironment(env = process.env) {
  const allowed = /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|APPDATA|LOCALAPPDATA|USERPROFILE|HOMEDRIVE|HOMEPATH|COMSPEC|PATHEXT|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMW6432|PUBLIC)$/i
  return {...Object.fromEntries(Object.entries(env).filter(([key]) => allowed.test(key))), NODE_USE_SYSTEM_CA: '1'}
}
async function readSettings(directory) {
  try {
    const s = JSON.parse(await fs.readFile(path.join(directory, 'desktop.json'), 'utf8'))
    let updateFeed;try{if(s.updateFeed)updateFeed=require('./update-core.cjs').safeUrl(s.updateFeed)}catch{}
    return {server: serverOrigin(s.server), port: Number.isInteger(s.port) && s.port > 1023 && s.port < 65536 ? s.port : 0,...(updateFeed?{updateFeed}:{})}
  } catch { return {server: 'https://192.168.1.133:8443', port: 0} }
}
async function saveSettings(directory, settings) {
  await fs.mkdir(directory, {recursive: true})
  const filename = path.join(directory, 'desktop.json'), temp = filename + '.pending'
  await fs.writeFile(temp, JSON.stringify({server: serverOrigin(settings.server), port: settings.port || 0,...(settings.updateFeed?{updateFeed:require('./update-core.cjs').safeUrl(settings.updateFeed)}:{})}, null, 2), {mode: 0o600})
  await fs.rename(temp, filename)
}
function rendererPermission(permission,url,origins,isMainFrame=true) {
  return isMainFrame!==false && ['clipboard-sanitized-write','fullscreen'].includes(permission) && origins.some(origin=>ownUrl(url,origin))
}
function workbenchSender(event,contents,origin) {
  if(!contents||contents.isDestroyed()||event.sender!==contents||event.senderFrame!==contents.mainFrame||!ownUrl(event.senderFrame?.url,origin))return false
  try{const route=decodeURIComponent(new URL(event.senderFrame.url).pathname);return !route.startsWith('/__')&&!path.posix.extname(route)}catch{return false}
}
function embeddedManagerUrl(value) {
  const url=new URL(value),parts=url.hash.slice(1).split('&'),token=parts.shift()
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.pathname!=='/'||!/^[a-f0-9]{64}$/.test(token))throw Error('invalid_manager_entry')
  const entry=new URLSearchParams(parts.join('&'));entry.set('desktop','1')
  url.search='';url.hash=token+'&'+entry.toString();return url.href
}
module.exports = {serverOrigin, ownUrl, webUrl, childEnvironment, readSettings, saveSettings, rendererPermission, workbenchSender, embeddedManagerUrl}
