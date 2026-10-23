/** Deterministic planning fixtures spanning different Agent domains and graph sizes.
 * These test parser/persistence/authorization robustness, NOT live-model intelligence.
 */
export const complexCreationCases = [
  {
    marker:"V27_VARIANT_POLICY_AUDIT", name:"合规文件审查",
    requirement:"审核三份企业政策PDF，对照内部知识库，输出带页码的冲突清单；禁止发送外部消息。",
    goal:"提取企业政策的可追溯证据并形成合规冲突审核",
    stages:[
      ["extractor","政策提取"],
      ["auditor","差异核验"],
    ],
    capabilities:[
      ["pdf","解析政策PDF","document","read","extractor"],
      ["knowledge","检索内部知识库","knowledge","read","auditor"],
    ],
  },
  {
    marker:"V27_VARIANT_TICKET_TRIAGE",name:"工单协作处理",
    requirement:"读取客户工单、分级并草拟回复，最后在人工审核后写入CRM；不得自动发送邮件。",
    goal:"将客服问题分级并经明确人工审核后写入CRM",
    stages:[
      ["collector","工单收集"],
      ["classifier","问题分类"],
      ["updater","审核后更新"],
    ],
    capabilities:[
      ["tickets","读取工单","integration","read","collector"],
      ["classifier","分类客户问题","text","read","classifier"],
      ["crm","更新CRM记录","integration","write","updater"],
    ],
  },
  {
    marker:"V27_VARIANT_RELEASE_TRAIN",name:"研发发布审核",
    requirement:"对一个软件版本进行八阶段审核：需求、依赖、代码、测试、安全、质量、负责人复核、批准后登记版本；所有外部写入必须人工确认。",
    goal:"将软件版本发布前审核分解成有证据的八阶段流程",
    stages:[
      ["requirements","需求确认"],
      ["dependency","依赖检查"],
      ["code","代码审核"],
      ["testing","测试复核"],
      ["security","安全分析"],
      ["qa","质量验收"],
      ["reviewer","负责人审核"],
      ["publisher","批准后登记"],
    ],
    capabilities:[
      ["repository","读取代码仓库","integration","read","code"],
      ["ci","读取CI结果","integration","read","testing"],
      ["security_scan","安全扫描结果","integration","read","security"],
      ["release","提交版本登记","integration","write","publisher"],
    ],
  },
]

export const complexFixturePlan = sample => {
  const roles=sample.stages.map(([id,name],i)=>({
    id,name,responsibility:"负责"+name+"并交付来源与检查点",
    tasks:["完成"+name],inputs:["任务授权资料","前一阶段成果"],
    deliverables:[name+"证据记录"],
    depends_on:i?[sample.stages[i-1][0]]:[],
    // Malformed/malicious model outputs must not become executable grants.
    tools:[i===sample.stages.length-1?"send_email":"unverified_reader"],
    done_criteria:["保存交接记录并明确证据缺口"],
  }))
  const capabilities=sample.capabilities.map(([id,title,kind,access,roleId])=>({
    id,title,kind,access,role_ids:[roleId],
    required:true,purpose:"完成"+title+"并保留可核验执行记录",
    search_terms:[kind],suggested_tool_ids:[],
  }))
  return {
    name:sample.name,goal:sample.goal,
    task_scope:"仅使用已授权资料，不替用户申请第三方权限；外部写入经明确批准。",
    deliverables:roles.map(role=>role.deliverables[0]),
    task_plan:roles.map(role=>role.tasks[0]),
    done_criteria:["全部角色完成交接","必需能力缺口可见","写入前需人工审批"],
    // Tool names are *proposals*. None of these is a verified connection.
    tools:sample.capabilities.map(need=>need[1]),
    roles,capability_requirements:capabilities,require_approval:false,require_plan_review:false,
  }
}
