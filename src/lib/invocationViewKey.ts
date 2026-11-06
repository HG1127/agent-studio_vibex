/** A history response is valid only for the exact query/view that requested it.
 * Prevents a previous tool/status/run/page from flashing as the new selection. */
export function invocationViewKey(
  owner:string,runId:string,tool:string,query:string,status:string,source:string,page:number,
):string {
  return JSON.stringify([owner,runId,tool,query,status,source,page])
}
export function isInvocationViewCurrent(selectedKey:string,loadedKey:string):boolean {
  return Boolean(loadedKey) && loadedKey===selectedKey
}
