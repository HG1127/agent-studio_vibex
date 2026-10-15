// Browser-side text extraction. Only UTF-8 text reaches PocketBase; original binaries
// never leave the user's browser. PDF raster/scans require a separate OCR service.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"

export const DOCUMENT_EXTENSIONS = ".txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.pdf,.docx"
const textual = /\.(txt|md|markdown|csv|tsv|json|html?)$/i
const MAX_CHARS = 160_000

function validateText(text: string, label: string): string {
  const clean = text.replace(/\r\n?/g, "\n").trim()
  if (!clean) throw new Error(label + "没有可提取的文本内容")
  if (clean.length > MAX_CHARS) throw new Error(label + "超过 16 万字符，请将文档拆分后导入")
  return clean
}

export async function readKnowledgeDocument(file: File): Promise<string> {
  const filename = file.name
  const isPdf = /\.pdf$/i.test(filename)
  const isDocx = /\.docx$/i.test(filename)
  if (!textual.test(filename) && !isPdf && !isDocx) {
    throw new Error("文件格式不支持。请选择 TXT、MD、CSV、JSON、HTML、PDF 或 DOCX")
  }
  const maxBytes = isPdf ? 12_000_000 : isDocx ? 8_000_000 : 600_000
  if (file.size === 0 || file.size > maxBytes) {
    throw new Error("文件为空或超出大小限制；PDF 最多 12MB、DOCX 最多 8MB，文本文件最多 600KB")
  }
  if (isPdf) {
    const pdfjs = await import("pdfjs-dist")
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      useSystemFonts: true,
    })
    let pdf: Awaited<typeof task.promise>
    try {
      pdf = await task.promise
    } catch {
      await task.destroy()
      throw new Error("PDF 打开失败：文件可能已损坏或需要密码")
    }
    try {
      if (pdf.numPages > 100) throw new Error("PDF 超过 100 页，请拆分后再上传")
      const pages: string[] = []
      let length = 0
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber)
        const items = (await page.getTextContent()).items
        const text = items.map(item => "str" in item ? String(item.str || "") : "").join(" ").trim()
        if (!text) continue
        const passage = "【PDF 第" + pageNumber + "页】\n" + text
        length += passage.length + 2
        if (length > MAX_CHARS) throw new Error("PDF 可提取文本超过 16 万字符，请拆分")
        pages.push(passage)
      }
      if (!pages.length) throw new Error("PDF 未包含可提取文字，扫描版文件需要 OCR 后导入")
      return validateText(pages.join("\n\n"), "PDF")
    } finally {
      await task.destroy()
    }
  }
  if (isDocx) {
    try {
      const mammoth = await import("mammoth")
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
      return validateText(result.value || "", "Word")
    } catch (error) {
      if (error instanceof Error && (error.message.includes("没有可提取") || error.message.includes("超过 16 万"))) throw error
      throw new Error("DOCX 解析失败，请确认文件未损坏、未加密，并使用 .docx 格式", { cause: error })
    }
  }
  let text = await file.text()
  if (/\.html?$/i.test(filename)) {
    const html = new DOMParser().parseFromString(text, "text/html")
    html.querySelectorAll("script,style,noscript,iframe,svg").forEach(node => node.remove())
    text = html.body?.textContent || ""
  }
  return validateText(text, "文档")
}
