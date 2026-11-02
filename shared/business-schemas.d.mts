export const businessSchemaNames:readonly string[]
export function validateBusinessSchema(schema:string,payload:unknown):void
export function businessObject(value:unknown,keys:string[]):void
export function businessString(value:unknown,max:number,optional?:boolean):void
export function businessStrings(value:unknown,max:number):void
export function businessCanonical(value:unknown):string
