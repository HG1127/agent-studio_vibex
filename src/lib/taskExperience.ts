// Presentation only. Readiness, paid execution and authorization remain on
// their existing explicit controls and owner-scoped backend routes.
export function shouldShowTaskComposer(hasAgent:boolean,hasRun:boolean):boolean{
  return hasAgent&&!hasRun
}
export function needsLocalDevice(tools:readonly string[]|undefined,selectedDeviceId:string):boolean{
  return Boolean(selectedDeviceId)||(tools||[]).some(tool=>tool==="local_computer")
}
export function defaultRunView(status:string|undefined):"process"|"results"{
  return status&&["queued","pending","running","awaiting_input","awaiting_approval","paused"].includes(status)?"process":"results"
}
