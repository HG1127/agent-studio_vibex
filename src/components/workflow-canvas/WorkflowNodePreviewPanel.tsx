import { useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, FlaskConical } from "lucide-react"
import type { WfEdge, WfNode, WfNodeType } from "@/pages/WorkflowCanvas/useWorkflowCanvas"
import { previewDependencies, previewWorkflowNode, isWorkflowNodeInLoopBody,
  NODE_PREVIEW_MAX_INPUT, WORKFLOW_NODE_IO_CONTRACTS } from "@/lib/workflowNodePreview"
import { WorkflowModelNodeLiveDebug } from "./WorkflowModelNodeLiveDebug"

type Props = {
  node: WfNode
  nodes: WfNode[]
  edges: WfEdge[]
  allowedModelSelections: readonly string[]
  lastRun?: { instruction: string; outputs: Record<string, string> }
}

/** No fetch/tool/model calls. Key by selected node ID in the parent to reset local samples. */
export function WorkflowNodePreviewPanel({node, nodes, edges, lastRun, allowedModelSelections}: Props) {
  const [input, setInput] = useState("")
  const [samples, setSamples] = useState<Record<string,string>>({})
  const [useLast, setUseLast] = useState(false)
  const [notice, setNotice] = useState("")
  const [loopItem, setLoopItem] = useState("示例项")
  const [loopIndex, setLoopIndex] = useState("1")
  const contract = WORKFLOW_NODE_IO_CONTRACTS[(node.type || "model") as WfNodeType]
  const graph = useMemo(() => ({nodes, edges}), [nodes, edges])
  const dependencies = useMemo(() => previewDependencies(graph, node.id), [graph, node.id])
  const inLoopBody = useMemo(() => isWorkflowNodeInLoopBody(graph, node.id), [graph, node.id])
  const result = useMemo(() => previewWorkflowNode(graph, node.id, {
    input: input || (useLast ? lastRun?.instruction || "" : ""),
    outputs: {...(useLast ? lastRun?.outputs || {} : {}), ...samples},
    loop: inLoopBody && Number.isInteger(Number(loopIndex)) && Number(loopIndex) >= 1
      ? {item: loopItem, index: Number(loopIndex)} : undefined,
  }), [graph, node.id, input, useLast, lastRun, samples, inLoopBody, loopItem, loopIndex])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.renderedInput)
      setNotice("渲染后的输入已复制")
    } catch { setNotice("浏览器不允许复制，请手动选中文本") }
  }
  return (
    <details data-workflow-node-preview className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold focus-visible:outline-primary">
        <span className="inline-flex items-center gap-2"><FlaskConical size={16} className="text-primary"/>节点沙盒 · 本地预览</span>
        <ChevronDown size={15} className="text-muted-foreground"/>
      </summary>
      <p className="mt-3 rounded-lg bg-secondary/70 p-3 text-xs leading-relaxed text-muted-foreground">
        仅在浏览器中模拟变量替换、条件判断、工具 JSON 入参和循环列表。不会调用模型、Agent、工具或外部接口，不会产生费用或执行写操作。
      </p>
      <div className="mt-3 space-y-3">
        {contract && (
        <p className="mt-2 rounded-lg border border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          运行时数据契约：输入为 {contract.input}；输出为 {contract.output}。这是类型提示，不代替运行结果验证。
        </p>
      )}

        {lastRun && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-xs">
            <input type="checkbox" checked={useLast} onChange={e=>setUseLast(e.target.checked)} className="mt-0.5 accent-primary"/>
            <span>
              <strong className="block font-medium text-card-foreground">使用当前工作流已查看运行的样本</strong>
              <span className="mt-1 block text-muted-foreground">仅本地读取已有记录，不发起运行。历史记录可能来自旧版节点配置，也可能包含业务资料。</span>
            </span>
          </label>
        )}
        <label className="block text-xs font-medium text-muted-foreground">
          模拟任务指令（{"{{input}}"}）
          <textarea rows={3} maxLength={NODE_PREVIEW_MAX_INPUT} value={input}
            onChange={e=>setInput(e.target.value)} placeholder={useLast ? "留空使用已查看运行的任务指令" : "输入示例任务"}
            className="mt-1.5 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"/>
        </label>
        {inLoopBody && (
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-semibold">模拟循环当前项（只影响预览）</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_92px]">
              <label className="block text-xs text-muted-foreground">
                {"{{loop.item}}"}
                <input type="text" maxLength={4000} value={loopItem}
                  onChange={e => setLoopItem(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"/>
              </label>
              <label className="block text-xs text-muted-foreground">
                {"{{loop.index}}"}
                <input type="number" min={1} max={1000} step={1} value={loopIndex}
                  onChange={e => setLoopIndex(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"/>
              </label>
            </div>
          </div>
        )}
        {dependencies.length > 0 && (
          <details className="rounded-lg border border-border bg-background p-3">
            <summary className="cursor-pointer text-xs font-semibold">上游节点输出样本（{dependencies.length} 个，可选）</summary>
            <p className="mt-2 text-xs text-muted-foreground">此处的输入只在本地使用，不保存到工作流，不修改历史运行。</p>
            <div className="mt-2 space-y-3">
              {dependencies.map(source => (
                <label key={source.id} className="block text-xs text-muted-foreground">
                  {String(source.data.title || source.id)}
                  <textarea rows={2} maxLength={4000} value={samples[source.id] ?? ""}
                    onChange={e=>setSamples(prev=>{
                      const next={...prev}
                      if(e.target.value) next[source.id]=e.target.value
                      else delete next[source.id]
                      return next
                    })}
                    placeholder={useLast && lastRun?.outputs[source.id] !== undefined ? "留空使用历史样本" : "填写模拟节点输出"}
                    className="mt-1.5 w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-xs text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"/>
                </label>
              ))}
            </div>
          </details>
        )}
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">节点检查结果</p>
            <p className="text-[11px] text-muted-foreground">{result.source}</p>
          </div>
          {result.errors.length ? (
            <div role="alert" className="mt-2 space-y-1 text-xs text-destructive">
              {result.errors.map((s,i)=><p key={i} className="flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0"/>{s}</p>)}
            </div>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-primary"><CheckCircle2 size={14}/>本地规则检查通过，不代表真实执行成功</p>
          )}
          {result.missing.length > 0 && <p className="mt-2 text-xs text-destructive">缺失变量样本：{result.missing.slice(0,6).join("、")}</p>}
          {result.warnings.map((w,i)=><p key={i} className="mt-2 text-xs leading-relaxed text-muted-foreground">{w}</p>)}
          <div className="mt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">{result.nodeType==="tool"?"渲染后的工具入参":"渲染后的输入"}</p>
              {result.renderedInput && <button type="button" onClick={()=>void copy()} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"><Copy size={12}/>复制</button>}
            </div>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-2 text-xs leading-relaxed">{result.renderedInput || "（空）"}</pre>
            {notice && <p role="status" className="mt-1 text-xs text-muted-foreground">{notice}</p>}
          </div>
          {result.branch && <p className="mt-3 text-xs font-semibold text-primary">模拟条件分支：{result.branch==="true"?"满足 → true 出口":"不满足 → false 出口"}</p>}
          {result.estimatedRounds !== undefined && <p className="mt-2 text-xs">预计循环 {result.estimatedRounds} 轮{result.sampleItems?.length ? "，前几项：" + result.sampleItems.join("、").slice(0,160) : ""}</p>}
          {result.output && <div className="mt-3">
            <p className="text-xs font-semibold">模拟输出（尚未执行工作流）</p>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-2 text-xs">{result.output.slice(0,4000)}</pre>
          </div>}
        </div>
        {node.type === "model" && (
          <WorkflowModelNodeLiveDebug
            model={String(node.data.model || "")}
            allowedModelSelections={allowedModelSelections}
            preview={result}
          />
        )}
      </div>
    </details>
  )
}
