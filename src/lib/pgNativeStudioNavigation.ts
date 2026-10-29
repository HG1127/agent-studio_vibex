/** The Native workspace's actual destinations, with no PB routes or auth flags. */
export const nativeStudioGroups=['工作台','创建与编排','资源中心','运行中心','管理中心'] as const
export type NativeStudioGroup=typeof nativeStudioGroups[number]
const routes={
 ownOperations:{group:'工作台',keywords:'概览 待办 原任务 我的'},
 createAgent:{group:'创建与编排',keywords:'首次 创建 向导 助手 自然语言 方案'},
 agents:{group:'创建与编排',keywords:'助手 配置 资源 绑定 Agent'},
 templates:{group:'创建与编排',keywords:'模板 市场 复制'},
 internalShares:{group:'创建与编排',keywords:'内部 团队 模板 共享'},
 workflowDraft:{group:'创建与编排',keywords:'生成 工作流 草图'},
 workflows:{group:'创建与编排',keywords:'workflow 画布 编排'},
 collaboration:{group:'创建与编排',keywords:'协作 多人'},
 releases:{group:'创建与编排',keywords:'版本 发布 验收'},
 modelConnections:{group:'资源中心',keywords:'模型 LLM API 连接'},
 toolConnections:{group:'资源中心',keywords:'工具 HTTP MCP 连接'},
 knowledge:{group:'资源中心',keywords:'知识库 RAG 资料'},
 runAgent:{group:'运行中心',keywords:'运行 Agent 试跑 原任务'},
 autonomousAgent:{group:'运行中心',keywords:'多轮 Agent 试跑 审批'},
 approvalDelegations:{group:'运行中心',keywords:'审批 委托 负责人 管理员 当前步骤 撤销'},
 runs:{group:'运行中心',keywords:'Agent 运行 历史 记录'},
 workflowNativeRuns:{group:'运行中心',keywords:'Workflow 运行 审批'},
 workflowRuns:{group:'运行中心',keywords:'Workflow 运行 历史 记录'},
 schedules:{group:'运行中心',keywords:'定时 计划 草稿'},
 runUat:{group:'运行中心',keywords:'运行 审批 UAT'},
 companyOverview:{group:'管理中心',keywords:'公司 概览 Worker'},
 employees:{group:'管理中心',keywords:'员工 权限 管理'},
} satisfies Record<string,{group:NativeStudioGroup;keywords:string}>
export type NativeStudioScreen=keyof typeof routes
export function nativeStudioGroup(key:NativeStudioScreen):NativeStudioGroup{return routes[key].group}
export function searchNativeStudioItems<T extends {key:NativeStudioScreen;label:string}>(items:readonly T[],query:string):T[]{
 const q=query.trim().toLocaleLowerCase().slice(0,100)
 if(!q)return [...items]
 return items.map((item,index)=>{const label=item.label.toLocaleLowerCase(),terms=routes[item.key].keywords.toLocaleLowerCase();return {item,index,score:label===q?100:label.startsWith(q)?80:label.includes(q)?60:terms.includes(q)?30:-1}}).filter(row=>row.score>=0).sort((a,b)=>b.score-a.score||a.index-b.index).map(row=>row.item)
}
