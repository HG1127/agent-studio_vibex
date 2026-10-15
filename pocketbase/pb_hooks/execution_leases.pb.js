// SQLite-backed atomic execution leases shared by browser ticks and external workers.
// This table is internal; no public CRUD routes. Acquisition and release happen in the
// existing authenticated agent/workflow tick routes via single-statement CAS SQL.
onBootstrap(function (e) {
  e.next()
  try {
    require(__hooks + "/modules/runtime_schema.js").applyExecutionMigrations($app)
  } catch (err) {
    try { $app.logger().error("execution schema migration failed", "err", String((err && err.message) || err)) } catch (_) {}
    // Engine lease acquisition must remain fail closed when the database schema is unavailable.
  }
})
