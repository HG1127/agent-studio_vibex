import { useMemo, useState, type ReactNode } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

/**
 * A deliberately small, read-only Markdown formatter for model-produced text.
 * React escapes all text by default; no raw HTML, scripts or markdown plugins.
 * Supports headings, emphasis, lists, tables, quoted text and fenced code.
 * Keep original text available for copy/export in parent components.
 */
type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "unordered"; lines: string[]; start: number }
  | { type: "ordered"; lines: string[]; start: number }
  | { type: "code"; lines: string[]; lang: string }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "rule" }

const headingRe = /^\s{0,3}(#{1,6})\s+(.+)$/
const itemRe = /^\s{0,3}([-+*])\s+(.+)$/
const numberRe = /^\s{0,3}(\d{1,4})[.)]\s+(.+)$/
const quoteRe = /^\s*>\s?(.*)$/
const ruleRe = /^\s{0,3}(?:---+|___+|\*\*\*+)\s*$/
const fenceRe = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`~]*)\s*$/

function pipeCells(line: string): string[] {
  return line.trim().replace(/^\|/,"").replace(/\|$/,"").split("|").map(cell=>cell.trim())
}
function isTableSeparator(line: string): boolean {
  const cells=pipeCells(line)
  return cells.length>=2 && cells.every(cell=>/^:?-{3,}:?$/.test(cell))
}

export function parseResultDocument(input: string): Block[] {
  const lines=String(input||"").replace(/\r\n?/g,"\n").split("\n")
  const blocks:Block[]=[]
  let i=0
  const special=(line:string)=>headingRe.test(line)||itemRe.test(line)||
    numberRe.test(line)||quoteRe.test(line)||ruleRe.test(line)||fenceRe.test(line)
  while(i<lines.length){
    const line=lines[i]
    if(!line.trim()){i++;continue}
    const fence=line.match(fenceRe)
    if(fence){
      const code:string[]=[]
      const ch=fence[1].charAt(0)
      const fenceLength=fence[1].length
      i++
      while(i<lines.length && !new RegExp("^\\s{0,3}"+ch+"{"+fenceLength+",}\\s*$").test(lines[i])){
        code.push(lines[i]);i++
      }
      if(i<lines.length)i++
      blocks.push({type:"code",lines:code,lang:fence[2].slice(0,30)})
      continue
    }
    const heading=line.match(headingRe)
    if(heading){
      blocks.push({type:"heading",level:heading[1].length,text:heading[2].trim()})
      i++;continue
    }
    if(ruleRe.test(line)){blocks.push({type:"rule"});i++;continue}
    if(i+1<lines.length && line.includes("|") && isTableSeparator(lines[i+1])){
      const header=pipeCells(line)
      const rows:string[][]=[]
      i+=2
      while(i<lines.length && lines[i].includes("|") && lines[i].trim()){
        rows.push(pipeCells(lines[i]).slice(0,header.length))
        i++
        if(rows.length>=100)break
      }
      blocks.push({type:"table",header:header.slice(0,12),rows})
      continue
    }
    const bullet=line.match(itemRe)
    const numbered=line.match(numberRe)
    if(bullet||numbered){
      const ordered=Boolean(numbered)
      const texts:string[]=[]
      const start=Number(numbered?.[1]||1)
      while(i<lines.length){
        const m=ordered?lines[i].match(numberRe):lines[i].match(itemRe)
        if(!m)break
        texts.push(m[2]);i++
        if(texts.length>=250)break
      }
      blocks.push({type:ordered?"ordered":"unordered",lines:texts,start})
      continue
    }
    const quoted=line.match(quoteRe)
    if(quoted){
      const texts:string[]=[]
      while(i<lines.length){
        const m=lines[i].match(quoteRe)
        if(!m)break
        texts.push(m[1]);i++
      }
      blocks.push({type:"quote",text:texts.join("\n")})
      continue
    }
    const para:string[]=[line]
    i++
    while(i<lines.length && lines[i].trim() && !special(lines[i]) &&
      !(i+1<lines.length && lines[i].includes("|") && isTableSeparator(lines[i+1]))){
      para.push(lines[i]);i++
    }
    blocks.push({type:"paragraph",text:para.join("\n")})
  }
  return blocks
}

// Only explicit http(s) links get a clickable anchor. Untrusted schemes remain text.
const INLINE = /\*\*([^*\n]+)\*\*|`([^`\n]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
function inline(text: string): ReactNode[] {
  const result:ReactNode[]=[]
  let last=0
  INLINE.lastIndex=0
  for(const match of text.matchAll(INLINE)){
    const index=match.index||0
    if(index>last)result.push(text.slice(last,index))
    const key=index
    if(match[1])result.push(<strong key={key} className="font-semibold text-foreground">{match[1]}</strong>)
    else if(match[2])result.push(<code key={key} className="rounded bg-secondary px-1 py-0.5 text-[0.9em]">{match[2]}</code>)
    else if(match[3]&&match[4]){
      const link=match[4]
      // No javascript:, data:, or embedded credentials. URL parsing is not needed for rendering plain text.
      const valid=/^https?:\/\/[^\s@]+$/i.test(link) && link.length<=2048
      result.push(valid?<a key={key} href={link} rel="noopener noreferrer" target="_blank"
        className="break-all font-medium text-primary underline underline-offset-2">{match[3]}</a>:match[0])
    }
    last=index+match[0].length
  }
  if(last<text.length)result.push(text.slice(last))
  return result
}

export function ResultDocument({text,className=""}:{text:string;className?:string}){
  const [expanded,setExpanded]=useState(false)
  const tooLong=text.length>18000
  const displayed=tooLong&&!expanded?text.slice(0,18000):text
  const blocks=useMemo(()=>parseResultDocument(displayed),[displayed])
  return <div className={"min-w-0 break-words text-sm leading-7 text-card-foreground "+className}
    role="document" aria-label="格式化运行成果">
    <div className="space-y-3">
      {blocks.map((block,index)=>{
        if(block.type==="heading"){
          const level=block.level
          const className=level<=1?"pt-2 text-lg font-semibold":level===2?
            "pt-1 text-base font-semibold":"text-sm font-semibold"
          return <h3 key={index} className={className}>{inline(block.text)}</h3>
        }
        if(block.type==="paragraph")return <p key={index} className="whitespace-pre-wrap">{inline(block.text)}</p>
        if(block.type==="quote")return <blockquote key={index}
          className="whitespace-pre-wrap border-l-2 border-primary/40 pl-3 text-muted-foreground">{inline(block.text)}</blockquote>
        if(block.type==="rule")return <hr key={index} className="border-border"/>
        if(block.type==="code")return <div key={index} className="min-w-0 overflow-hidden rounded-lg border border-border bg-muted/60">
          {block.lang&&<div className="border-b border-border px-3 py-1 font-mono text-[11px] text-muted-foreground">{block.lang}</div>}
          <pre className="max-h-96 overflow-auto p-3 text-xs leading-5"><code>{block.lines.join("\n")}</code></pre>
        </div>
        if(block.type==="table")return <div key={index} className="max-w-full overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-max border-collapse text-left text-xs">
            <thead className="bg-secondary/60"><tr>{block.header.map((cell,c)=><th key={c} className="border-b border-border px-3 py-2 font-semibold">{inline(cell)}</th>)}</tr></thead>
            <tbody>{block.rows.map((row,r)=><tr key={r} className="border-b border-border/50 last:border-0">{block.header.map((_,c)=><td key={c} className="max-w-sm px-3 py-2 align-top">{inline(row[c]||"")}</td>)}</tr>)}</tbody>
          </table>
        </div>
        const items=block.lines.map((line,i)=><li key={i} className="pl-1">{inline(line)}</li>)
        return block.type==="ordered"
          ? <ol key={index} start={block.start} className="ml-5 list-decimal space-y-1">{items}</ol>
          : <ul key={index} className="ml-5 list-disc space-y-1">{items}</ul>
      })}
      {blocks.length===0&&<p className="text-muted-foreground">（没有可展示的正文）</p>}
    </div>
    {tooLong&&<button type="button" onClick={()=>setExpanded(value=>!value)}
      className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-primary">
      {expanded?<ChevronUp className="h-3.5 w-3.5"/>:<ChevronDown className="h-3.5 w-3.5"/>}
      {expanded?"收起长篇成果":`展开完整成果（共 ${text.length} 字符）`}
    </button>}
  </div>
}
