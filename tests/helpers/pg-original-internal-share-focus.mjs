import assert from 'node:assert/strict'
/** Exercise the original window-focus hook and observe its real Native Cookie
 * read. Bringing a headless tab forward alone is not a focus-event receipt. */
export async function focusOriginalInternalShareEmployee(page,{origin,employee}){
 assert(new URL(origin).origin===origin&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(employee))
 let verifiedEmployee=null
 const verified=page.waitForResponse(async response=>{
  const url=new URL(response.url())
  if(url.origin!==origin||url.pathname!=='/__pg_native/api/native-auth/me'||url.search||response.request().method()!=='GET'||response.status()!==200)return false
  try{const value=await response.json();if(value?.authenticated!==true||value.user?.id!==employee)return false;verifiedEmployee=value.user.id;return true}catch{return false}
 },{timeout:8000})
 void verified.catch(()=>{})
 await page.bringToFront()
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await verified
 assert.equal(verifiedEmployee,employee)
 return Object.freeze({actual_original_focus_dispatched:true,actual_Native_employee_response_observed:true})
}
