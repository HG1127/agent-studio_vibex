import test from "node:test"
import assert from "node:assert/strict"
import { safeMarketplaceQuery, safeChosenCatalogSlug, safeAgentSpecId, addReturnAgentToUrl } from "../src/lib/toolSearchPrivacy.ts"

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
