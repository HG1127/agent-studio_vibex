import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8")
test("Public template API is sanitized on read, publish and redemption",()=>{
  const hook=source("pocketbase/pb_hooks/template_market_api.pb.js")
  assert.match(hook,/spec: safeTemplateSpec\(specObj\)/)
  assert.equal((hook.match(/specObj = safeTemplateSpec\(specObj\)/g)||[]).length,2)
  assert.match(hook,/knowledge_base_ids: \[\]/)
  assert.match(hook,/quality_checks: \[\]/)
  assert.match(hook,/require_approval: true/)
  assert.match(hook,/Object\.prototype\.hasOwnProperty\.call\(allowed,name\)/)
})
test("Template publishing previews public text and requires explicit review",()=>{
  const modal=source("src/components/template-market/PublishTemplateDialog.tsx")
  assert.match(modal,/公开模板文本内容预览/)
  assert.match(modal,/setReviewed\(false\)/)
  assert.match(modal,/selected\?\.updated/)
  assert.match(source("src/pages/TemplateMarket/useTemplateMarket.ts"),/expected_updated: sourceVersion/)
  assert.match(modal,/确认已核查公开模板的任务文本/)
  assert.match(modal,/!publishDescription\.trim\(\) \|\| !reviewed/)
  assert.match(modal,/specListError/)
})
test("Template cloning goes through resource setup and never pretends old grants work",()=>{
  const market=source("src/pages/TemplateMarket/useTemplateMarket.ts")
  const confirm=source("src/components/template-market/UseConfirmDialog.tsx")
  const card=source("src/components/template-market/TemplateCard.tsx")
  assert.match(market,/navigate\(\`\/agent-create\?spec=/)
  assert.match(confirm,/原作者的模型密钥、知识库绑定、私人连接和写入审批不会自动转移/)
  assert.match(card,/复制并配置/)
})
test("Template lists expose load errors and protect destructive actions",()=>{
  const market=source("src/pages/TemplateMarket/useTemplateMarket.ts")
  const mine=source("src/components/template-market/MyPublishesList.tsx")
  assert.match(market,/setMineError\("我的发布列表加载失败/)
  assert.match(market,/setMarketLoadError\("模板市场加载失败/)
  assert.match(source("src/pages/TemplateMarket/TemplateMarketPage.tsx"),/重新加载模板市场/)
  assert.match(market,/setSpecListError\("Agent 列表加载失败/)
  assert.match(mine,/role="alert"/)
  assert.match(market,/永久删除模板/)
  assert.match(market,/从市场下架|市场下架/)
})
