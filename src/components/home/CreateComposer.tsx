import { Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

type CreateComposerProps = {
  userInput: string
  onUserInputChange: (value: string) => void
  onCreate: () => void
  isGenerating: boolean
}

export function CreateComposer({ userInput, onUserInputChange, onCreate, isGenerating }: CreateComposerProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
      <label htmlFor="agent-requirement" className="mb-2 block text-sm font-semibold text-card-foreground">
        说说你想要一个什么样的助手
      </label>
      <Textarea
        id="agent-requirement"
        rows={3}
        value={userInput}
        onChange={(e) => onUserInputChange(e.target.value)}
        placeholder={'例如：帮我做一个能查资料写报告的助手，每周五自动整理行业新闻给我'}
        className="resize-none border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-primary"
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">生成方案会调用一次 AI 模型</p>
        <Button
          type="button"
          onClick={onCreate}
          disabled={isGenerating || !userInput.trim()}
          className="rounded-xl bg-primary px-6 text-primary-foreground shadow-md transition hover:bg-primary/90 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在生成方案…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              创建助手
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
