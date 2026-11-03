import fs from 'node:fs'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
const artifactModule={exports:{}}
vm.runInNewContext(fs.readFileSync(new URL('../../pocketbase/pb_hooks/modules/business_artifacts.js',import.meta.url),'utf8'),{module:artifactModule})
export const sha=value=>createHash('sha256').update(value).digest('hex')
export function reportFixture(template='research.full.v1',format='docx'){
  const person='p'.repeat(20),org='o'.repeat(20),claim='c'.repeat(20),question='q'.repeat(20)
  const quote='合成资料：陈明于 2024 年加入星河研究院，担任研究员。此内容仅为自动化测试样例。'
  const ref={material_id:'m'.repeat(20),segment_id:'segment-1',start:0,end:quote.length,quote}
  const record=(id,schema,payload,links=[],refs=[])=>({record_id:id,version:1,schema_id:'research.'+schema+'.v1',payload,relation_versions:links,source_refs:refs,run_id:'',created_ms:1793222400000})
  const payload={schema_id:'research.fact_set.v1',case:{case_id:'k'.repeat(20),title:'合成研究样例：人物与机构关系',data_space:'DEMO',questions:[{question_id:question,question:'陈明与星河研究院是什么关系？'}]},records:[
    record(person,'entity',{canonical_name:'陈明',entity_type:'PERSON',aliases:['Chen Ming'],identity_status:'CONFIRMED',identity_basis:'合成身份，仅用于测试'}),
    record(org,'entity',{canonical_name:'星河研究院',entity_type:'ORGANIZATION',aliases:[],identity_status:'CONFIRMED'}),
    record(claim,'claim',{subject_id:person,predicate:'任职',object_value:'星河研究院研究员',valid_from:'2024',valid_to:null,status:'SOURCE_SUPPORTED',missing:['尚无任期结束时间']},[{record_id:person,version:1}],[ref]),
    record('r'.repeat(20),'relation',{from_id:person,to_id:org,relation_type:'EMPLOYMENT',description:'陈明于 2024 年加入星河研究院，担任研究员。',valid_from:'2024',valid_to:null,status:'SOURCE_SUPPORTED',missing:['当前在职状态未核实']},[{record_id:person,version:1},{record_id:org,version:1}],[ref]),
    record('a'.repeat(20),'answer',{question_id:question,answer:'陈明于 2024 年加入星河研究院，担任研究员。原始资料尚未说明任期结束时间，当前在职状态未知。',status:'PARTIAL',claim_ids:[claim],missing:['当前在职状态未知'],as_of:'2026-10-29'},[{record_id:claim,version:1}],[ref])
  ],reference_records:[],quality:{business_quality:'qualified_partial'},relation_quality:{business_quality:'needs_review'},created_ms:1793222400000}
  return reportInput(payload,template,format)
}
export function reportInput(payload,template,format){const snapshot={fact_set_id:'f'.repeat(20),content_hash:sha(JSON.stringify(payload)),payload};const document=artifactModule.exports.renderText(snapshot,template);return {snapshot,document,document_hash:sha(document.text),template_id:template,format}}
