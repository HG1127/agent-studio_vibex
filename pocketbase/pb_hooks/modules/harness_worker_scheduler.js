"use strict"

// Bounded tenant-safe server-side Worker discovery. The tick's database lease
// remains authoritative. Paginate past live leases so a large active queue
// does not starve newer eligible runs beyond the first 60 records.
var PAGE_SIZE = 60
var MAX_PAGES = 5
var MAX_READY_PER_KIND = 8

function discover(app, sources, leasedRuns) {
  var ready = []
  var examined = 0
  var scanCapped = false
  var errors = 0
  var known = {}
  for (var i = 0; i < sources.length; i++) {
    var source = sources[i]
    var readyForKind = 0
    for (var page = 0; page < MAX_PAGES; page++) {
      var rows
      try {
        rows = app.findRecordsByFilter(
          source.collection, "status = 'running'", "updated", PAGE_SIZE, PAGE_SIZE * page
        )
      } catch (_) {
        errors++
        break
      }
      if (!rows || !rows.length) break
      examined += rows.length
      for (var j = 0; j < rows.length; j++) {
        var row = rows[j]
        var id = String(row.id || "")
        var key = source.kind + ":" + id
        if (!id || known[key]) continue
        known[key] = true
        if (leasedRuns[key]) continue
        var owner = String(row.get("rh_user_id") || "").trim()
        if (!owner) continue
        var age = String(row.getString("updated") || row.getString("created") || "")
        ready.push({ source: source, id: id, owner: owner, ageKey: age })
        readyForKind++
        if (readyForKind >= MAX_READY_PER_KIND) break
      }
      if (readyForKind >= MAX_READY_PER_KIND || rows.length < PAGE_SIZE) break
      if (page === MAX_PAGES - 1) scanCapped = true
    }
  }
  ready.sort(function (a, b) {
    if (a.ageKey < b.ageKey) return -1
    if (a.ageKey > b.ageKey) return 1
    if (a.id < b.id) return -1
    if (a.id > b.id) return 1
    return a.source.kind < b.source.kind ? -1 : a.source.kind > b.source.kind ? 1 : 0
  })
  return { candidates: ready, examined: examined, scan_capped: scanCapped, source_errors: errors }
}

module.exports = { discover: discover, PAGE_SIZE: PAGE_SIZE, MAX_PAGES: MAX_PAGES }
