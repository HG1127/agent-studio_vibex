import test from "node:test"
import assert from "node:assert/strict"
import { safeMarketplaceQuery, safeChosenCatalogSlug, safeAgentSpecId, addReturnAgentToUrl,
  agentResourceSetupUrl, agentResourceReturnContext, continueAgentResourceSetupUrl } from "../src/lib/toolSearchPrivacy.ts"

test("market auto discovery accepts only generic safe categories",()=>{
  assert.equal(safeMarketplaceQuery("上传PDF文件自动文档解析"),"pdf")
  assert.equal(safeMarketplaceQuery("查询 GitHub 代码仓库"),"github")
  assert.equal(safeMarketplaceQuery("处理 Excel 电子表格"),"spreadsheet")
  assert.equal(safeMarketplaceQuery("500IPO个人投资人秘密名册联系人"),"")
  assert.equal(safeMarketplaceQuery("陈先生与公司机密合作项目"),"")
})
test("secrets are never forwarded as directory searches, even with public words",()=>{
  assert.equal(safeMarketplaceQuery("sk-test_0123456789 解析PDF"),"")
  assert.equal(safeMarketplaceQuery("Authorization Bearer verySensitive999999 Gmail"),"")
  assert.equal(safeMarketplaceQuery("password=secret123 PDF"),"")
  assert.equal(safeMarketplaceQuery("api_key=abcdef123 github"),"")
})
test("catalog-selected slugs are bounded and don't accept URL/path injection",()=>{
  assert.equal(safeChosenCatalogSlug("@vendor/github"),"@vendor/github")
  assert.equal(safeChosenCatalogSlug("vendor/repository"),"vendor/repository")
  assert.equal(safeChosenCatalogSlug("https://secret.example?api_key=test"),"")
  assert.equal(safeChosenCatalogSlug("vendor/../../secret"),"")
  assert.equal(safeChosenCatalogSlug("vendor\\private"),"")
})
test("market link carries only validated owner-scoped Agent ID, never arbitrary redirects",()=>{
  assert.equal(safeAgentSpecId("abcdefghijklmno"),"abcdefghijklmno")
  assert.equal(safeAgentSpecId("../admin?token=abc"),"")
  assert.equal(addReturnAgentToUrl("/plugin-market?tool=pdf","abcdefghijklmno"),
    "/plugin-market?tool=pdf&returnSpec=abcdefghijklmno")
  assert.equal(addReturnAgentToUrl("/plugin-market","abcdefghijklmno"),
    "/plugin-market?returnSpec=abcdefghijklmno")
  assert.equal(addReturnAgentToUrl("/plugin-market","https://evil.example/"),"/plugin-market")
})

test("an unsaved Agent carries setup context without inventing a saved-record return",()=>{
  const link=agentResourceSetupUrl("/plugin-market?tool=browser", "", "browser_need")
  const url=new URL(link,"https://studio.example")
  assert.equal(url.searchParams.get("tool"),"browser")
  assert.equal(url.searchParams.get("agentSetup"),"1")
  assert.equal(url.searchParams.has("returnSpec"),false)
  const context=agentResourceReturnContext(url.searchParams)
  assert.equal(context.fromAgent,true)
  assert.equal(context.savedAgentUrl,"")
  assert.equal(context.capabilityId,"browser_need")
})

test("the saved-version return preserves the exact Agent and capability identifiers",()=>{
  const link=agentResourceSetupUrl("/execution-connections", "abcdefghijklmno", "browser_need")
  const context=agentResourceReturnContext(new URL(link,"https://studio.example").searchParams)
  const saved=new URL(context.savedAgentUrl,"https://studio.example")
  assert.equal(saved.pathname,"/agent-create")
  assert.equal(saved.searchParams.get("spec"),"abcdefghijklmno")
  assert.equal(saved.searchParams.get("step"),"3")
  assert.equal(saved.searchParams.get("focusCapability"),"browser_need")
})

test("switching resource pages preserves only bounded setup identifiers",()=>{
  const params=new URLSearchParams("agentSetup=1&returnSpec=abcdefghijklmno&returnCapability=browser_need&returnUrl=https%3A%2F%2Fevil.example&prompt=private-task")
  const link=continueAgentResourceSetupUrl("/tool-connections?template=browser-read",params)
  const url=new URL(link,"https://studio.example")
  assert.equal(url.searchParams.get("returnSpec"),"abcdefghijklmno")
  assert.equal(url.searchParams.get("returnCapability"),"browser_need")
  assert.equal(url.searchParams.get("template"),"browser-read")
  assert.equal(url.searchParams.has("returnUrl"),false)
  assert.equal(url.searchParams.has("prompt"),false)
  assert.equal(continueAgentResourceSetupUrl("/plugin-market?tool=browser",new URLSearchParams()),"/plugin-market?tool=browser")
})

test("five execution-resource steps preserve Agent context and exact view across pages",()=>{
  const saved="abcdefghijklmno",capability="browser_need"
  let link=agentResourceSetupUrl("/execution-connections?capability=browser",saved,capability)
  for(const [path,view] of [
    ["/tool-hub?view=devices","devices"],["/tool-hub?view=debug","debug"],
    ["/tool-hub?view=activity","activity"],["/tool-hub?view=monitor","monitor"],
  ]){
    link=continueAgentResourceSetupUrl(path,new URL(link,"https://studio.example").searchParams)
    const parsed=new URL(link,"https://studio.example")
    assert.equal(parsed.pathname,"/tool-hub")
    assert.equal(parsed.searchParams.get("view"),view)
    assert.equal(parsed.searchParams.get("returnSpec"),saved)
    assert.equal(parsed.searchParams.get("returnCapability"),capability)
    assert.equal(parsed.searchParams.get("agentSetup"),"1")
  }
  assert.equal(agentResourceReturnContext(new URL(link,"https://studio.example").searchParams)
    .savedAgentUrl,"/agent-create?spec=abcdefghijklmno&step=3&focusCapability=browser_need")
  const ordinary=continueAgentResourceSetupUrl("/tool-hub?view=activity",
    new URLSearchParams("prompt=secret&returnUrl=https%3A%2F%2Fevil.example"))
  assert.equal(ordinary,"/tool-hub?view=activity")
})

test("invalid setup identifiers never become return targets or interpolated fragments",()=>{
  const link=agentResourceSetupUrl("https://evil.example/", "../admin?token=secret", "#malicious?value=secret")
  assert.equal(link,"/tool-connections?agentSetup=1")
  const context=agentResourceReturnContext(new URLSearchParams("returnSpec=https%3A%2F%2Fevil.example&returnCapability=%3Cscript%3E"))
  assert.equal(context.fromAgent,false)
  assert.equal(context.savedAgentUrl,"")
  assert.equal(context.capabilityId,"")
})

test("existing saved-Agent setup URLs remain recognized and repeated annotation stays unambiguous",()=>{
  const old=agentResourceReturnContext(new URLSearchParams("returnSpec=abcdefghijklmno"))
  assert.equal(old.fromAgent,true)
  const first=agentResourceSetupUrl("/plugin-market?tool=pdf#results","abcdefghijklmno")
  const second=agentResourceSetupUrl(first,"123456789012345","need_2")
  const url=new URL(second,"https://studio.example")
  assert.deepEqual(url.searchParams.getAll("returnSpec"),["123456789012345"])
  assert.deepEqual(url.searchParams.getAll("agentSetup"),["1"])
  assert.equal(url.hash,"#results")
})
