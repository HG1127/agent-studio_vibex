// Pure original execution-budget normalization; no billing or runtime authority.
function normalize(input,maxSteps){
  var steps=Math.max(1,Math.min(30,Number(maxSteps)||10)),base={model_calls:steps*4+2,tool_calls:steps*2,search_calls:steps*2,read_calls:steps*2,wall_ms:3600000,closing_model_calls:1}
  if(input===undefined||input===null)return base
  if(typeof input!=="object"||Array.isArray(input))throw Error("invalid_execution_budget")
  var ceilings={model_calls:500,tool_calls:200,search_calls:200,read_calls:200,wall_ms:86400000,closing_model_calls:2}
  Object.keys(input).forEach(function(key){if(!Object.prototype.hasOwnProperty.call(ceilings,key)||!Number.isInteger(input[key])||input[key]<(key==="wall_ms"?1000:0)||input[key]>ceilings[key])throw Error("invalid_execution_budget");base[key]=input[key]})
  if(base.search_calls>base.tool_calls)base.search_calls=base.tool_calls
  if(base.read_calls>base.tool_calls)base.read_calls=base.tool_calls
  if(input.closing_model_calls===undefined)base.closing_model_calls=Math.min(1,base.model_calls)
  if(base.closing_model_calls>base.model_calls)throw Error("invalid_execution_budget")
  return base
}
export {normalize as normalizeMonitorExecutionBudget}
