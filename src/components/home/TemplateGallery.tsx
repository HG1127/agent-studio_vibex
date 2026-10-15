import { ArrowRight, BarChart3, BookOpen, Telescope } from "lucide-react"
import type { TemplatePreset } from "@/pages/Home/useHome"

const ICON_MAP = {
  research: Telescope,
  knowledge: BookOpen,
  data: BarChart3,
} as const

type TemplateGalleryProps = {
  templates: TemplatePreset[]
  onLoadTemplate: (preset: TemplatePreset) => void
}

export function TemplateGallery({ templates, onLoadTemplate }: TemplateGalleryProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((preset) => {
        const Icon = ICON_MAP[preset.icon]
        return (
          <button
            key={preset.key}
            type="button"
            onClick={() => onLoadTemplate(preset)}
            className="group flex h-full flex-col rounded-2xl border border-border bg-card p-5 text-left shadow-md transition duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground shadow-sm transition duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-card-foreground">{preset.title}</h3>
            <p className="mt-1 text-sm font-medium text-primary">{preset.tagline}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{preset.description}</p>
            <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-primary">
              加载这个方案
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </span>
          </button>
        )
      })}
    </div>
  )
}
