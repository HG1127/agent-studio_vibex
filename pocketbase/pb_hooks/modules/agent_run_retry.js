"use strict"

// Retry a failed Agent task in place. The agent_runs row remains the task identity;
// each prior execution is copied into an immutable, owner-scoped attempt archive.
function fault(status, code, message) {
  var err = new Error(code)
  err.httpStatus = status
  err.code = code
  err.message = message || code
  throw err
}
function readJson(record, field, fallback) {
  var raw = ""
  try { raw = String(record.getString(field) || "") } catch (_) {}
  if (!raw) return fallback
  try {
    var value = JSON.parse(raw)
    return value && typeof value === "object" && !Array.isArray(value) ? value : fallback
  } catch (_) { return fallback }
}
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]"
  return "{" + Object.keys(value).sort().map(function (key) {
    return JSON.stringify(key) + ":" + canonical(value[key])
  }).join(",") + "}"
}
function retry(app, owner, runId, input) {
  var body = input || {}
  var requestId = String(body.request_id || "").trim()
  var requestedModel = String(body.model || "").trim()
  if (!owner) fault(401, "rh_login_required", "请先登录后再重新运行")
  if (!/^[A-Za-z0-9]{15,40}$/.test(String(runId || ""))) fault(404, "run_not_found", "任务不存在或无权访问")
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(requestId)) fault(400, "invalid_retry_request_id", "重试请求标识无效，请刷新后重试")
  var requestHash = String($security.sha256(JSON.stringify({ model: requestedModel })) || "")
  var outcome = null
  try {
    app.runInTransaction(function (tx) {
      var oldRequest = arrayOf(new DynamicModel({ id: "", attempt_no: 0, request_hash: "" }))
      tx.db().newQuery(
        "SELECT id,attempt_no,request_hash FROM agent_studio_run_attempts " +
        "WHERE owner_uid={:owner} AND run_id={:run} AND request_id={:request}"
      ).bind({ owner: owner, run: runId, request: requestId }).all(oldRequest)
      if (oldRequest.length) {
        if (String(oldRequest[0].request_hash) !== requestHash)
          fault(409, "retry_idempotency_conflict", "该重试请求标识已用于不同的模型选择，请重新点击重试")
        var existingRun = null
        try { existingRun = tx.findRecordById("agent_runs", runId) } catch (_) {}
        if (!existingRun || String(existingRun.get("rh_user_id") || "") !== owner)
          fault(404, "run_not_found", "任务不存在或无权访问")
        var duplicateCheckpoint = readJson(existingRun, "checkpoint", {})
        var duplicateSpec = null
        try { duplicateSpec = tx.findRecordById("agent_specs", String(existingRun.get("spec_id") || "")) } catch (_) {}
        if (duplicateCheckpoint.agent_deleted === true || !duplicateSpec ||
            String(duplicateSpec.get("rh_user_id") || "") !== owner)
          fault(409, "agent_deleted", "该任务所属 Agent 已删除，历史记录只读，不能重新运行")
        outcome = { httpStatus: 200, body: {
          ok: true, run_id: runId, status: String(existingRun.get("status") || ""),
          attempt_no: Number(oldRequest[0].attempt_no || 1) + 1, deduplicated: true,
        } }
        return
      }

      var run = null
      try { run = tx.findRecordById("agent_runs", runId) } catch (_) {}
      if (!run || String(run.get("rh_user_id") || "") !== owner)
        fault(404, "run_not_found", "任务不存在或无权访问")
      var status = String(run.get("status") || "")
      var checkpoint = readJson(run, "checkpoint", {})
      if (checkpoint.agent_deleted === true)
        fault(409, "agent_deleted", "该任务所属 Agent 已删除，历史记录只读，不能重新运行")
      if (status !== "failed")
        fault(409, "retry_state_not_allowed", "只有失败任务可以重新运行；当前任务状态为 " + status)

      var specId = String(run.get("spec_id") || "")
      var specRec = null
      try { specRec = tx.findRecordById("agent_specs", specId) } catch (_) {}
      if (!specRec || String(specRec.get("rh_user_id") || "") !== owner)
        fault(409, "agent_deleted", "原 Agent 已不存在或不属于当前账号，不能重新运行")
      var specSnapshot = readJson(run, "spec_snapshot", null)
      if (!specSnapshot)
        fault(409, "agent_snapshot_unavailable", "该任务缺少原始 Agent 快照，无法安全重试；请核对后发起新任务")
      var currentSpec = readJson(specRec, "spec", {})
      if (String($security.sha256(canonical(currentSpec))) !== String($security.sha256(canonical(specSnapshot))))
        fault(409, "agent_spec_changed", "原 Agent 方案已修改。为避免用新旧配置混跑，请先核对方案后再发起任务")

      var config = readJson(run, "config", {})
      var previousConfig = JSON.parse(JSON.stringify(config))
      if (config.monitor_check_id || config.research_stage_link_id ||
          String(config.source || "") === "schedule")
        fault(409, "managed_run_retry_required", "此任务由监测、研究流程或定时计划托管，请在原流程中处理失败，不支持手动重试")
      try { require(__hooks + "/modules/tool_results.js").assertRunAccessible(tx, owner, runId) }
      catch (_) { fault(403, "source_access_revoked", "任务引用的数据来源权限已失效，恢复授权前不能重新运行") }

      // Resolve and revalidate the exact saved model connection before any new model call.
      var modelShort = String(run.getString("model") || "claude-opus-4.8")
      var customInput = config.custom_model || null
      if (requestedModel) {
        var selectedCustom = /^custom:([A-Za-z0-9]{15}):(.{1,200})$/.exec(requestedModel)
        if (selectedCustom) {
          customInput = { connection_id: selectedCustom[1], model_id: selectedCustom[2] }
          modelShort = "custom:" + selectedCustom[2]
        } else {
          var builtinModels = { "claude-opus-4.8":1, "claude-opus-4.7":1, "qwen3.7-max":1 }
          if (!builtinModels[requestedModel]) fault(400, "bad_model", "请选择已连接并验证通过的模型")
          modelShort = requestedModel
          customInput = null
        }
      }
      if (customInput && customInput.connection_id && customInput.model_id) {
        var modelRepo = require(__hooks + "/modules/model_connections.js")
        var resolvedModel = modelRepo.lookup(tx, owner, String(customInput.connection_id),
          String(customInput.model_id), {
            secretKey: String($os.getenv("AGENT_STUDIO_SECRET_KEY") || ""),
            decrypt: function (blob, key) { return String($security.decrypt(blob, key)) },
          })
        if (!resolvedModel.ok)
          fault(409, resolvedModel.error || "custom_model_unavailable",
            resolvedModel.detail || "所选模型连接已失效，请到模型连接页重新启用并测试")
        var modelConnection = tx.findRecordById("model_connections", String(customInput.connection_id))
        config.custom_model = {
          connection_id: String(customInput.connection_id),
          model_id: String(customInput.model_id),
          connection_name: String(modelConnection.getString("name") || "").slice(0, 100),
        }
        modelShort = "custom:" + String(customInput.model_id).slice(0, 80)
      } else {
        var allowedModels = { "claude-opus-4.8":1, "claude-opus-4.7":1, "qwen3.7-max":1 }
        if (!allowedModels[modelShort])
          fault(409, "custom_model_config_missing", "原自定义模型连接配置已缺失，请在上方快速选择一个可用模型")
        config.custom_model = null
      }

      // Agent roles and pinned Skills must still be valid and identical to the saved attempt.
      var roleService = require(__hooks + "/modules/agent_roles.js")
      var rolePlan = roleService.validatePlan(specSnapshot.roles, specSnapshot.tools)
      if (!rolePlan.valid)
        fault(409, "invalid_agent_roles", "原 Agent 角色配置已失效：" + rolePlan.errors.join("；"))
      var skillSnapshots = require(__hooks + "/modules/skill_registry.js")
        .resolveSnapshots(tx, owner, rolePlan.orderedRoles)
      if (canonical(skillSnapshots) !== canonical(config.role_skill_snapshots || []))
        fault(409, "skill_reference_unavailable", "原任务绑定的 Skill 版本已失效或变化，请先修复 Agent 方案")

      // Revalidate every external HTTP connector named by the pinned AgentSpec.
      var builtinNames = {
        tool_contract_get:1,business_material_list:1,business_material_read:1,business_job_submit:1,
        business_job_status:1,business_job_cancel:1,business_fact_set_get:1,business_report_render:1,
        business_quality_check:1,business_record_write:1,business_case_get:1,business_record_query:1,
        result_read:1,result_list:1,calculate:1,summarize:1,knowledge_search:1,
        web_fetch:1,web_search:1,local_computer:1,
      }
      var toolAdmission = require(__hooks + "/modules/tool_connection_admission.js")
      var specTools = Array.isArray(specSnapshot.tools) ? specSnapshot.tools : []
      for (var ti = 0; ti < specTools.length; ti++) {
        var toolName = String(specTools[ti] || "")
        if (!toolName || builtinNames[toolName] || toolName.indexOf("mkt__") === 0) continue
        var connections = tx.findRecordsByFilter("tool_connections",
          "rh_user_id = {:owner} && name = {:name}", "-created", 5, 0,
          { owner: owner, name: toolName }) || []
        var verified = false
        for (var ci = 0; ci < connections.length; ci++) {
          if (toolAdmission.isVerifiedExternalToolRecord(connections[ci], owner, toolName)) {
            verified = true
            break
          }
        }
        if (!verified)
          fault(409, "tool_connection_reverification_required",
            "原任务所需工具「" + toolName + "」已停用、删除或未通过最新测试，请先恢复连接")
      }

      if (config.local_device_id) {
        var device = null
        try { device = require(__hooks + "/modules/local_devices.js").device(tx, String(config.local_device_id), owner) }
        catch (_) { fault(409, "local_device_unavailable", "原任务绑定的电脑已解绑或账号不可用，请重新连接电脑") }
        if (new Date().getTime() - Number(device.seen_ms || 0) > 45000)
          fault(409, "local_device_offline", "原任务绑定的电脑当前离线，请先连接电脑后再重新运行")
      }
      if (config.case_id) {
        try {
          var caseInfo = require(__hooks + "/modules/business_data.js").caseGet(tx, owner, String(config.case_id))
          if (config.question_id && !(caseInfo.questions || []).some(function (q) {
            return String(q.question_id) === String(config.question_id)
          })) fault(409, "business_question_unavailable", "原任务绑定的业务问题已不存在，请重新确认任务范围")
        } catch (caseError) {
          if (caseError && caseError.httpStatus) throw caseError
          fault(409, "business_case_unavailable", "原任务绑定的业务任务已不存在或不可访问")
        }
      }

      var maxSteps = Number(run.getInt("max_steps") || config.max_steps || 10)
      var budget = require(__hooks + "/modules/harness_budget.js").normalize(maxSteps, config.max_model_calls)
      if (!budget.ok) fault(409, "invalid_model_call_budget", "原任务的模型调用预算无效，请调整 Agent 配置")
      var deadlineMinutes = Number(config.max_runtime_minutes || 0)
      var deadline = deadlineMinutes === 0
        ? { ok:true, minutes:0, deadline_ms:0 }
        : require(__hooks + "/modules/harness_run_lifecycle.js")
            .deadlineFromMinutes(deadlineMinutes, new Date().getTime())
      if (!deadline.ok) fault(409, "invalid_runtime_deadline", "原任务的运行时限配置无效，请调整 Agent 配置")
      try { require(__hooks + "/modules/execution_budget.js").normalize(config.execution_budget, maxSteps) }
      catch (_) { fault(409, "invalid_execution_budget", "原任务执行预算配置无效，请调整 Agent 配置") }

      // Unknown writes must be reconciled manually. A succeeded write remains protected
      // by the durable side-effect journal and is replayed only for the exact same step/input.
      var uncertain = new DynamicModel({ total: 0 })
      tx.db().newQuery(
        "SELECT COUNT(*) AS total FROM agent_studio_side_effects " +
        "WHERE kind='agent' AND run_id={:run} AND status IN ('started','unknown')"
      ).bind({ run: runId }).one(uncertain)
      if (Number(uncertain.total || 0) > 0)
        fault(409, "write_reconciliation_required", "上一轮存在结果未确认的外部写操作。请先核查外部系统，完成核对后再决定是否重跑")

      var activeLease = new DynamicModel({ total: 0 })
      var now = new Date().getTime()
      tx.db().newQuery(
        "SELECT COUNT(*) AS total FROM agent_studio_run_leases " +
        "WHERE kind='agent' AND run_id={:run} AND expires_ms>{:now}"
      ).bind({ run: runId, now: now }).one(activeLease)
      if (Number(activeLease.total || 0) > 0)
        fault(409, "run_execution_still_active", "上一轮执行租约尚未释放，请稍后刷新任务状态再重试")

      var archivedCount = new DynamicModel({ total: 0 })
      tx.db().newQuery(
        "SELECT COUNT(*) AS total FROM agent_studio_run_attempts WHERE owner_uid={:owner} AND run_id={:run}"
      ).bind({ owner: owner, run: runId }).one(archivedCount)
      var attemptNo = Number(checkpoint.attempt_no || 0) || Number(archivedCount.total || 0) + 1

      // Execution budgets are persisted by run_id. Archive the exact prior counters,
      // then reset them atomically so every retry receives a fresh attempt budget.
      var budgetRows = arrayOf(new DynamicModel({
        limits:"",limits_hash:"",question_id:"",started_ms:0,model_intents:0,
        tool_intents:0,search_intents:0,read_intents:0,closing_intents:0,updated_ms:0,
      }))
      tx.db().newQuery(
        "SELECT limits,limits_hash,question_id,started_ms,model_intents,tool_intents," +
        "search_intents,read_intents,closing_intents,updated_ms " +
        "FROM agent_studio_execution_budgets WHERE run_id={:run} AND owner_uid={:owner}"
      ).bind({run:runId,owner:owner}).all(budgetRows)
      var archivedExecutionBudget = null
      if (budgetRows.length) {
        var budgetRow = budgetRows[0], archivedLimits = {}
        try { archivedLimits = JSON.parse(String(budgetRow.limits || "{}")) || {} } catch (_) {}
        archivedExecutionBudget = {
          limits:archivedLimits,limits_hash:String(budgetRow.limits_hash || ""),
          question_id:String(budgetRow.question_id || ""),started_ms:Number(budgetRow.started_ms || 0),
          model_intents:Number(budgetRow.model_intents || 0),tool_intents:Number(budgetRow.tool_intents || 0),
          search_intents:Number(budgetRow.search_intents || 0),read_intents:Number(budgetRow.read_intents || 0),
          closing_intents:Number(budgetRow.closing_intents || 0),updated_ms:Number(budgetRow.updated_ms || 0),
        }
      }

      var snapshot = {
        id: String(run.id), rh_user_id: owner, spec_id: specId,
        spec_name: String(run.getString("spec_name") || ""),
        instruction: String(run.getString("instruction") || ""),
        status: status, current_step: Number(run.getInt("current_step") || 0),
        max_steps: maxSteps, model: String(run.getString("model") || ""),
        config: previousConfig, spec_snapshot: specSnapshot,
        result: String(run.getString("result") || ""),
        error: String(run.getString("error") || ""),
        checkpoint: checkpoint, execution_budget:archivedExecutionBudget,
        evaluation: readJson(run, "evaluation", {}),
        feedback: readJson(run, "feedback", {}),
        created: String(run.getString("created") || ""),
        updated: String(run.getString("updated") || ""),
      }
      var eventRows = arrayOf(new DynamicModel({
        id:"",step_index:0,seq:0,event_type:"",content:"",created:"",
      }))
      tx.db().newQuery(
        "SELECT id,step_index,seq,event_type,content,created FROM run_events " +
        "WHERE run_id={:run} ORDER BY step_index,seq,created,id"
      ).bind({ run: runId }).all(eventRows)
      var archivedEvents = []
      for (var ei = 0; ei < eventRows.length; ei++) {
        var eventContent = {}
        try { eventContent = JSON.parse(String(eventRows[ei].content || "{}")) || {} } catch (_) {}
        archivedEvents.push({
          id:String(eventRows[ei].id),run_id:runId,
          step_index:Number(eventRows[ei].step_index || 0),seq:Number(eventRows[ei].seq || 0),
          event_type:String(eventRows[ei].event_type || "status"),
          content:eventContent,created:String(eventRows[ei].created || ""),
        })
      }

      tx.db().newQuery(
        "INSERT INTO agent_studio_run_attempts(" +
        "id,owner_uid,run_id,spec_id,attempt_no,request_id,request_hash,status,model,error,result," +
        "snapshot_json,events_json,archived_ms) VALUES(" +
        "{:id},{:owner},{:run},{:spec},{:attempt},{:request},{:hash},{:status},{:model},{:error},{:result}," +
        "{:snapshot},{:events},{:archived})"
      ).bind({
        id:$security.randomString(24),owner:owner,run:runId,spec:specId,attempt:attemptNo,
        request:requestId,hash:requestHash,status:status,model:snapshot.model,error:snapshot.error,
        result:snapshot.result,snapshot:JSON.stringify(snapshot),events:JSON.stringify(archivedEvents),archived:now,
      }).execute()

      // Start a clean attempt without changing the task ID or Agent ownership.
      tx.db().newQuery("DELETE FROM run_events WHERE run_id={:run}").bind({ run: runId }).execute()
      tx.db().newQuery(
        "UPDATE agent_studio_tool_grants SET revoked_ms={:now} " +
        "WHERE owner_uid={:owner} AND run_id={:run} AND revoked_ms=0"
      ).bind({ now:now,owner:owner,run:runId }).execute()
      tx.db().newQuery(
        "UPDATE studio_local_jobs SET status='cancelled',error='run_retried' " +
        "WHERE owner={:owner} AND run_id={:run} AND status IN ('queued','running')"
      ).bind({ owner:owner,run:runId }).execute()
      tx.db().newQuery(
        "DELETE FROM agent_studio_run_leases WHERE kind='agent' AND run_id={:run}"
      ).bind({ run:runId }).execute()
      tx.db().newQuery(
        "DELETE FROM agent_studio_execution_budgets WHERE run_id={:run} AND owner_uid={:owner}"
      ).bind({run:runId,owner:owner}).execute()

      var newCheckpoint = {
        attempt_no: attemptNo + 1,
        steps: [], seq: 1, claim_until: 0, done_steps: 0,
        execution_deadline_ms: deadline.deadline_ms,
        parse_failures: 0,
        harness_stats: { llm_calls:0,est_prompt_chars:0,est_out_chars:0,image_inputs:0,
          tool_calls:0,retries:0,compressions:0,approvals:0 },
        evidence_refs: [], call_sig_recent: [], pending_approval: null,
        pending_input: null, plan_review_confirmed: false,
        approval_decision: "", approved_step: 0,
        role_state: roleService.stateFor(rolePlan.orderedRoles, null),
      }
      run.set("model", modelShort)
      run.set("config", config)
      run.set("checkpoint", newCheckpoint)
      run.set("current_step", 0)
      run.set("status", "running")
      run.set("result", "")
      run.set("error", "")
      run.set("evaluation", {})
      run.set("feedback", {})
      tx.save(run)

      var event = new Record(tx.findCollectionByNameOrId("run_events"))
      event.set("run_id", runId)
      event.set("step_index", 0)
      event.set("seq", 1)
      event.set("event_type", "status")
      event.set("content", { message:"第 " + (attemptNo + 1) + " 次尝试已启动；上一轮执行记录已归档，任务编号保持不变" })
      tx.save(event)
      outcome = { httpStatus:200, body:{
        ok:true,run_id:runId,status:"running",attempt_no:attemptNo+1,deduplicated:false,
      } }
    })
    return outcome || { httpStatus:500, body:{error:"retry_failed",message:"重新运行未能启动"} }
  } catch (err) {
    var code = String((err && (err.code || err.message)) || "retry_failed")
    var status = Number(err && err.httpStatus) || 500
    try { app.logger().error("agent run retry failed", "code", code) } catch (_) {}
    return { httpStatus:status, body:{
      error:code, message:String((err && err.message) || "重新运行失败，请稍后重试"),
    } }
  }
}
module.exports = { retry: retry }
