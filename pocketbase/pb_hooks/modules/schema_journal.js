"use strict"

// A VibeX-friendly migration journal for custom PocketBase SQLite tables.
// This is NOT PocketBase's official pb_migrations runner. SQL migration steps
// must be immutable once deployed. Tables and version rows are committed atomically.
function applySteps(app, steps) {
  app.db().newQuery(
    "CREATE TABLE IF NOT EXISTS agent_studio_schema_migrations (" +
    "id TEXT PRIMARY KEY, applied_ms INTEGER NOT NULL, description TEXT NOT NULL)"
  ).execute()
  for (var i = 0; i < steps.length; i++) {
    var step = steps[i]
    if (!step || !/^[a-z][a-z0-9_]{5,100}$/.test(String(step.id || "")) ||
        typeof step.apply !== "function") throw new Error("invalid_schema_migration")
    app.runInTransaction(function (txApp) {
      var recorded = new DynamicModel({ description: "" })
      var exists = false
      try {
        txApp.db().newQuery(
          "SELECT description FROM agent_studio_schema_migrations WHERE id={:id}"
        ).bind({ id: step.id }).one(recorded)
        exists = true
      } catch (_) {}
      if (exists) {
        // Fail closed when an already applied version was silently modified.
        if (String(recorded.description) !== String(step.description || "")) {
          throw new Error("migration_definition_changed:" + String(step.id))
        }
        return
      }
      step.apply(txApp)
      txApp.db().newQuery(
        "INSERT INTO agent_studio_schema_migrations(id,applied_ms,description) " +
        "VALUES({:id},{:ms},{:desc})"
      ).bind({
        id: String(step.id), ms: new Date().getTime(),
        desc: String(step.description || ""),
      }).execute()
    })
  }
}
module.exports = { applySteps: applySteps }
