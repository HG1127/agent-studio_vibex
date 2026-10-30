import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs/promises'
import path from 'node:path'
import {pipeline} from 'node:stream'

const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2','.pdf':'application/pdf'}
const hop = new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade','host','origin','referer','forwarded','x-forwarded-host','x-forwarded-proto','x-forwarded-for'])
export async function createGateway({webRoot, serverOrigin, port=0}) {
  const upstream = new URL(serverOrigin)
  if (upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash ||
      !(upstream.protocol === 'https:' || upstream.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(upstream.hostname))) throw Error('invalid_server_origin')
  webRoot = path.resolve(webRoot)
  let origin = ''
  const sockets = new Set()
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options','nosniff')
    res.setHeader('Referrer-Policy','no-referrer')
    res.setHeader('Cache-Control','no-store')
    if (req.headers.host !== new URL(origin).host || !['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress) ||
        req.headers.origin && req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') {
      res.writeHead(403); return res.end('Local desktop origin required')
    }
    let url
    try { url = new URL(req.url, origin) } catch { res.writeHead(400); return res.end('Invalid request') }
    if (url.origin !== origin) {res.writeHead(403);return res.end('Invalid origin')}
    if (/^\/__pb(?:\/|$)/.test(url.pathname)) {
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([name]) => !hop.has(name)))
      headers.host = upstream.host
      headers.origin = upstream.origin
      headers['x-forwarded-host'] = upstream.host
      headers['x-forwarded-proto'] = upstream.protocol.slice(0,-1)
      const target = new URL(url.pathname + url.search, upstream)
      const proxy = (target.protocol === 'https:' ? https : http).request(target, {method:req.method,headers}, reply => {
        if(res.destroyed){reply.destroy();return}
        // Never forward credentials through a redirect to a different endpoint.
        if (reply.statusCode >= 300 && reply.statusCode < 400 && reply.headers.location) {
          reply.resume();res.writeHead(502);return res.end('Server redirect blocked; configure the final HTTPS workbench address.')
        }
        for (const [name,value] of Object.entries(reply.headers)) if (!hop.has(name) && value !== undefined) res.setHeader(name,value)
        res.writeHead(reply.statusCode || 502)
        pipeline(reply,res,()=>{})
      })
      proxy.on('error',()=>{if(res.destroyed)return;if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'无法连接工作台服务器，请检查地址、网络及证书信任。'}))})
      req.once('aborted',()=>proxy.destroy())
      res.once('close',()=>{if(!res.writableFinished)proxy.destroy()})
      pipeline(req,proxy,()=>{})
      return
    }
    if (!['GET','HEAD'].includes(req.method) || url.pathname.startsWith('/__')) {
      if (req.method === 'GET' && url.pathname === '/__desktop/runtime.js') {
        res.setHeader('Content-Type','text/javascript; charset=utf-8')
        return res.end(`Object.defineProperty(window,'__STUDIO_DESKTOP_SERVER_ORIGIN__',{value:${JSON.stringify(upstream.origin)},writable:false});`)
      }
      res.writeHead(404);return res.end('Not found')
    }
    try {
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      if (relative.includes('\\') || relative.includes('\0')) throw Error('invalid_path')
      let filename = path.resolve(webRoot, relative || 'index.html')
      if (filename !== webRoot && !filename.startsWith(webRoot + path.sep)) throw Error('invalid_path')
      let stat
      try {stat=await fs.stat(filename)}catch{}
      if (!stat?.isFile()) {
        if (path.extname(relative)) {res.writeHead(404);return res.end('Not found')}
        filename = path.join(webRoot,'index.html')
      }
      let bytes = await fs.readFile(filename)
      if (path.basename(filename) === 'index.html') bytes = Buffer.from(bytes.toString('utf8').replace('<head>','<head><script src="/__desktop/runtime.js"></script>'))
      res.setHeader('Content-Type',MIME[path.extname(filename)]||'application/octet-stream')
      res.setHeader('Content-Length',bytes.length)
      res.end(req.method === 'HEAD' ? undefined : bytes)
    } catch {res.writeHead(404);res.end('Not found')}
  })
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket))})
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})
  origin = 'http://127.0.0.1:' + server.address().port
  return {origin,port:server.address().port,close:async()=>{for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve))}}
}
