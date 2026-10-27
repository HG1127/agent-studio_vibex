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
  allowMcpDiscovery?:boolean
  allowMcpToolExecution?:boolean
  allowSmitheryManagement?:boolean
  allowKnowledgeSharing?:boolean
  allowKnowledgeEmbeddingSettings?:boolean
  allowKnowledgeEmbeddingConsent?:boolean
  allowKnowledgeIndexRuntime?:boolean
  allowKnowledgeQueryRuntime?:boolean
  allowKnowledgeToolExecution?:boolean
  allowRunSubmission?:boolean
  allowBoundRunSubmission?:boolean
  allowWorkflowValidation?:boolean
  allowWorkflowExecution?:boolean
  allowAutonomousAgentSubmission?:boolean
  allowWorkflowV2Submission?:boolean
  allowScheduleRuntime?:boolean
  allowAgentCollaboration?:boolean
  allowAgentReleases?:boolean
  allowAgentHumanInput?:boolean
  allowAgentMemory?:boolean
  allowAgentMemoryRuntime?:boolean
  allowAgentDerivedMemory?:boolean
  allowAgentDerivedMemoryWrites?:boolean
  allowAgentOutcomeMemory?:boolean
  allowAgentOutcomeMemoryAdmission?:boolean
  allowAgentFeedback?:boolean
  allowAgentFeedbackSubmission?:boolean
  allowAgentFeedbackLessons?:boolean
  allowAgentOptimization?:boolean
  allowAgentOptimizationAcceptance?:boolean
  allowAgentReview?:boolean
  allowAgentReviewSubmission?:boolean
  allowEmployeeGovernance?:boolean
  allowEmployeeProvisioning?:boolean
}):{handler:HttpHandler,authenticateRequest:(req:IncomingMessage)=>Promise<Identity>}
