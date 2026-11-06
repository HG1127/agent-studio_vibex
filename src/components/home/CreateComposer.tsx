import { Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {AuthoringPlanSummary} from './AuthoringRequirements'
import type {AuthoringPreview} from '@/lib/authoringRequirements'
import type {OriginalHomeDesignPreview} from '@/lib/originalHomeDesign'

type CreateComposerProps = {
  userInput: string
  onUserInputChange: (value: string) => void
  onCreate: () => void
  isGenerating: boolean
  authoringPreview?: AuthoringPreview|null
  nativeDesign?:{preview:OriginalHomeDesignPreview|null;pending:boolean;blocked:boolean}
  /** The wizard makes requirement capture the primary desktop task. */
  variant?: "default" | "focus"
}

export function CreateComposer({
  userInput, onUserInputChange, onCreate, isGenerating, authoringPreview,nativeDesign, variant = "default",
}: CreateComposerProps) {
  const focused = variant === "focus"
  const previewed=nativeDesign?!!nativeDesign.preview:!!authoringPreview
  return (
    <div data-agent-requirement-composer
      className={`flex min-w-0 flex-col rounded-2xl border bg-card ${focused
        ? "min-h-[min(440px,58svh)] border-primary/25 p-5 shadow-sm sm:min-h-[clamp(330px,47svh,520px)] sm:p-7"
        : "border-border p-5 shadow-sm"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="agent-requirement"
          className={`block font-semibold text-card-foreground ${focused ? "text-lg" : "text-sm"}`}>
          {focused ? "描述你希望 Agent 完成的任务" : "说说你想要一个什么样的助手"}
        </label>
        {focused && <span className="text-xs text-muted-foreground">第 1 步 · 需求</span>}
      </div>
      {focused && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        建议说明目标、处理资料、期望交付物及限制条件。描述越具体，生成的方案越容易验证。
      </p>}
      <Textarea
        id="agent-requirement"
        rows={focused ? 7 : 3}
        value={userInput}
        onChange={(e) => onUserInputChange(e.target.value)}
        placeholder={focused
          ? "例如：每周分析 AI 半导体领域的重要动态，优先使用公开可靠来源，输出摘要、关键证据及风险，并标注引用。涉及付费或对外发送的操作须先征得批准。"
          : "例如：帮我创建一个能查资料写报告的助手，每周五自动整理行业新闻给我"}
        className={`mt-4 w-full flex-1 resize-y rounded-xl border border-border bg-background px-4 py-4 text-base leading-7 shadow-none placeholder:text-muted-foreground/65 focus-visible:ring-2 focus-visible:ring-primary ${focused ? "min-h-48" : "min-h-28"}`}
      />
      {(nativeDesign?.preview||authoringPreview)&&<section aria-label="生成前需求预览" className="mt-3 rounded border p-3">
        {nativeDesign?.preview?<><p className="text-sm font-medium">请核对将发送的原始要求和本人模型，再确认生成草案。</p><p className="mt-2 whitespace-pre-wrap text-sm">{nativeDesign.preview.instruction}</p><p className="mt-2 text-xs">模型连接：{nativeDesign.preview.model_name} · 模型：{nativeDesign.preview.model_id} · 最多 {nativeDesign.preview.output_token_limit} 输出 token；确认后可能产生费用。</p></>:authoringPreview?<><p className="text-sm font-medium">请核对原始要求和能力缺口，再生成可编辑草案。</p><AuthoringPlanSummary plan={authoringPreview.plan}/></>:null}
      </section>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          {nativeDesign?'预览只核对将发送的内容，不调用模型、不保存需求。确认后保存模型请求回执并在后台生成草案，可能产生费用；不会自动发布。':'预览保存本人的需求记录，不调用模型；生成草案会调用模型并可能产生费用。均不会自动发布。'}
        </p>
        <Button
          type="button"
          size="lg"
          onClick={onCreate}
          disabled={isGenerating || nativeDesign?.blocked || !userInput.trim()&&!nativeDesign?.pending}
          className={`min-h-11 rounded-xl bg-primary px-6 text-primary-foreground transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary ${focused ? "w-full text-sm sm:w-auto" : ""}`}
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {nativeDesign?.pending?'正在查询原请求…':previewed?'正在生成方案…':'正在核对需求…'}
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              {nativeDesign?.pending?'查询原模型请求':previewed?'按已核对需求生成草案':nativeDesign?'预览模型请求':'预览需求与能力'}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
