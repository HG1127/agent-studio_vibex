"use strict"
// Deterministic closing output consumes no new provider request. It reads only
// current authorized records and durable result locators, never reconstructs text
// from compressed observations or presents unreviewed facts as verified.
function build(app,uid,runId,config,reason){
  var store=require(__hooks+"/modules/tool_results.js")
  store.assertRunAccessible(app,uid,runId)
  var results=store.list(app,uid,runId),lines=["部分交付 · 任务未完成","停止原因："+String(reason),"以下保留已有记录和证据位置；未执行新的搜索、模型推断或全面核验。",""],recordCount=0
  if(config.case_id){
    var data=require(__hooks+"/modules/business_data.js"),c=data.caseGet(app,uid,String(config.case_id))
    var answers=data.query(app,uid,c.case_id,{schema_id:"research.answer.v1",offset:0,limit:50}).items
    lines.push("业务任务："+c.title+"（"+c.data_space+"）")
    c.questions.forEach(function(q){
      lines.push(q.question+" · "+q.question_id)
      var matches=answers.filter(function(answer){return answer.payload.question_id===q.question_id})
      if(matches.length!==1){lines.push(matches.length?"多个答案对象冲突，需复核。":"未知：尚无正式答案；后续只补此缺口。","");return}
      var a=matches[0],text=a.payload.answer
      recordCount++
      if(text.length>2000)text=text.slice(0,2000)+"… [阶段节选；完整记录按 ID 读取]"
      lines.push("记录陈述（未在收尾时重新核验）："+text,"声明状态："+a.payload.status,"缺口："+(a.payload.missing.join("；")||"未声明；请复核"),"正式记录："+a.record_id+" v"+a.version,"")
    })
  }
  lines.push("本次运行已保存的工具结果位置：")
  if(!results.length)lines.push("尚无可读取结果。")
  results.forEach(function(result){lines.push("第 "+result.step_index+" 步 · "+result.tool+" · result_id="+result.result_id)})
  lines.push("","后续运行可绑定同一业务任务，只补未完成问题；冻结报告需另行生成，现有文件不会改写。")
  return {text:lines.join("\n"),delivery:{state:recordCount||results.length?"partial":"none",reason:String(reason),record_count:recordCount,result_count:results.length,generated_without_model:true}}
}
module.exports={build:build}
