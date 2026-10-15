// 隔离预览不能直连第三方 HTTP。公开行情 / 天气 / 新闻等外网数据走本页
// {preview}/content/__ext/<host>/...，由平台 Origin 代取。
// 必须用当前页 pathname 里的 /content 前缀，禁止写成站点根路径 /content/__ext/...

export function contentExt(url: string): string {
  if (typeof window === "undefined") return url
  const prefix = window.location.pathname.match(/^(.*\/content)(?:\/|$)/i)?.[1]
  if (!prefix) return url
  try {
    const abs = new URL(url, window.location.href)
    if (abs.protocol !== "http:" && abs.protocol !== "https:") return url
    if (abs.origin === window.location.origin) return url
    return `${prefix}/__ext/${abs.hostname}${abs.pathname}${abs.search}`
  } catch {
    return url
  }
}

export async function previewFetch(url: string, init?: RequestInit): Promise<Response> {
  const target = contentExt(url)
  const next: RequestInit = { ...init, credentials: init?.credentials ?? "omit" }
  if (!next.method || next.method.toUpperCase() === "GET" || next.method.toUpperCase() === "HEAD") {
    next.cache = "default"
  }
  return fetch(target, next)
}

export function loadExtScript(url: string, charsetOrTimeout?: string | number): Promise<void> {
  const charset = typeof charsetOrTimeout === "string" ? charsetOrTimeout : undefined
  const timeoutMs = typeof charsetOrTimeout === "number" ? charsetOrTimeout : 8000
  return new Promise((resolve, reject) => {
    const script = document.createElement("script")
    const timer = window.setTimeout(() => {
      script.remove()
      reject(new Error("行情请求超时"))
    }, timeoutMs)
    if (charset) script.charset = charset
    script.onload = () => {
      window.clearTimeout(timer)
      script.remove()
      resolve()
    }
    script.onerror = () => {
      window.clearTimeout(timer)
      script.remove()
      reject(new Error("Failed to fetch"))
    }
    script.src = contentExt(url)
    document.head.appendChild(script)
  })
}
