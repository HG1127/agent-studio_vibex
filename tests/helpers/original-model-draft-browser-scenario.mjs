// Unexecuted hosted source. Call only within the distinct synthetic-purpose
// original App/index host, after actual Cookie login and strict source review.
// It requires real host SQL metadata/audit getters; it does not mock page APIs.
export async function originalModelDraftBrowserScenario({page,expect,host}){
 if(host.permit?.profile!=='original-model-draft-synthetic-inventory')throw Error('original_model_draft_scenario_purpose_required')
 const before=await host.modelCounts(),key='synthetic-original-draft-page-key-4040'
 await page.getByRole('button',{name:'添加连接',exact:true}).first().click()
 await page.locator('#mc-name').fill('Original unsaved synthetic discovery')
 await page.locator('#mc-base-url').fill('https://api.openai.com/v1')
 await page.locator('#mc-api-key').fill(key)
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/__pg_native/api/v2/model-connections/draft-probe'&&r.request().method()==='POST')
 await page.getByRole('button',{name:'测试连接',exact:true}).click();expect((await response).status()).toBe(200)
 await expect(page.getByText(/已读取服务商模型列表/).first()).toBeVisible()
 await expect(page.getByText('synthetic-discovered-model-alpha',{exact:true})).toBeVisible()
 await expect(page.locator('#mc-api-key')).toHaveValue(key)
 await expect(page.locator('#mc-name')).toHaveValue('Original unsaved synthetic discovery')
 expect(await host.modelCounts()).toEqual(before)
 const audit=await host.draftAudit();expect(audit.owner_and_actor_verified&&audit.secret_free&&audit.admission_and_finish_verified).toBe(true)
 expect(host.inventoryCalls()).toBe(1)
 await page.getByRole('button',{name:'关闭表单',exact:true}).click();await expect(page.locator('#mc-api-key')).toHaveCount(0)
 host.assertNoExternalProviderOrLegacyEffects()
 return{original_controls:true,actual_owner_Cookie_and_SQL_required:true,metadata_unchanged:true,synthetic_inventory_requests:1,provider_network_acceptance:false,unknown_write_receipt_complete:false,production_GO:false}
}
