export type MonitorExecutionBudget={model_calls:number;tool_calls:number;search_calls:number;read_calls:number;wall_ms:number;closing_model_calls:number}
export function normalizeMonitorExecutionBudget(input:unknown,maxSteps:number):MonitorExecutionBudget
