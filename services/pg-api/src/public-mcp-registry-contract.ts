// Browser-safe identity grammar only. No Node imports or network behavior.
export function registryServerName(value:unknown):value is string{return typeof value==='string'&&value.length<=255&&/^[a-z0-9][a-z0-9.-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)&&!value.includes('..')}
export function registryVersion(value:unknown):value is string{return typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/.test(value)&&value!=='.'&&value!=='..'}
