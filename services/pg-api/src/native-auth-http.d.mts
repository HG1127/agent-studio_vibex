import type {IncomingMessage,ServerResponse} from "node:http"
import type {Identity} from "./contracts.ts"
import type {NativeAuthRepository} from "./native-auth-repository.mjs"
type HttpHandler=(req:IncomingMessage,res:ServerResponse)=>void|Promise<void>
export function createNativeAuthHttpHandler(deps:{
  auth:NativeAuthRepository
  allowedOrigin:string
  businessHandler:HttpHandler
  allowConfigurationWrites?:boolean
  allowModelProbe?:boolean
  allowRunSubmission?:boolean
  allowBoundRunSubmission?:boolean
  allowWorkflowValidation?:boolean
  allowWorkflowExecution?:boolean
  allowWorkflowV2Submission?:boolean
  allowEmployeeProvisioning?:boolean
}):{handler:HttpHandler,authenticateRequest:(req:IncomingMessage)=>Promise<Identity>}
