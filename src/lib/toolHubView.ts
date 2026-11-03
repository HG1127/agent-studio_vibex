/** A single source of truth for the execution-resource sub-workspace.
 * Route query changes must not silently load every diagnostics endpoint. */
export type ToolHubView="devices"|"debug"|"activity"|"monitor"
export function resolveToolHubView(value:string|null):ToolHubView {
  return value==="debug"||value==="activity"||value==="monitor"||value==="devices"?value:"devices"
}
