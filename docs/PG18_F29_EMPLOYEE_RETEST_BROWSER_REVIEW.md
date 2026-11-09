# F29 员工接受优化与显式新复测：独立真实浏览器验证源码

本包只增加验证源码，不修改产品、SQL、既有冻结包或 H。它补充 Root 已有的实际
F29 PG18 六项结果，不能替代那些结果，也不宣称本包浏览器已经运行通过。

独立工作流名称为
`Agent Studio F29 Employee Optimization Retest genuine PG18 browser verification`，
job 为 `pg18-optimization-retest-browser`，自己的明确范围值为
`YES_DISPOSABLE_F29_EMPLOYEE_RETEST_ONLY`。不设置或冒用 F27/F01/Caller 目的标签。
纯门禁先验证 GitHub hosted Linux、非 root、准确仓库/工作流/job/范围及原守卫的空
PG18 loopback5432 目标；普通主机、其他目的、生产端口、PG/proxy/Node/TLS 注入均被拒绝。
门禁先于 fixture 的源文件读取、依赖加载、SQL pool 和监听器。

## 实际链路与浏览器步骤

fixture 使用原 `agentAssessmentTcpFixture` 的实际 PG18 TCP/API/Native 角色与合成员工、
原始五十份 001–066 安装源、原 NativeAuth Cookie 与 CSRF、原反馈/协作/优化/
Autonomous Agent repositories，以及 CA 验证的 HTTPS Native 服务和 Vite 原 Root Page。
没有假 Pool、假的优化回执、直接 INSERT 的业务记录、route.fulfill 或伪造网络正文。
需要的测试场景变更均经产品 UI 或同一真实员工浏览器的实际 Native API 请求。

1. Alice 员工实际登录，在产品界面提交原任务，再经原取消操作结束。首个真实 admission
   响应为 201；保留该原任务的实际 DB 快照用于后续不变性检查。
2. 员工填写并确认任务反馈，读取当前反馈与 Owner 角色，修改目标并预览。预览为真实
   readonly 业务结果，不能产生新 run/job/effect/优化接受记录。接受按钮要求另行确认。
3. 明确接受后，仅在原 repository 已提交并将发送成功响应时销毁实际 ACK。UI 核对原
   接受请求，收到原真实 replay 回执；原任务不变，run/job 仍各一条，没有自动复测。
4. 员工主动选择该真实接受编号。只选择关联仍不会创建任务；再次明确提交才创建第二个
   run/job，并在原 `agent.v2_submit` 审计中记录一次 `optimization_retest` 关联。
5. 第二次 admission 成功后再销毁真实 ACK。员工浏览器实际删除原反馈，再关闭新的角色
   接受能力。自主任务路由继续保留原授权；本包不声称关闭整个自主提交 gate 后仍可 POST。
6. 产品的“确认上次多轮提交”使用原完整请求、原 idempotency UUID、原 revision 和原
   acceptance id 核对。它收到同一个新 run 的原 replay 回执；run/job/关联/effect 数不变，
   不生成新的优化或复测。这里复用原 POST 的精确 replay 路径，不冒称新增了只读确认端点。
7. 核对实际 UI 的“优化复测来源”和原任务 GET 的全部 provenance 字段：新 run、原任务、
   接受编号、角色版本/SHA、feedback id/SHA、after revision id。反馈正文删除不抹去原历史。
8. Alice 退出后 Bob 实际登录。Bob 看不到 Alice 的复测来源、目标或接受历史；实际原 run
   与优化历史 API 返回 404。所有 browser 请求限定到该真实 fixture Origin。

整个场景不批准运行步骤、不启动 Worker、不请求模型/provider。任务保持真实 queued/
cancelled 状态，实际 `external_effects` 数为 0，受保护的 TLS dispatch 回调若被调用就失败。
这检验了接受/关联/回执恢复不会暗中执行；它不提供 provider 成功结果，也不替代 Worker UAT。

## 固定清单、证据与 Root 交付步骤

API fixture 固定 577 个源哈希，browser fixture 固定 578 个，包括 API fixture 自身；
自固定循环已排除。清单为当前 H 加本包的 Git-LF UTF8 源快照，最终共享整合后 Root 必须
重新核对、刷新两处 literal map 和 browser 对 API helper 的哈希。文件发生未审阅变化时
fixture 必须停止，不能把审计器或业务接口替换成“总是成功”的回调。

A 已做 6 个 MJS 语法检查和 16 项纯测试（新门禁 5 项、原 retest 合同 4 项、原优化会话
7 项），0 失败、0 跳过。A 未执行 SQL、浏览器、Worker/provider 或完整本地编译。
Root 应合并本包新文件、复核最终依赖 pins，运行独立工作流获得真实 API/frontend 编译、
产品 build、PG18、Native Cookie、浏览器动作、截图和实际失败日志。

共享 contracts/graph、059/060 原 cohort、SQL067/068、8 lineage、9 device 及旧 F29 DB
入口都保持原样。生产状态继续 NO-GO；此验证源码不是部署或真实公司数据操作授权。
