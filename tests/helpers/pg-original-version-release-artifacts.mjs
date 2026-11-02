import assert from 'node:assert/strict'
import {assertVersionReleaseObservation} from './pg-original-version-release-proof-contract.mjs'
export async function versionReleaseDomSafety(page){
 const values=await page.locator('textarea,input[type="password"]').evaluateAll(nodes=>nodes.map(n=>n.value??''));assert(values.every(v=>v===''),'private local input must be cleared before a successful artifact');assert.equal(await page.getByRole('dialog').count(),0)
 const body=await page.locator('body').innerText();assert(!/SyntheticAssessment(?:Alice|Bob)#|assessment-key-never-network|BEGIN .*PRIVATE KEY|knowledge-body-never-send/.test(body));return true
}
export function versionReleaseImageBuffer(bytes){assert(Buffer.isBuffer(bytes)&&bytes.length>8&&bytes.length<=4*1024*1024);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');return bytes}
export function versionReleaseObservationBytes(value){assertVersionReleaseObservation(value);const text=JSON.stringify(value,null,2);assert(Buffer.byteLength(text)<=196608);assert(!/api_key|ciphertext|password|\"cookie\"\s*:|\"authorization\"\s*:|\"instruction\"\s*:|restore_reason|spec_snapshot/i.test(text),'no private payload in artifact');return Buffer.from(text+'\n')}
