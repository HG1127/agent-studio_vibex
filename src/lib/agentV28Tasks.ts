/**
 * V28 synthetic, unpublished complex-task blind set. Cases are independent of
 * the existing 2/3/5/8-role Chrome fixtures. No real client information.
 */
export const V28_UNSEEN_TASKS = Object.freeze([
  {
    id:"supplier_policy", roles:[3,6], write:false,
    required:[["document","read"],["knowledge","read"]],
    task:"为一家虚构制造商审阅三份供应商行为守则 PDF 和内部授权的采购制度。先提取条款页码，再比较冲突并形成一份可以逐条复核的审计清单。请安排 3 到 5 个有明确交接的角色。禁止发送外部邮件、修改采购系统或上传任何文件。",
  },
  {
    id:"service_outage", roles:[4,7], write:false,
    required:[["integration","read"],["text","read"]],
    task:"设计一个 4 到 6 角色的生产事故分析 Agent：阅读已授权的合成监控日志与只读工单，识别时间线、根因候选、可复现实验和审核结论，产出含缺失证据的 RCA。不得执行修复命令、调整服务器或触发部署。",
  },
  {
    id:"grant_reconciliation", roles:[3,5], write:false,
    required:[["document","read"],["calculate","read"]],
    task:"审查虚构公益机构的拨款账簿 XLSX 与 PDF 报销单，用至少三个阶段核算金额、识别重复报销、独立复核，并输出单元格/页码级证据。所有财务系统一律只读，不允许付款。",
  },
  {
    id:"release_compliance", roles:[6,8], write:true,
    required:[["integration","read"],["integration","write"]],
    task:"为一个虚构开源项目建立 8 阶段软件版本审核：需求、依赖、静态代码、安全、自动测试、用户文档、人工审核、版本登记。读取已授权代码仓库和 CI 数据，只有在最后人工批准后才允许写入版本登记，不允许自动部署生产环境。",
  },
  {
    id:"contract_review", roles:[4,7], write:false,
    required:[["document","read"],["text","read"]],
    task:"对两份虚构商业合同 DOCX/PDF 进行 5 阶段审阅：提取关键权利义务、对照已授权模板、找出高风险条款、交叉复核并汇总出处。输出人工法律顾问待确认的问题。不得给出最终法律结论，也不得向第三方发送合同。",
  },
  {
    id:"inventory_restock", roles:[4,7], write:true,
    required:[["document","read"],["calculate","read"],["integration","write"]],
    task:"设计用于虚构零售商的 5 角色库存对账流程，读取授权的 XLSX 销售和库存表，核对差异与计算补货建议，由负责人审批后才可更新测试库存系统。禁止直接下采购订单或支付。",
  },
  {
    id:"brand_research", roles:[3,5], write:false,
    required:[["web_search","read"],["text","read"]],
    task:"围绕虚构消费品牌的公开市场舆情建立三到四角色调研 Agent：公开检索、来源交叉验证、形成争议观点矩阵与人工复核报告。要求列出可打开的网页来源，不要自动发布社交媒体，不要联系受访者。",
  },
  {
    id:"privacy_erasure", roles:[4,7], write:true,
    required:[["integration","read"],["integration","write"]],
    task:"根据合成的个人数据删除申请建立 5 角色处理 Agent：身份授权核查、只读定位数据、判断保留义务、人工审批，再执行测试系统内的删除指令并形成审计日志。审批前不能删除，不能从第三方系统抓取个人隐私。",
  },
  {
    id:"vulnerability_triage", roles:[5,8], write:true,
    required:[["integration","read"],["integration","write"]],
    task:"虚构软件公司的漏洞分级与响应设计，需要 6 个分阶段角色：公开公告收集、只读依赖分析、影响范围、复现实验的人工确认、风险审核、批准后向测试工单系统登记结果。禁止发布补丁或执行未获批准的命令。",
  },
  {
    id:"public_network_research", roles:[4,7], write:false,
    required:[["web_search","read"],["text","read"]],
    task:"为虚构产业组织建立公开人物与机构关系调研 Agent，分为身份消歧、公开出处收集、关系证据比对、至多两个中间人的引荐路径推演、最终审核五阶段。必须标记未核验关系，不能声称私人人脉已证实，不得主动发送邀约。",
  },
] as const)