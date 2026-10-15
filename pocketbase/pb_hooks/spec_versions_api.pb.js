// spec_versions_api.pb.js — 助手方案「版本与发布」数据通路
// 表结构由 MCP install_business_collection 装（spec_versions.pb.js，仅 create/update/delete，前端不用）。
// 本文件是前端唯一数据通路：
//   GET    /api/spec-versions?spec_id=<id>   版本列表（按 -version_no）
//   POST   /api/spec-versions                保存版本（服务端读 agent_specs 当前配置做快照，version_no=max+1）
//   POST   /api/spec-versions/{id}/restore   把快照写回 agent_specs.spec
//   POST   /api/spec-versions/{id}/publish   状态流转：同 spec 原 published→archived，目标→published+published_at
//   DELETE /api/spec-versions/{id}           仅 draft 可删
// 全部路由 X-Rh-User-Id 归属校验（非本人一律 404），5xx 一律 { error, message, fingerprint }。
// Goja 铁律：全部 var、helper 就地定义、每个回调 self-contained、json 字段 getString 优先、
// 时间一律 new Date().toISOString() / new Date().getTime()。

routerAdd("GET", "/api/spec-versions", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var query = (e.requestInfo() || {}).query || {}
    var specId = String(query.spec_id || "").trim()

    var rowOut = function (rec) {
      var snapText = ""
      try {
        snapText = rec.getString("spec_snapshot")
      } catch (_) {
        snapText = ""
      }
      var snapObj = null
      if (snapText) {
        try {
          snapObj = JSON.parse(snapText)
        } catch (_) {
          snapObj = null
        }
      }
      var cfgText = ""
      try {
        cfgText = rec.getString("config_snapshot")
      } catch (_) {
        cfgText = ""
      }
      var cfgObj = null
      if (cfgText) {
        try {
          cfgObj = JSON.parse(cfgText)
        } catch (_) {
          cfgObj = null
        }
      }
      var pubStr = ""
      try {
        pubStr = String(rec.getString("published_at") || "")
      } catch (_) {}
      if (pubStr.indexOf("0001-01-01") === 0) pubStr = ""
      var passed = false
      try {
        passed = rec.getBool("test_passed")
      } catch (_) {}
      return {
        id: String(rec.id),
        rh_user_id: String(rec.get("rh_user_id") || ""),
        spec_id: String(rec.get("spec_id") || ""),
        version_no: Number(rec.getInt("version_no") || 0),
        spec_snapshot: snapObj,
        config_snapshot: cfgObj,
        note: String(rec.getString("note") || ""),
        test_run_id: String(rec.getString("test_run_id") || ""),
        test_passed: passed,
        status: String(rec.getString("status") || "draft"),
        published_at: pubStr,
        created: String(rec.getString("created") || ""),
        updated: String(rec.getString("updated") || ""),
      }
    }

    var rows = []
    try {
      if (specId) {
        rows = $app.findRecordsByFilter(
          "spec_versions",
          "rh_user_id = {:uid} && spec_id = {:sid}",
          "-version_no",
          200,
          0,
          { uid: uid, sid: specId },
        )
      } else {
        rows = $app.findRecordsByFilter("spec_versions", "rh_user_id = {:uid}", "-version_no", 200, 0, { uid: uid })
      }
    } catch (_) {
      rows = []
    }
    var items = []
    for (var i = 0; i < rows.length; i++) items.push(rowOut(rows[i]))
    return e.json(200, { ok: true, items: items })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("spec_versions list error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/spec-versions", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var body = (e.requestInfo() || {}).body || {}
    var specId = String(body.spec_id || "").trim()
    if (!specId) return e.json(400, { error: "bad_request", message: "缺少助手方案" })

    // 归属校验：agent_specs 必须是本人的
    var specRec = null
    try {
      specRec = $app.findRecordById("agent_specs", specId)
    } catch (_) {}
    if (!specRec || String(specRec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "助手方案不存在或已删除" })
    }

    // 服务端做快照，不信任前端传来的配置内容
    var specText = ""
    try {
      specText = specRec.getString("spec")
    } catch (_) {
      specText = ""
    }
    var specObj = null
    if (specText) {
      try {
        specObj = JSON.parse(specText)
      } catch (_) {
        specObj = null
      }
    }
    if (!specObj || typeof specObj !== "object") specObj = {}
    var cfgSnapshot = {
      name: String(specRec.getString("name") || "未命名助手"),
      source: String(specRec.getString("source") || ""),
      template_key: String(specRec.getString("template_key") || ""),
      saved_at: new Date().toISOString(),
    }

    // 关联测试运行：服务端核验归属 + 由 run 终态计算 test_passed，不信任前端布尔
    var testRunId = String(body.test_run_id || "").trim().slice(0, 64)
    var testPassed = false
    if (testRunId) {
      var runRec = null
      try {
        runRec = $app.findRecordById("agent_runs", testRunId)
      } catch (_) {}
      if (!runRec || String(runRec.get("rh_user_id") || "") !== uid || String(runRec.get("spec_id")) !== specId) {
        testRunId = ""
      } else {
        testPassed = String(runRec.getString("status") || "") === "succeeded"
      }
    }

    // version_no 服务端算 max+1
    var maxNo = 0
    try {
      var top = $app.findRecordsByFilter(
        "spec_versions",
        "rh_user_id = {:uid} && spec_id = {:sid}",
        "-version_no",
        1,
        0,
        { uid: uid, sid: specId },
      )
      if (top && top.length > 0) maxNo = Number(top[0].getInt("version_no") || 0)
    } catch (_) {
      maxNo = 0
    }
    var nextNo = maxNo + 1

    var col = $app.findCollectionByNameOrId("spec_versions")
    var rec = new Record(col)
    rec.set("rh_user_id", uid)
    rec.set("spec_id", specId)
    rec.set("version_no", nextNo)
    rec.set("spec_snapshot", specObj)
    rec.set("config_snapshot", cfgSnapshot)
    rec.set("note", String(body.note || "").trim().slice(0, 500))
    rec.set("test_run_id", testRunId)
    rec.set("test_passed", testPassed)
    rec.set("status", "draft")
    $app.save(rec)

    return e.json(200, {
      ok: true,
      item: {
        id: String(rec.id),
        rh_user_id: uid,
        spec_id: specId,
        version_no: nextNo,
        spec_snapshot: specObj,
        config_snapshot: cfgSnapshot,
        note: String(body.note || "").trim().slice(0, 500),
        test_run_id: testRunId,
        test_passed: testPassed,
        status: "draft",
        published_at: "",
        created: String(rec.getString("created") || ""),
        updated: String(rec.getString("updated") || ""),
      },
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("spec_versions create error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/spec-versions/{id}/restore", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "")
    var verRec = null
    try {
      verRec = $app.findRecordById("spec_versions", id)
    } catch (_) {}
    if (!verRec || String(verRec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "版本不存在或已删除" })
    }
    var specId = String(verRec.get("spec_id") || "")
    var specRec = null
    try {
      specRec = $app.findRecordById("agent_specs", specId)
    } catch (_) {}
    if (!specRec || String(specRec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "助手方案不存在或已删除，无法恢复" })
    }

    var snapText = ""
    try {
      snapText = verRec.getString("spec_snapshot")
    } catch (_) {
      snapText = ""
    }
    var snapObj = null
    if (snapText) {
      try {
        snapObj = JSON.parse(snapText)
      } catch (_) {
        snapObj = null
      }
    }
    if (!snapObj || typeof snapObj !== "object") {
      return e.json(400, { error: "bad_snapshot", message: "该版本的配置快照已损坏，无法恢复" })
    }
    specRec.set("spec", snapObj)
    $app.save(specRec)
    return e.json(200, {
      ok: true,
      id: id,
      version_no: Number(verRec.getInt("version_no") || 0),
      restored_spec_id: specId,
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("spec_versions restore error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/spec-versions/{id}/publish", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "")
    var verRec = null
    try {
      verRec = $app.findRecordById("spec_versions", id)
    } catch (_) {}
    if (!verRec || String(verRec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "版本不存在或已删除" })
    }
    var curStatus = String(verRec.getString("status") || "draft")
    if (curStatus === "published") {
      var pubStr0 = ""
      try {
        pubStr0 = String(verRec.getString("published_at") || "")
      } catch (_) {}
      if (pubStr0.indexOf("0001-01-01") === 0) pubStr0 = ""
      return e.json(200, {
        ok: true,
        id: id,
        version_no: Number(verRec.getInt("version_no") || 0),
        status: "published",
        published_at: pubStr0,
        already: true,
      })
    }

    var specId = String(verRec.get("spec_id") || "")
    // 同 spec 下原 published 一律归档
    var archivedIds = []
    try {
      var pubs = $app.findRecordsByFilter(
        "spec_versions",
        "rh_user_id = {:uid} && spec_id = {:sid} && status = 'published'",
        "-version_no",
        50,
        0,
        { uid: uid, sid: specId },
      )
      for (var i = 0; i < pubs.length; i++) {
        if (String(pubs[i].id) === id) continue
        pubs[i].set("status", "archived")
        $app.save(pubs[i])
        archivedIds.push(String(pubs[i].id))
      }
    } catch (aerr) {
      var amsg = String((aerr && aerr.message) || aerr)
      return e.json(500, { error: "internal", message: amsg, fingerprint: amsg.slice(0, 80) })
    }

    var nowIso = new Date().toISOString()
    verRec.set("status", "published")
    verRec.set("published_at", nowIso)
    $app.save(verRec)
    return e.json(200, {
      ok: true,
      id: id,
      version_no: Number(verRec.getInt("version_no") || 0),
      status: "published",
      published_at: nowIso,
      archived_ids: archivedIds,
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("spec_versions publish error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("DELETE", "/api/spec-versions/{id}", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "")
    var verRec = null
    try {
      verRec = $app.findRecordById("spec_versions", id)
    } catch (_) {}
    if (!verRec || String(verRec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "版本不存在或已删除" })
    }
    var curStatus = String(verRec.getString("status") || "draft")
    if (curStatus !== "draft") {
      return e.json(400, { error: "not_draft", message: "只有草稿版本可以删除，已发布或已归档版本请保留" })
    }
    $app.delete(verRec)
    return e.json(200, { ok: true, id: id })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("spec_versions delete error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})
