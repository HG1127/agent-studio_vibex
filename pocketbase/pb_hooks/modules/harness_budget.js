"use strict"

// Shared, deterministic model-call ceiling. Distinct from approximate token
// accounting; no promise of exact provider billing or hard dollar cap.
function normalize(maxSteps, supplied) {
  var steps = Number(maxSteps)
  if (!Number.isInteger(steps) || steps < 1) steps = 10
  var v = supplied === undefined || supplied === null || supplied === ""
    ? Math.max(12, Math.min(100, steps * 3)) : Number(supplied)
  if (!Number.isInteger(v) || v < 1 || v > 100) return { ok: false, error: "invalid_model_call_budget" }
  return { ok: true, max_model_calls: v }
}
function allowModelCall(stats, budget) {
  var maximum = Number(budget)
  var calls = Number((stats || {}).llm_calls || 0)
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 100 ||
      !Number.isInteger(calls) || calls < 0)
    return { ok: false, error: "model_budget_invalid" }
  if (calls >= maximum) return { ok: false, error: "model_call_budget_exhausted" }
  return { ok: true, remaining: maximum - calls }
}
module.exports = { normalize: normalize, allowModelCall: allowModelCall }
