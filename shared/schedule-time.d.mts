export type RecurrenceSchedule={recurrence_kind:string;start_at_ms:number;interval_minutes?:number;time_zone?:string;local_time?:string;weekday?:number}
export function validTimeZone(value:string):boolean
export function nextScheduleTime(schedule:RecurrenceSchedule,afterMs:number,skipLocalDateMs?:number|null):number|null
export function zonedDateTimeToEpoch(dateText:string,timeText:string,timeZone:string):number
export function zonedDateString(ms:number,timeZone:string):string
export function scheduleDescription(schedule:RecurrenceSchedule):string
