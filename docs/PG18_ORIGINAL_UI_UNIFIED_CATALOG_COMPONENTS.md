# 原员工统一 profile 的 catalog 组件

这份独立增量补两个实际源码缺项：完整非系统 catalog 的读取/逐字比较，以及 Role schema 在原14 LOGIN 拓扑下的完整语义审计。它尚未接入默认运行入口，没有安装或部署行为。

`original-ui-unified-catalog.mjs` 从旧 UI078 的已审核 SELECT 派生，只将20处应用 schema 范围扩展为所有非系统 schema，其他查询字节保持一致。范围包含 public/扩展对象、Role、未来经审核的增量，以及任何额外用户 namespace；使用字面 `pg_` 前缀判断，避免 LIKE 下划线通配遗漏。它保留19类完整元数据，包括依赖、扩展、schema、类、列、默认值、函数、类型、约束、策略、触发器、索引、重写、默认ACL、事件触发器、角色、成员、角色设置与数据库ACL。

`readUnifiedEmployeeCatalog` 每次通过调用者的可信客户端发起一次新 SELECT，返回分离的数据图像。`assertUnifiedEmployeeCatalogStable` 每次重新检查两份完整数据，不按字段过滤，不信任先前观测摘要，不保存结果缓存；任意一类数据变化都会拒绝。相等只能得到 fingerprint component，不能得到 profile 安装、权限或最终验收证明。调用方仍须提供真实身份、实际 RR/RO 事务、目标绑定以及原语义审计。

旧 Role auditor 要求所有 `agentstudio_*` 角色连接上限为 -1，与原14 LOGIN 中四个上限3的专用身份冲突。新 `original-ui-unified-role-catalog.mjs` 是独立入口：保留原表、列、约束、表达式、索引、RLS、触发器、函数源码/ACL/有效权限及上下文校验；仅扩展成员查询到原14身份，并使用原14 LOGIN 固定矩阵校验实际完整 rows。没有向旧 auditor 投喂删减/伪造的 roles 或 members。其余原语义体可通过固定父 SHA 与显式逆向 hunks 复核。

新的 LOGIN checker 检查所有14身份是否存在、LOGIN/安全属性、原连接上限、组存在性及精确成员关系、grantor/admin/inherit/set，拒绝缺项、重复、额外 LOGIN、错误 grant 和别名数据。它导入原固定 LOGIN DATA，不重新定义该契约。返回值明确为 component：实际14连接、最终完整 profile、安装授权和 production GO 均为 false。旧 Role/Staff/Quality/profile 源码与旧测试不变。

统一 installer 尚须补齐：独立 profile 的安全 source capture；兼容阶段运行的原 parent auditors；owned-empty proof、schema/table locks 与原顺序；Role 及待 Root 审阅集成的独立090增量的精确 catalog delta；完整 ledger/receipt/全局对象清单验证；独立 API/Auth 与14真实 LOGIN 验证；未知 COMMIT/ACK 的只读核验；最终组合恢复。不能仅将读到的 catalog 当作期望值写入回执后宣称验证完成。SQL090 不因被 collector 看见就获得支持或授权。

这份源码没有执行数据库查询。验证使用 API-bound TS5.9.3 AST、实际选定纯函数、固定 literal DATA 和 inert query ports；完整 Role schema 的真实 PG 审计、统一安装/恢复、原员工 UAT 和长时 Worker 尚未运行。目标仍限用户管理的宝塔服务器，production NO-GO。
