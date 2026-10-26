"use strict"
// A role is a sequential stage inside one owned Agent run. This is not a
// parallel agent scheduler. It cannot grant tools beyond the frozen run spec.
var MAX_ROLES = 8
var LIST_FIELDS = ["tasks", "inputs", "deliverables", "depends_on", "tools", "done_criteria"]
function isObject(value) { return !!value && typeof value === "object" && !Array.isArray(value) }
function shapeErrors(roles) {
  if (roles === undefined || roles === null) return []
  if (!Array.isArray(roles)) return ["角色分工必须是列表"]
  if (roles.length > MAX_ROLES) return ["每个助手最多配置 8 个角色阶段"]
  var errors = []
  for (var i = 0; i < roles.length; i++) {
    var role = roles[i]
    var prefix = "第 " + (i + 1) + " 个角色："
    if (!isObject(role)) { errors.push(prefix + "配置格式不正确"); continue }
    if (typeof role.id !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(role.id)) errors.push(prefix + "角色标识格式不正确")
    if (typeof role.name !== "string" || role.name.length > 100) errors.push(prefix + "名称最长 100 字")
    if (typeof role.responsibility !== "string" || role.responsibility.length > 2000) errors.push(prefix + "职责最长 2000 字")
    var refs = role.skill_refs || []
    if (!Array.isArray(refs) || refs.length > 2) {errors.push(prefix+"最多绑定两个 Skill");continue}
    var seenSkills = {}
    for (var s = 0; s < refs.length; s++) {
      var skill = refs[s]
      if (!isObject(skill) || !/^[A-Za-z0-9]{15}$/.test(String(skill.id||"")) ||
          !Number.isSafeInteger(skill.version) || skill.version < 1 || skill.version > 100 ||
          !/^[a-f0-9]{64}$/.test(String(skill.hash||"")) || seenSkills[skill.id]) {
        errors.push(prefix+"Skill 版本绑定不合法");break
      }
      seenSkills[skill.id] = true
    }
    for (var j = 0; j < LIST_FIELDS.length; j++) {
      var field = LIST_FIELDS[j], values = role[field]
      if (!Array.isArray(values) || values.length > 32) { errors.push(prefix + field + " 必须为不超过 32 项的列表"); continue }
      for (var k = 0; k < values.length; k++) {
        if (typeof values[k] !== "string" || values[k].length > (field === "tools" ? 220 : 1600)) {
          errors.push(prefix + field + " 包含过长或无效内容"); break
        }
      }
    }
  }
  return errors
}
function validatePlan(roles, availableTools) {
  var errors = shapeErrors(roles)
  if (errors.length) return { valid: false, errors: errors, orderedRoles: [] }
  roles = roles || []
  if (!roles.length) return { valid: true, errors: [], orderedRoles: [] }
  var ids = Object.create(null), completed = Object.create(null), ordered = []
  var tools = Array.isArray(availableTools) ? availableTools : []
  for (var i = 0; i < roles.length; i++) {
    var role = roles[i], title = role.name.trim() || "第 " + (i + 1) + " 个角色"
    if (ids[role.id]) errors.push("角色标识重复：" + role.id)
    ids[role.id] = true
    if (!role.name.trim()) errors.push(title + "需要填写名称")
    if (!role.responsibility.trim()) errors.push(title + "需要说明职责")
    if (!role.tasks.some(function (x) { return x.trim() })) errors.push(title + "至少需要一项任务")
    if (!role.deliverables.some(function (x) { return x.trim() })) errors.push(title + "至少需要一项交付物")
    if (!role.done_criteria.some(function (x) { return x.trim() })) errors.push(title + "至少需要一项完成标准")
    for (var t = 0; t < role.tools.length; t++) {
      if (tools.indexOf(role.tools[t]) < 0) errors.push(title + "的工具尚未加入方案：" + role.tools[t])
    }
  }
  for (var r = 0; r < roles.length; r++) {
    var current = roles[r]
    for (var d = 0; d < current.depends_on.length; d++) {
      var dep = current.depends_on[d]
      if (dep === current.id) errors.push(current.name + "不能依赖自己")
      else if (!ids[dep]) errors.push(current.name + "依赖的角色不存在：" + dep)
    }
  }
  if (errors.length) return { valid: false, errors: errors, orderedRoles: [] }
  while (ordered.length < roles.length) {
    var advanced = false
    for (var n = 0; n < roles.length; n++) {
      var next = roles[n]
      if (completed[next.id]) continue
      if (next.depends_on.every(function (id) { return completed[id] === true })) {
        ordered.push(next); completed[next.id] = true; advanced = true
      }
    }
    if (!advanced) return { valid: false, errors: ["角色依赖形成循环，请调整交接顺序"], orderedRoles: [] }
  }
  return { valid: true, errors: [], orderedRoles: ordered }
}
function stateFor(roles, rawState) {
  var state = isObject(rawState) ? rawState : {}
  var saved = Array.isArray(state.completed) ? state.completed : []
  var completed = []
  var outputs = Object.create(null)
  // Only a contiguous prefix of the immutable execution order can be complete.
  for (var i = 0; i < roles.length; i++) {
    var id = roles[i].id
    if (saved.indexOf(id) < 0) break
    var output = isObject(state.outputs) && typeof state.outputs[id] === "string" ? state.outputs[id] : ""
    if (!output.trim()) break
    completed.push(id); outputs[id] = output.slice(0, 12000)
  }
  var active = roles[completed.length] || null
  return { version: 1, completed: completed, outputs: outputs,
    active_role_id: active ? active.id : "",
    started_role_id: typeof state.started_role_id === "string" ? state.started_role_id : "" }
}
function currentRole(roles, state) { return roles[state.completed.length] || null }
function completeStage(roles, rawState, roleId, output) {
  var state = stateFor(roles, rawState), role = currentRole(roles, state)
  if (!role || role.id !== roleId) return { ok: false, error: "只能提交当前执行角色的成果" }
  if (typeof output !== "string" || !output.trim()) return { ok: false, error: "角色交接必须包含实际成果，不能为空" }
  if (output.length > 12000) return { ok: false, error: "角色交接成果超过 12000 字，请先整理为可交接内容" }
  state.completed.push(role.id)
  state.outputs[role.id] = output
  var next = roles[state.completed.length] || null
  state.active_role_id = next ? next.id : ""
  state.started_role_id = ""
  return { ok: true, state: state, nextRole: next }
}
function mayUseTool(role, name) { return !role || role.tools.indexOf(String(name)) >= 0 }
function rolePrompt(role, roles, state) {
  if (!role) return ""
  var index = state.completed.length, last = index === roles.length - 1
  var lines = [
    "【角色阶段执行：同一运行顺序执行，非并行团队】",
    "当前角色：" + role.name + "（" + role.id + "），第 " + (index + 1) + "/" + roles.length + " 个阶段。",
    "职责：" + role.responsibility,
    "本阶段任务：" + role.tasks.join("；"),
    "所需输入：" + role.inputs.join("；"),
    "本阶段交付：" + role.deliverables.join("；"),
    "完成标准：" + role.done_criteria.join("；"),
    "仅可调用本阶段已经授权的工具；不得替后续角色宣称已完成任务。",
    last ? "这是最终交付角色。核对所有前序成果与整体完成标准后，用 action=final 交付完整最终成果。" :
      '本阶段完成后用 {"action":"role_complete","role_id":"' + role.id + '","role_output":"完整可交接成果"} 提交。后端保存成果再启动下一角色；不得提前 action=final。',
  ]
  if (state.completed.length) {
    lines.push("【已保存的前序角色交付；这些是阶段成果，不等同于已核验事实】")
    for (var i = 0; i < state.completed.length; i++) {
      var priorId = state.completed[i]
      lines.push(priorId + "：" + String(state.outputs[priorId] || "").slice(0, 12000))
    }
  }
  return lines.join("\n")
}
module.exports = { MAX_ROLES: MAX_ROLES, shapeErrors: shapeErrors, validatePlan: validatePlan,
  stateFor: stateFor, currentRole: currentRole, completeStage: completeStage,
  mayUseTool: mayUseTool, rolePrompt: rolePrompt }
