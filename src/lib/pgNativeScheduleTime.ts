import {zonedDateTimeToEpoch,zonedDateString} from "./scheduleTime.js"

export function scheduleActivationLocalStart(anchor:string|undefined,timeZone:string,now:number):{date:string;time:string}|null{
  const epoch=anchor?Date.parse(anchor):NaN
  if(!Number.isFinite(epoch)||epoch<=now)return null
  return {date:zonedDateString(epoch,timeZone),time:new Intl.DateTimeFormat("en-GB",{timeZone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(epoch)}
}

export function scheduleActivationWindow({start,timeZone,now,unlimited,days}:{
  start:{date:string;time:string}|null;timeZone:string;now:number;unlimited:boolean;days:number
}):{anchor_at:string;expires_at:string|null}{
  if(!Number.isFinite(now)||!Number.isInteger(days)||days<1||days>365)throw Error("invalid_schedule_window")
  const anchor=start?zonedDateTimeToEpoch(start.date,start.time,timeZone):now
  if(start&&anchor<=now)throw Error("schedule_start_in_past")
  if(anchor>now+367*86400000)throw Error("schedule_start_too_far")
  const expiry=unlimited?null:now+days*86400000
  if(expiry!==null&&anchor>=expiry)throw Error("schedule_expiry_before_start")
  return {anchor_at:new Date(anchor).toISOString(),expires_at:expiry===null?null:new Date(expiry).toISOString()}
}
