import { Braces, Trash2 } from "lucide-react"
import { Link } from "react-router-dom"
import type {
  ModelOption,
  ToolOption,
  WfEventRow,
  WfNode,
  WfNodeData,
} from "@/pages/WorkflowCanvas/useWorkflowCanvas"
import { NODE_TYPE_META } from "@/pages/WorkflowCanvas/useWorkflowCanvas"

type NodeRunInfo = {
  nodeStatus: string
  events: WfEventRow[]
  outputText: string
}

type NodeConfigPanelProps = {
  selectedNode: WfNode
  selectedEdge: { id: string } | null
  updateNodeData: (patch: Partial<WfNodeData>) => void
  deleteSelectedNode: () => void
  deleteSelectedEdge: () => void
  customModels: ModelOption[]
  specOptions: { id: string; name: string }[]
  builtinTools: ToolOption[]
  connectedTools: ToolOption[]
  knowledgeBases: { id: string; name: string; document_count: number }[]
  conditionOps: { value: string; label: string }[]
  loopDelimiters: { value: string; label: string }[]
  availableVariables: string[]
  nodeTitles: string[]
  nodeRunInfo: NodeRunInfo | null
}

const FIELD_CLASS =
  "mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
const LABEL_CLASS = "block text-xs font-medium text-muted-foreground"

function VariableChips({
  variables,
  onInsert,
}: {
  variables: string[]
  onInsert: (variable: string) => void
}) {
  return (
    <div className="mt-2">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Braces className="h-3 w-3 text-primary" />
        可用变量（点击插入）
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {variables.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onInsert(item)}
            className="rounded-full bg-secondary px-2 py-0.5 font-mono text-xs text-secondary-foreground transition hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
          >
            {`{{${item}}}`}
          </button>
        ))}
      </div>
    </div>
  )
}

function eventText(evItem: WfEventRow): string {
  const content = evItem.content || {}
  if (evItem.event_type === "node_done") {
    const elapsed = content.elapsed_ms !== undefined ? ` ｜ 耗时 ${Number(content.elapsed_ms)}ms` : ""
    const noteText = content.note ? ` ｜ ${String(content.note)}` : ""
    return `输入：${String(content.input || "—").slice(0, 300)}\n输出：${String(content.output || "—").slice(0, 800)}${elapsed}${noteText}`
  }
  if (evItem.event_type === "node_failed") {
    return `失败：${String(content.error || "")}${content.detail ? `\n详情：${String(content.detail).slice(0, 300)}` : ""}`
  }
  if (evItem.event_type === "node_skipped") return String(content.reason || "节点被跳过")
  if (evItem.event_type === "node_start") return "开始执行"
  if (evItem.event_type === "approval_pending") {
    return `等待批准：工具 ${String(content.tool_name || "—")}\n输入摘要：${String(content.input_summary || "—").slice(0, 300)}`
  }
  if (evItem.event_type === "approval") return String(content.message || "")
  if (evItem.event_type === "observation") return String(content.message || "")
  return String(content.message || JSON.stringify(content))
}

export function NodeConfigPanel({
  selectedNode,
  selectedEdge,
  updateNodeData,
  deleteSelectedNode,
  deleteSelectedEdge,
  customModels,
  specOptions,
  builtinTools,
  connectedTools,
  conditionOps,
  knowledgeBases,
  loopDelimiters,
  availableVariables,
  nodeTitles,
  nodeRunInfo,
}: NodeConfigPanelProps) {
  const nodeType = String(selectedNode.type || "model")
  const data = selectedNode.data || {}
  const meta = NODE_TYPE_META[nodeType as keyof typeof NODE_TYPE_META] || NODE_TYPE_META.model

  const appendVar = (field: "prompt" | "params_template" | "output_template", variable: string) => {
    const current = String(data[field] || "")
    updateNodeData({ [field]: `${current}{{${variable}}}` } as Partial<WfNodeData>)
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-md">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-card-foreground">节点配置 · {meta.label}</h3>
        <button
          type="button"
          onClick={deleteSelectedNode}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Trash2 className="h-3 w-3" />
          删除节点
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <label className={LABEL_CLASS} htmlFor="wf-node-title">节点标题（变量引用用它定位，需唯一）</label>
          <input
            id="wf-node-title"
            className={FIELD_CLASS}
            value={String(data.title || "")}
            maxLength={30}
            onChange={(event) => updateNodeData({ title: event.target.value })}
          />
        </div>

        {nodeType === "start" && (
          <div>
            <label className={LABEL_CLASS} htmlFor="wf-start-hint">任务输入说明（运行时用户填写的指令注入 {"{{input}}"}）</label>
            <input
              id="wf-start-hint"
              className={FIELD_CLASS}
              placeholder="例如：输入你想让这条流程完成的任务"
              value={String(data.input_hint || "")}
              maxLength={80}
              onChange={(event) => updateNodeData({ input_hint: event.target.value })}
            />
          </div>
        )}

        {nodeType === "model" && (
          <>
            <div>
              <label className={LABEL_CLASS} htmlFor="wf-model-select">模型</label>
              <select
                id="wf-model-select"
                className={FIELD_CLASS}
                value={String(data.model || "")}
                onChange={(event) => updateNodeData({ model: event.target.value })}
              >
                {customModels.length === 0 && <option value="">暂无模型连接，请先到「模型连接」页添加</option>}
                {customModels.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}（{item.hint}）
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="wf-model-prompt">提示词模板</label>
              <textarea
                id="wf-model-prompt"
                className={`${FIELD_CLASS} min-h-36 font-sans`}
                placeholder="例如：请根据以下任务写一段介绍：{{input}}"
                value={String(data.prompt || "")}
                onChange={(event) => updateNodeData({ prompt: event.target.value })}
              />
              <VariableChips variables={availableVariables} onInsert={(vItem) => appendVar("prompt", vItem)} />
            </div>
          </>
        )}

        {nodeType === "agent" && (
          <>
            <div>
              <label className={LABEL_CLASS} htmlFor="wf-agent-spec">关联助手方案（角色卡）</label>
              <select
                id="wf-agent-spec"
                className={FIELD_CLASS}
                value={String(data.spec_id || "")}
                onChange={(event) => updateNodeData({ spec_id: event.target.value })}
              >
                <option value="">选择助手方案</option>
                {specOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="wf-agent-steps">思考-行动轮数上限</label>
              <select
                id="wf-agent-steps"
                className={FIELD_CLASS}
                value={String(data.max_steps ?? 3)}
                onChange={(event) => updateNodeData({ max_steps: event.target.value })}
              >
                {["1", "2", "3", "4", "5"].map((v) => (
                  <option key={v} value={v}>
                    {v} 轮
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="wf-agent-prompt">输入模板（可用变量）</label>
              <textarea
                id="wf-agent-prompt"
                className={`${FIELD_CLASS} min-h-24 font-sans`}
                placeholder="例如：请基于以下上游产出完成你的职责：{{input}}"
                value={String(data.prompt || "")}
                onChange={(event) => updateNodeData({ prompt: event.target.value })}
              />
              <VariableChips variables={availableVariables} onInsert={(vItem) => appendVar("prompt", vItem)} />
            </div>
          </>
        )}
        {nodeType === "tool" && (
          <>
            <div>
              <label className={LABEL_CLASS} htmlFor="wf-tool-select">工具</label>
              <select
                id="wf-tool-select"
                className={FIELD_CLASS}
                value={String(data.tool || "")}
                onChange={(event) => updateNodeData({ tool: event.target.value, ...(event.target.value === "knowledge_search" ? { params_template: '{"query":"{{input}}"}' } : {}) })}
              >
                <optgroup label="内置工具">
                  {builtinTools.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
                {connectedTools.length > 0 && (
                  <optgroup label="已连接的外部工具">
                    {connectedTools.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                {[...builtinTools, ...connectedTools].find((item) => item.value === String(data.tool || ""))?.hint ||
                  "选择工具后这里显示入参说明"}
              </p>
            </div>
            {String(data.tool || "") === "knowledge_search" && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-medium text-foreground">检索的知识库</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  可选择多个知识库。执行前会验证当前账户的访问权限；搜索结果包含文件名与片段出处。
                </p>
                <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">
                  {knowledgeBases.map(kb => {
                    const ids = Array.isArray(data.knowledge_base_ids) ? data.knowledge_base_ids as string[] : []
                    return <label key={kb.id} className="flex items-center gap-2 rounded-lg bg-background px-2 py-2 text-xs">
                      <input type="checkbox" checked={ids.includes(kb.id)}
                        onChange={event => {
                          const next = event.target.checked
                            ? [...new Set([...ids, kb.id])].slice(0, 10)
                            : ids.filter(id => id !== kb.id)
                          updateNodeData({ knowledge_base_ids: next })
                        }} className="accent-primary" />
                      <span className="min-w-0 flex-1 truncate">{kb.name}</span>
                      <span className="text-[11px] text-muted-foreground">{kb.document_count} 份</span>
                    </label>
                  })}
                  {!knowledgeBases.length && <p className="text-xs text-muted-foreground">当前账号暂无知识库</p>}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  未选择时，仅检索工作流自身的输入与节点输出。<Link to="/knowledge-bases" className="text-primary underline">管理知识库</Link>
                </p>
              </div>
            )}
            <div>
              <label className={LABEL_CLASS} htmlFor="wf-tool-params">入参 JSON 模板（支持占位符变量）</label>
              <textarea
                id="wf-tool-params"
                className={`${FIELD_CLASS} min-h-28 font-mono text-xs`}
                placeholder={'例如：{"expression":"2+3*4"}'}
                value={String(data.params_template || "")}
                onChange={(event) => updateNodeData({ params_template: event.target.value })}
              />
              <VariableChips variables={availableVariables} onInsert={(vItem) => appendVar("params_template", vItem)} />
            </div>
          </>
        )}

        {nodeType === "condition" && (
          <>
            <div>
              <label className={LABEL_CLASS} htmlFor="wf-cond-ref">判定文本来源（默认取最近上游节点的输出）</label>
              <select
                id="wf-cond-ref"
                className={FIELD_CLASS}
                value={String(data.ref_title || "")}
                onChange={(event) => updateNodeData({ ref_title: event.target.value })}
              >
                <option value="">最近上游节点</option>
                {nodeTitles
                  .filter((item) => item !== String(data.title || ""))
                  .map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LABEL_CLASS} htmlFor="wf-cond-op">规则</label>
                <select
                  id="wf-cond-op"
                  className={FIELD_CLASS}
                  value={String(data.op || "contains")}
                  onChange={(event) => updateNodeData({ op: event.target.value })}
                >
                  {conditionOps.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="wf-cond-value">比较值</label>
                <input
                  id="wf-cond-value"
                  className={FIELD_CLASS}
                  placeholder="关键词或数值"
                  value={String(data.value || "")}
                  onChange={(event) => updateNodeData({ value: event.target.value })}
                />
              </div>
            </div>
            <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
              规则在上游输出文本上评估：包含 / 不包含按关键词匹配，数值比较会取输出中第一个数字。两个出口分别从节点右侧「满足」「不满足」句柄拉线。
            </p>
          </>
        )}

        {nodeType === "loop" && (
          <>
            <div>
              <label className={LABEL_CLASS} htmlFor="wf-loop-mode">循环模式</label>
              <select
                id="wf-loop-mode"
                className={FIELD_CLASS}
                value={String(data.mode || "count")}
                onChange={(event) => updateNodeData({ mode: event.target.value })}
              >
                <option value="count">按次数重复 N 轮</option>
                <option value="list">按列表逐项循环</option>
              </select>
            </div>
            {String(data.mode || "count") === "count" ? (
              <div>
                <label className={LABEL_CLASS} htmlFor="wf-loop-count">循环次数（轮）</label>
                <input
                  id="wf-loop-count"
                  type="number"
                  min={1}
                  max={1000}
                  className={FIELD_CLASS}
                  value={String(data.count ?? "")}
                  onChange={(event) => updateNodeData({ count: event.target.value })}
                />
              </div>
            ) : (
              <>
                <div>
                  <label className={LABEL_CLASS} htmlFor="wf-loop-source">列表来源（渲染变量后按下方方式切分，剔空白、上限 50 项）</label>
                  <select
                    id="wf-loop-source"
                    className={FIELD_CLASS}
                    value={String(data.list_source || "")}
                    onChange={(event) => updateNodeData({ list_source: event.target.value })}
                  >
                    <option value="">请选择变量来源</option>
                    {availableVariables.map((item) => (
                      <option key={item} value={`{{${item}}}`}>
                        {`{{${item}}}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLASS} htmlFor="wf-loop-delim">切分方式</label>
                  <select
                    id="wf-loop-delim"
                    className={FIELD_CLASS}
                    value={String(data.delimiter || "line")}
                    onChange={(event) => updateNodeData({ delimiter: event.target.value })}
                  >
                    {loopDelimiters.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div>
              <label className={LABEL_CLASS} htmlFor="wf-loop-stop">提前终止关键词（可留空）</label>
              <input
                id="wf-loop-stop"
                className={FIELD_CLASS}
                placeholder="任一轮循环体输出包含该关键词即提前结束"
                value={String(data.stop_keyword || "")}
                maxLength={50}
                onChange={(event) => updateNodeData({ stop_keyword: event.target.value })}
              />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="wf-loop-max">最大轮数安全上限（1-20）</label>
              <input
                id="wf-loop-max"
                type="number"
                min={1}
                max={20}
                className={FIELD_CLASS}
                value={String(data.max_iterations ?? "")}
                onChange={(event) => updateNodeData({ max_iterations: event.target.value })}
              />
            </div>
            <p className="rounded-xl bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              从右侧「循环体」句柄拉线连出要重复的子图，并把循环体末端连回本节点（回边）；「退出」句柄在循环结束后继续下游。循环体内可用 {"{{loop.item}}"}（当前列表项，按次数模式为轮次序号文本）与 {"{{loop.index}}"}（当前轮次，从 1 起）。
            </p>
          </>
        )}

        {nodeType === "end" && (
          <div>
            <label className={LABEL_CLASS} htmlFor="wf-end-tpl">输出模板（留空则默认取连入节点的输出）</label>
            <textarea
              id="wf-end-tpl"
              className={`${FIELD_CLASS} min-h-24 font-sans`}
              placeholder="例如：本次结果：{{模型 1.output}}"
              value={String(data.output_template || "")}
              onChange={(event) => updateNodeData({ output_template: event.target.value })}
            />
            <VariableChips variables={availableVariables} onInsert={(vItem) => appendVar("output_template", vItem)} />
          </div>
        )}
      </div>

      {selectedEdge && (
        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            onClick={deleteSelectedEdge}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Trash2 className="h-3 w-3" />
            删除选中的连线
          </button>
        </div>
      )}

      {nodeRunInfo && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-card-foreground">本节点运行详情</h4>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                nodeRunInfo.nodeStatus === "failed"
                  ? "bg-destructive/10 text-destructive"
                  : nodeRunInfo.nodeStatus === "skipped"
                    ? "bg-muted text-muted-foreground"
                    : "bg-primary/10 text-primary"
              }`}
            >
              {nodeRunInfo.nodeStatus === "done"
                ? "成功"
                : nodeRunInfo.nodeStatus === "failed"
                  ? "失败"
                  : nodeRunInfo.nodeStatus === "skipped"
                    ? "已跳过"
                    : nodeRunInfo.nodeStatus === "running"
                      ? "运行中"
                      : "已执行"}
            </span>
          </div>
          <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
            {nodeRunInfo.events.map((evItem, evIdx) => {
              const roundNum = Number(evItem.content?.round || 0)
              const prevRoundNum =
                evIdx > 0 ? Number(nodeRunInfo.events[evIdx - 1].content?.round || 0) : 0
              const showRoundHeader = roundNum > 0 && roundNum !== prevRoundNum
              return (
                <div key={evItem.id}>
                  {showRoundHeader && (
                    <p className="mb-1 mt-2 text-xs font-semibold text-primary">第 {roundNum} 轮</p>
                  )}
                  <div className="rounded-xl bg-muted px-3 py-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-card-foreground">
                      {evItem.event_type === "node_start"
                        ? "开始执行"
                        : evItem.event_type === "node_done"
                          ? "执行完成"
                          : evItem.event_type === "node_failed"
                            ? "执行失败"
                            : evItem.event_type === "approval_pending"
                              ? "等待批准"
                              : evItem.event_type === "approval"
                                ? "审批决定"
                                : evItem.event_type === "observation"
                                  ? "调用被拒绝"
                                  : "已跳过"}
                      {roundNum > 0 && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                          第 {roundNum} 轮
                        </span>
                      )}
                    </p>
                    <pre className="mt-1 whitespace-pre-wrap break-all font-sans text-xs leading-relaxed text-muted-foreground">
                      {eventText(evItem)}
                    </pre>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
