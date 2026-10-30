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
  allowOriginalModelConnections?:boolean
  originalModelDraftProbeProtocol?:string
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
  allowAgentReviewHistory?:boolean
  allowAgentReviewSubmission?:boolean
  allowAgentGeneratedAcceptance?:boolean
  allowAgentGeneratedAcceptanceWrites?:boolean
  allowAgentDesign?:boolean
  allowAgentDesignSubmissions?:boolean
  allowAgentDesignSaves?:boolean
  allowAgentCallers?:boolean
  allowAgentCallerWrites?:boolean
  allowAgentCallerRuns?:boolean
  allowApprovalDelegations?:boolean
  allowApprovalDelegationWrites?:boolean
  allowInternalShare?:boolean
  allowInternalShareWrites?:boolean
  allowLocalDevices?:boolean
  allowLocalDeviceWrites?:boolean
  allowAgentTemplateMarket?:boolean
  allowAgentTemplateMarketWrites?:boolean
  allowAgentDescriptivePatch?:boolean
  allowAgentDescriptivePatchWrites?:boolean
  allowOwnerToolHub?:boolean
  allowOwnerToolTrials?:boolean
  allowPublicMcpRegistry?:boolean
  allowOwnOperations?:boolean
  allowCompanyOverview?:boolean
  allowCompanyWorkerHeartbeats?:boolean
  allowEmployeeGovernance?:boolean
  allowEmployeeProvisioning?:boolean
}):{handler:HttpHandler,authenticateRequest:(req:IncomingMessage)=>Promise<Identity>}
export function nativeSessionToken(req:IncomingMessage):string|null
export function verifyNativeOrigin(req:IncomingMessage,allowedOrigin:string,unsafe?:boolean):void
