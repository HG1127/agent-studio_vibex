/** Source-only hosted story for Root's ORIGINAL employee UI fixture.
 * Required fixture ports must forward the genuine Native HTTP transaction;
 * do not replace them with page.route mocks, SQLite or standalone pilot pages. */
export async function originalQuality089HostedStory({page,expect,fixture}){
 for(const key of ['assertIndependentQuality089Profile','dropNextActualQualityReply','assertQualityReceiptAndOwnerAudit','originalVersionReleaseQualityStory'])if(typeof fixture[key]!=='function')throw Error('quality089_hosted_fixture_port_required:'+key)
 await fixture.assertIndependentQuality089Profile({materials080:false,artifacts081:false})
 const {origin,employeeId,specId}=fixture,base='/api/v2/original-ui/agent-quality/'+specId,originValue=new URL(origin).origin,posts=[]
 const owned=r=>new URL(r.url()).origin===originValue&&new URL(r.url()).pathname.endsWith(base),observe=request=>{if(owned(request)&&request.method()==='POST')posts.push(request.postDataJSON())}
 page.on('request',observe)
 try{
  await page.goto(new URL('/agent-run?spec='+specId,origin).href)
  await page.getByRole('tab',{name:'验收条件',exact:true}).click()
  const card=page.getByRole('region',{name:'可验证的运行质量断言',exact:true})
  await card.getByRole('button',{name:'添加断言',exact:true}).click()
  const expected=' 确认风险 ';await card.getByPlaceholder('例如：风险提示 / 核心结论',{exact:true}).fill(expected)
  const ack=page.waitForResponse(r=>owned(r)&&r.request().method()==='POST')
  await card.getByRole('button',{name:'保存检查条件',exact:true}).click();const response=await ack;expect(response.status()).toBe(200)
  const receipt=(await response.json()).item;expect(receipt.employee_id).toBe(employeeId);expect(receipt.spec_id).toBe(specId);expect(receipt.after.checks).toEqual([{type:'contains',expected}]);expect(receipt.after.spec_revision).toBe(receipt.before_revision+1)
  await fixture.assertQualityReceiptAndOwnerAudit(receipt)
  await card.getByPlaceholder('例如：风险提示 / 核心结论',{exact:true}).fill(' 第二次完整条件 ')
  // Fixture closes the real forwarded reply only after the actual SQL commit.
  await fixture.dropNextActualQualityReply({employeeId,specId})
  await card.getByRole('button',{name:'保存检查条件',exact:true}).click()
  await expect(card.getByRole('button',{name:'核对原保存结果（不重发）',exact:true})).toBeEnabled()
  const key='agentstudio.original.quality.v1.'+employeeId+'.'+specId,marker=await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),key)
  expect(Object.keys(marker).sort()).toEqual(['protocol','employee_id','spec_id','request_id','request_sha256','expected_spec_revision','expected_source_sha256','expected_checks_sha256'].sort())
  expect(JSON.stringify(marker)).not.toContain('第二次完整条件')
  const query=page.waitForResponse(r=>new URL(r.url()).origin===originValue&&new URL(r.url()).pathname.endsWith(base+'/receipts/'+marker.request_id)&&r.request().method()==='GET')
  await card.getByRole('button',{name:'核对原保存结果（不重发）',exact:true}).click();expect((await query).status()).toBe(200)
  await expect.poll(()=>page.evaluate(key=>sessionStorage.getItem(key),key)).toBe(null)
  const latest=card.getByRole('button',{name:'读取最新检查条件',exact:true});if(await latest.isVisible())await latest.click()
  expect(posts).toHaveLength(2)
  await expect(card.getByPlaceholder('例如：风险提示 / 核心结论',{exact:true})).toHaveValue(' 第二次完整条件 ')
  // Root supplies actual completed owned Native runs and original release-page
  // actions. They must check failed rules even with acknowledge_untested=true.
  await fixture.originalVersionReleaseQualityStory({page,expect,employeeId,specId})
 }finally{page.off('request',observe)}
}
