// Decode only the three real wire formats at an actual disposable TLS model
// endpoint. No direct executor response or synthetic positive audit is used.
export const chainProviders={
 openai:{host:'api.openai.com',base:'https://api.openai.com/v1',post:'/v1/chat/completions',probe:'/v1/models'},
 anthropic:{host:'api.anthropic.com',base:'https://api.anthropic.com/v1',post:'/v1/messages',probe:'/v1/models'},
 gemini:{host:'generativelanguage.googleapis.com',base:'https://generativelanguage.googleapis.com/v1beta',post:'/v1beta/models/synthetic-native:generateContent',probe:'/v1beta/models'},
}
export function decodeChainModelWire(provider,body){
 let text,images=[]
 if(provider==='openai'){
  const content=body.messages?.[1]?.content
  if(typeof content==='string')text=content
  else if(Array.isArray(content)){text=content.find(p=>p.type==='text')?.text;images=content.filter(p=>p.type==='image_url').map(p=>{const m=/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(p.image_url?.url??'');if(!m)throw Error('native_chain_openai_image_wire_invalid');return{mimeType:m[1],data:m[2]}})}
 }else if(provider==='anthropic'){
  const content=body.messages?.[0]?.content
  if(typeof content==='string')text=content
  else if(Array.isArray(content)){text=content.find(p=>p.type==='text')?.text;images=content.filter(p=>p.type==='image').map(p=>{if(p.source?.type!=='base64')throw Error('native_chain_anthropic_image_wire_invalid');return{mimeType:p.source.media_type,data:p.source.data}})}
 }else if(provider==='gemini'){
  const parts=body.contents?.[0]?.parts;text=parts?.find(p=>typeof p.text==='string')?.text;images=parts?.filter(p=>p.inlineData).map(p=>({mimeType:p.inlineData.mimeType,data:p.inlineData.data}))??[]
 }else throw Error('native_chain_provider_required')
 if(typeof text!=='string')throw Error('native_chain_actual_model_prompt_missing')
 return {prompt:JSON.parse(text),images}
}
export function encodeChainModelResponse(provider,text){
 if(provider==='openai')return{choices:[{finish_reason:'stop',message:{content:text}}]}
 if(provider==='anthropic')return{content:[{type:'text',text}],stop_reason:'end_turn'}
 if(provider==='gemini')return{candidates:[{content:{parts:[{text}]},finishReason:'STOP'}]}
 throw Error('native_chain_provider_required')
}
export function chainDecision(prompt,{formUrl,sourceSha}){
 const round=prompt.round,history=prompt.history??[],tool=(name,args)=>({action:'tool',tool:'local_computer',params:{tool:name,arguments:args}})
 const table={root:'work',source_path:'sample-ledger.csv',group_by:'部门',amount_column:'金额',decimal_places:2}
 if(round===1)return tool('office.table_summary',table)
 if(round===2){const summary=JSON.parse(history[0]?.observation??'null');if(summary?.source_sha256!==sourceSha||summary.total!=='2500.00'||summary.row_count!==5)throw Error('native_chain_actual_summary_not_observed');return tool('office.create_report',{...table,expected_sha256:summary.source_sha256,output_directory:'native-chain-report',title:'Native independent Office report',period:'Synthetic CI'})}
 if(round===3)return tool('files.read',{root:'work',path:'native-chain-report/summary.json'})
 if(round===4){const manifest=JSON.parse(history[2]?.observation??'null');if(manifest?.source_sha256!==sourceSha||manifest.total!=='2500.00')throw Error('native_chain_actual_manifest_not_observed');return tool('browser.browser_navigate',{url:formUrl})}
 if(round===5||round===8)return tool('browser.browser_take_screenshot',{type:'png',scale:'css'})
 function ref(label,kind){for(const item of [...history].reverse()){const text=String(item.observation??''),line=text.split('\n').find(s=>s.includes(kind+' "'+label+'"')&&/\[ref=[^\]]+\]/.test(s));const found=line&&/\[ref=([^\]]+)\]/.exec(line);if(found)return found[1]}throw Error('native_chain_actual_browser_reference_missing')}
 if(round===6)return tool('browser.browser_fill_form',{fields:[{name:'报告总额',type:'textbox',ref:ref('报告总额','textbox'),value:'2500.00'},{name:'源摘要',type:'textbox',ref:ref('源摘要','textbox'),value:sourceSha}]})
 if(round===7)return tool('browser.browser_click',{element:'提交一次报告',ref:ref('提交一次报告','button')})
 if(round===9||round===10)return{action:'answer',answer:'实际本机源表总额 2500.00；Excel、Word 与 JSON 清单已回读核对，原表保持不变。隔离网页已返回一次提交回执，截图已送入本次模型请求。'}
 throw Error('native_chain_unexpected_model_round')
}
