# 统一 Role 安装 delta 与安装期审计组件

本增量承接独立 v204 catalog/Role14 组件，不接入默认运行入口，也不完成最终统一 installer。原 parent profile 必须先在兼容阶段完成真实审计、空业务证明和原锁；调用方必须持有同一可信 postgres 安装事务客户端与目标绑定。

`original-ui-unified-role-delta.mjs` 检查所有旧元数据完整保留。extensions、roles、memberships、role settings、数据库/default ACL、event triggers 不得改变；旧 namespace、类、列、默认值、函数、类型、约束、策略、触发器、索引、重写与依赖逐项保留，不丢弃未知字段。仅允许源定义的 Role namespace、7表、9索引、66列、9默认值、2函数、14类型、78约束、7策略和38触发器。旧类只允许三个已声明 FK 目标的 has_triggers 变为 true；每个 FK 目标与 Role 表必须具有该标志。新依赖须属于新 Role 对象，不能改写旧依赖或引入其他 schema 对象。

它先 fresh 读取系统 class/RI OID 绑定与完整 catalog，执行 delta，再调用独立安装期完整 Role 语义审计，再 fresh 读完整 catalog 和 OID 绑定并确认不漂移；Role query 的 database OID 必须与完整 catalog 一致。五次 SELECT 均由调用方同一客户端执行，无 Pool、事务开启、重试、结果或授权缓存。失败直接传播。相等/通过只返回 component，安装授权、最终完整 profile、production GO 仍为 false。

`original-ui-unified-role-install-catalog.mjs` 是独立安装入口，要求实际 context 为 postgres/session postgres、write transaction、原目标/版本/search_path/replication role，不把实际 context 投影成 API context。其余原 Role 表、列、约束、RLS、函数源码/ACL、有效权限、触发器、类型与原14 LOGIN 检查保留。运行时 API 审计入口仍独立，安装 context 不能通过运行时入口，反之亦然。

同时修正 v204 新 reader 的返回列名错误：其 SELECT 原本返回 `catalog`，现在 reader 严格只读 `catalog`，不接受 `value` fallback。SQL本身与全部19类 metadata 不变。原v20449项测试只增加显式逆向这两处修正的适配；新测试直接对实际 SELECT 别名和 reader 做严格匹配验证，防止 inert port 错误模拟掩盖 SQL/DTO 不一致。

115/115 source/VM pures（保留49+新增66），零skip。实际完整 Role 安装/运行时审计在完整原14 metadata frame上执行，并覆盖 Owner/ACL/约束/RLS/函数/触发器/成员/LOGIN限额拒绝；delta覆盖旧metadata、新对象数量/归属、RI、数据库不一致、五个query位置错误与fresh漂移。这里只使用固定描述符/metadata和inert query ports，不代表真实SQL、安装、原页面UAT或恢复验收。

最终统一 source capture、090独立 delta/ledger/receipt、API/Auth与14真实LOGIN验证、未知COMMIT/ACK处置、最终组合恢复仍须补齐。091预算/toolgrant、092/research与preview.21其他新增合同不混入。最新统一main/desktop为10faa56a…（Root报告）；完整差异为209paths，78仅早先子集，不能据此宣称全UI迁移完成。production NO-GO。
