"use strict"

// Bounded, per-run trace summary. Does not retain raw model text or identifiers.
function summarize(items) {
  var rows = Array.isArray(items) ? items : []
  var latencies = []
  var failed = 0
  var model = 0
  var tool = 0
  for (var i = 0; i < rows.length; i++) {
    var item = rows[i] || {}
    var ms = Number(item.duration_ms)
    if (Number.isFinite(ms) && ms >= 0) latencies.push(ms)
    if (item.status === "failed") failed++
    if (item.operation === "model") model++
    if (item.operation === "tool") tool++
  }
  latencies.sort(function(a,b) { return a-b })
  function percentile(p) {
    if (!latencies.length) return 0
    return latencies[Math.max(0,Math.ceil(p*latencies.length)-1)]
  }
  var total=0
  for(var j=0;j<latencies.length;j++)total+=latencies[j]
  return {
    sampled_spans:rows.length, failed_spans:failed,
    model_calls:model, tool_calls:tool,
    average_ms:latencies.length?Math.round(total/latencies.length):0,
    p50_ms:percentile(0.5),p95_ms:percentile(0.95),
  }
}
module.exports={summarize:summarize}
