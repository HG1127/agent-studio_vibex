// Untrusted schema compilation/regexes never run on an API/Broker event loop.
import {parentPort,workerData} from "node:worker_threads"
import Ajv2020 from "ajv/dist/2020.js"
import Ajv2019 from "ajv/dist/2019.js"
import Ajv07 from "ajv"
try{
  const {schema,args}=workerData
  const rejectAsync=value=>{if(value&&typeof value==="object")for(const [key,item] of Object.entries(value)){if(key==="$async")throw Error("async_schema_not_supported");rejectAsync(item)}}
  rejectAsync(schema)
  const dialect=schema.$schema??"https://json-schema.org/draft/2020-12/schema"
  const Constructor=dialect==="https://json-schema.org/draft/2020-12/schema"?Ajv2020:
    dialect==="https://json-schema.org/draft/2019-09/schema"?Ajv2019:
    ["http://json-schema.org/draft-07/schema#","https://json-schema.org/draft-07/schema"].includes(dialect)?Ajv07:null
  if(!Constructor)throw Error("unsupported_schema")
  const ajv=new Constructor({strict:false,allErrors:false,validateFormats:false,ownProperties:true,
    coerceTypes:false,useDefaults:false,removeAdditional:false,logger:false,addUsedSchema:false,loopRequired:20,loopEnum:20})
  const validate=ajv.compile(schema)
  parentPort.postMessage({valid:args===undefined||Boolean(validate(args))})
}catch{parentPort.postMessage({valid:false})}
