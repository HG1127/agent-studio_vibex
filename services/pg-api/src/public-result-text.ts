// Apply legacy final-result masking only at public text boundaries. Private
// replay journals, input fingerprints and original delivery evidence stay exact.
export function redactResultText(value:string):string{
  return value.replace(/sk-[A-Za-z0-9_-]{8,}/g,"***").replace(/Bearer\s+\S+/g,"Bearer ***")
    .replace(/token=\S+/g,"token=***").replace(/api_key=\S+/g,"api_key=***")
}
