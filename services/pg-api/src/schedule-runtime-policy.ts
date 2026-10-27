export const SCHEDULE_RUNTIME_MARKER="APPROVE_DISPOSABLE_PG18_SCHEDULE_RUNTIME_ONLY"
export function selectScheduleRuntime(env:NodeJS.ProcessEnv):boolean{
  const flag=env.AGENT_STUDIO_PG18_SCHEDULE_RUNTIME_ENABLED,ack=env.AGENT_STUDIO_PG18_SCHEDULE_RUNTIME_APPROVED
  if(flag===undefined&&ack===undefined)return false
  if(flag!=="true"||ack!==SCHEDULE_RUNTIME_MARKER)throw Error("unsafe_native_schedule_activation")
  return true
}
