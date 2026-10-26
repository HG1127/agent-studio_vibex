import {HttpError,isUuid,type Identity,type SqlClient,type SqlPool} from "./contracts.ts"
import {withActor,assertOwnedAdmissionContext} from "./repository.ts"
import {parseAgentFeedbackChange,type AgentFeedbackChange} from "./agent-feedback-contract.ts"
import {verifyAgentFeedbackCredentials} from "./agent-feedback-audit.ts"
import {loadAgentFeedbackTask,verifyAgentFeedbackLessonSource,type AgentFeedbackTask} from "./agent-feedback-source.ts"
import {feedbackMemoryLesson} from "./agent-memory-derived-text.ts"
import {agentMemoryHash} from "./agent-memory-contract.ts"
type Receipt={request_id:string;run_id:string;spec_id:string;action:AgentFeedbackChange["action"];revision:number|string;feedback_id:string;source_sha256:string;statement_sha256:string;feedback_sha256:string;request_sha256:string;owner_epoch:number|string;remember_lesson:boolean;created_at:string|Date}
type Body={rating:"up"|"down";tags:string[];comment:string}
type Decision="not_requested"|"stored"|"source_unavailable"|"writes_disabled"|"write_failed"
type LessonResult={feedback_id:string;decision:Decision;content_sha256:string|null;created_at:string|Date}
const columns="request_id,run_id,spec_id,action,revision,feedback_id,source_sha256,statement_sha256,feedback_sha256,request_sha256,owner_epoch,remember_lesson,created_at"
const protocol="agent_feedback_v1" as const
function native(identity:Identity){if(identity?.issuer!=="urn:agentstudio:local:v1")throw new HttpError(403,"native_employee_identity_required")}
function safeRevision(value:number|string):number{const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>Number.MAX_SAFE_INTEGER-1)throw new HttpError(409,"agent_feedback_revision_unavailable");return n}
async function required(db:SqlClient){if(!await verifyAgentFeedbackCredentials(db))throw new HttpError(409,"agent_feedback_schema_required")}
async function epoch(db:SqlClient){const value=(await db.query<{epoch:number|string|null}>("SELECT agentstudio.agent_memory_outcome_epoch() AS epoch")).rows[0]?.epoch;if(value===null||value===undefined)throw new HttpError(403,"native_employee_identity_required");return safeRevision(value)}
export class AgentFeedbackRepository{
  readonly pool:SqlPool;readonly submitting:boolean;readonly storingLessons:boolean
  constructor(pool:SqlPool,options:{allowSubmit?:boolean;allowLessonStorage?:boolean}={}){this.pool=pool;this.submitting=options.allowSubmit===true;this.storingLessons=options.allowLessonStorage===true}
  private async audit(db:SqlClient,owner:string,row:Pick<Receipt,"request_id"|"run_id"|"feedback_id"|"revision">,action:string,extra:Record<string,unknown>={}){
    await db.query("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata) VALUES($1::uuid,$1::uuid,$2::uuid,$3,'agent_feedback',$4::text,'succeeded',$5::jsonb)",
      [owner,row.run_id,"agent.feedback_"+action,row.feedback_id,JSON.stringify({request_id:row.request_id,revision:Number(row.revision),feedback_id:row.feedback_id,...extra})])
  }
  private async latest(db:SqlClient,owner:string,run:string):Promise<Receipt|undefined>{return (await db.query<Receipt>("SELECT "+columns+" FROM agentstudio.agent_feedback_receipts WHERE owner_user_id=$1::uuid AND run_id=$2::uuid AND action<>'forget_lesson' ORDER BY revision DESC LIMIT 1",[owner,run])).rows[0]}
  private async lessonResult(db:SqlClient,owner:string,id:string):Promise<LessonResult|null>{return (await db.query<LessonResult>("SELECT feedback_id,decision,content_sha256,created_at FROM agentstudio.agent_feedback_lesson_results WHERE owner_user_id=$1::uuid AND feedback_id=$2::uuid",[owner,id])).rows[0]??null}
  private async receipt(db:SqlClient,owner:string,row:Receipt,replayed:boolean){
    return {protocol,request_id:row.request_id,run_id:row.run_id,spec_id:row.spec_id,action:row.action,revision:safeRevision(row.revision),feedback_id:row.feedback_id,source_sha256:row.source_sha256,statement_sha256:row.statement_sha256,
      feedback_sha256:row.feedback_sha256,request_sha256:row.request_sha256,remember_lesson:row.remember_lesson,lesson_result:await this.lessonResult(db,owner,row.feedback_id),recorded:true as const,replayed}
  }
  private async previous(db:SqlClient,owner:string,choice:AgentFeedbackChange){
    const row=(await db.query<Receipt>("SELECT "+columns+" FROM agentstudio.agent_feedback_receipts WHERE owner_user_id=$1::uuid AND request_id=$2::uuid",[owner,choice.request_id])).rows[0]
    if(!row)return null
    if(row.run_id!==choice.run_id||row.spec_id!==choice.spec_id||row.action!==choice.action||row.request_sha256!==choice.request_sha256)throw new HttpError(409,"agent_feedback_request_conflict")
    return this.receipt(db,owner,row,true)
  }
  async confirm(identity:Identity,raw:unknown){
    native(identity);const choice=parseAgentFeedbackChange(raw)
    return withActor(this.pool,identity,async(db,owner)=>{await required(db);await epoch(db);const previous=await this.previous(db,owner,choice);if(!previous)throw new HttpError(404,"agent_feedback_receipt_not_found");return previous})
  }
  async change(identity:Identity,raw:unknown){
    native(identity);const choice=parseAgentFeedbackChange(raw)
    return withActor(this.pool,identity,async(db,owner)=>{
      await assertOwnedAdmissionContext(db,owner);await required(db)
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,541))",[owner+":"+choice.request_id])
      await epoch(db)
      const prior=await this.previous(db,owner,choice);if(prior)return prior
      if(choice.action==="submit"&&!this.submitting)throw new HttpError(403,"agent_feedback_submission_disabled")
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,540))",[owner+":"+choice.run_id])
      const current=await this.latest(db,owner,choice.run_id),revision=current?safeRevision(current.revision):0
      let task:AgentFeedbackTask|undefined
      let original:Receipt|undefined,next:number,source:string,statement:string,feedback:string,remember=false
      if(choice.action==="submit"){
        task=await loadAgentFeedbackTask(db,owner,choice.run_id,choice.spec_id)
        if(choice.expected_revision!==revision)throw new HttpError(409,"agent_feedback_revision_changed")
        if(task.source_sha256===null||task.source_sha256!==choice.expected_source_sha256)throw new HttpError(409,"agent_feedback_task_source_changed")
        next=revision+1;source=choice.expected_source_sha256;statement=choice.statement_sha256;feedback=choice.request_id;remember=choice.remember_lesson
      }else if(choice.action==="erase_feedback"){
        if(!current||current.action!=="submit"||current.spec_id!==choice.spec_id||choice.expected_revision!==revision||choice.expected_feedback_sha256!==current.feedback_sha256)throw new HttpError(409,"agent_feedback_revision_changed")
        original=current;next=revision+1;source=current.source_sha256;statement=current.statement_sha256;feedback=current.feedback_id
      }else{
        original=(await db.query<Receipt>("SELECT "+columns+" FROM agentstudio.agent_feedback_receipts WHERE owner_user_id=$1::uuid AND request_id=$2::uuid AND run_id=$3::uuid AND spec_id=$4::uuid AND action='submit'",[owner,choice.feedback_id,choice.run_id,choice.spec_id])).rows[0]
        if(!original)throw new HttpError(404,"agent_feedback_lesson_not_found")
        const saved=await this.lessonResult(db,owner,original.feedback_id)
        if(saved?.decision!=="stored"||(await db.query("SELECT feedback_id FROM agentstudio.agent_feedback_lessons WHERE owner_user_id=$1::uuid AND feedback_id=$2::uuid",[owner,original.feedback_id])).rows.length!==1)throw new HttpError(404,"agent_feedback_lesson_not_found")
        if(saved.content_sha256!==choice.expected_content_sha256)throw new HttpError(409,"agent_feedback_lesson_changed")
        next=revision;source=original.source_sha256;statement=original.statement_sha256;feedback=original.feedback_id
      }
      const row=(await db.query<Receipt>("INSERT INTO agentstudio.agent_feedback_receipts(owner_user_id,request_id,run_id,spec_id,action,revision,feedback_id,source_sha256,statement_sha256,request_sha256,remember_lesson) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::bigint,$7::uuid,$8,$9,$10,$11::boolean) RETURNING "+columns,
        [owner,choice.request_id,choice.run_id,choice.spec_id,choice.action,next,feedback,source,statement,choice.request_sha256,remember])).rows[0]!
      if(choice.action==="submit"){
        await db.query("DELETE FROM agentstudio.agent_feedback_bodies b USING agentstudio.agent_feedback_receipts r WHERE b.owner_user_id=$1::uuid AND r.owner_user_id=b.owner_user_id AND r.request_id=b.feedback_id AND r.run_id=$2::uuid AND r.action='submit' AND r.request_id<>$3::uuid",[owner,row.run_id,row.feedback_id])
        await db.query("INSERT INTO agentstudio.agent_feedback_bodies(owner_user_id,feedback_id,rating,tags,comment) VALUES($1::uuid,$2::uuid,$3,$4::jsonb,$5)",[owner,row.feedback_id,choice.rating,JSON.stringify(choice.tags),choice.comment])
        await this.audit(db,owner,row,"submit",{source_sha256:row.source_sha256,statement_sha256:row.statement_sha256,feedback_sha256:row.feedback_sha256,remember_lesson:remember})
        await this.tryLesson(db,owner,row,choice,task!)
      }else if(choice.action==="erase_feedback"){
        await db.query("DELETE FROM agentstudio.agent_feedback_bodies b USING agentstudio.agent_feedback_receipts r WHERE b.owner_user_id=$1::uuid AND r.owner_user_id=b.owner_user_id AND r.request_id=b.feedback_id AND r.run_id=$2::uuid AND r.action='submit'",[owner,row.run_id])
        await db.query("DELETE FROM agentstudio.agent_feedback_lessons l USING agentstudio.agent_feedback_receipts r WHERE l.owner_user_id=$1::uuid AND r.owner_user_id=l.owner_user_id AND r.request_id=l.feedback_id AND r.run_id=$2::uuid AND r.action='submit'",[owner,row.run_id])
        await this.audit(db,owner,row,"erase_feedback",{feedback_sha256:row.feedback_sha256})
      }else{
        await db.query("DELETE FROM agentstudio.agent_feedback_lessons WHERE owner_user_id=$1::uuid AND feedback_id=$2::uuid",[owner,row.feedback_id])
        await this.audit(db,owner,row,"forget_lesson",{content_sha256:choice.expected_content_sha256})
      }
      return this.receipt(db,owner,row,false)
    })
  }
  private async storeResult(db:SqlClient,owner:string,row:Receipt,decision:Decision,content:string|null){
    await db.query("INSERT INTO agentstudio.agent_feedback_lesson_results(owner_user_id,feedback_id,decision,content_sha256) VALUES($1::uuid,$2::uuid,$3,$4)",[owner,row.feedback_id,decision,content])
    await this.audit(db,owner,row,"lesson_result",{decision,content_sha256:content})
  }
  private async tryLesson(db:SqlClient,owner:string,row:Receipt,choice:Extract<AgentFeedbackChange,{action:"submit"}>,task:AgentFeedbackTask){
    // Storage and its final audit cannot undo the submitted employee statement.
    // A missing result remains unconfirmed; original replay never retries it.
    await db.query("SAVEPOINT agent_feedback_lesson_outcome")
    try{
      if(!choice.remember_lesson)await this.storeResult(db,owner,row,"not_requested",null)
      else if(!this.storingLessons)await this.storeResult(db,owner,row,"writes_disabled",null)
      else{
        await db.query("SAVEPOINT agent_feedback_lesson_storage")
        try{
          await verifyAgentFeedbackLessonSource(db,owner,task,row.source_sha256)
          const lesson=feedbackMemoryLesson(choice.rating,task.row.instruction,choice.tags,choice.comment)
          if(!lesson)throw new HttpError(409,"agent_feedback_lesson_source_unavailable")
          const hash=agentMemoryHash(lesson.fact)
          await db.query("INSERT INTO agentstudio.agent_feedback_lessons(owner_user_id,feedback_id,fact,content_sha256) VALUES($1::uuid,$2::uuid,$3,$4)",[owner,row.feedback_id,lesson.fact,hash])
          await this.storeResult(db,owner,row,"stored",hash)
          await db.query("RELEASE SAVEPOINT agent_feedback_lesson_storage")
        }catch(error){
          await db.query("ROLLBACK TO SAVEPOINT agent_feedback_lesson_storage");await db.query("RELEASE SAVEPOINT agent_feedback_lesson_storage")
          const unavailable=error instanceof HttpError&&[400,404,409].includes(error.status)
          await this.storeResult(db,owner,row,unavailable?"source_unavailable":"write_failed",null)
        }
      }
      await db.query("RELEASE SAVEPOINT agent_feedback_lesson_outcome")
    }catch{
      await db.query("ROLLBACK TO SAVEPOINT agent_feedback_lesson_outcome");await db.query("RELEASE SAVEPOINT agent_feedback_lesson_outcome")
      await db.query("SAVEPOINT agent_feedback_lesson_unconfirmed")
      try{await this.audit(db,owner,row,"lesson_unconfirmed");await db.query("RELEASE SAVEPOINT agent_feedback_lesson_unconfirmed")}
      catch{await db.query("ROLLBACK TO SAVEPOINT agent_feedback_lesson_unconfirmed");await db.query("RELEASE SAVEPOINT agent_feedback_lesson_unconfirmed")}
    }
  }
  async status(identity:Identity,runId:string){
    native(identity);if(!isUuid(runId))throw new HttpError(400,"invalid_agent_feedback_task");runId=runId.toLowerCase()
    return withActor(this.pool,identity,async(db,owner)=>{
      await required(db);await epoch(db)
      const current=await this.latest(db,owner,runId),task=await loadAgentFeedbackTask(db,owner,runId),revision=current?safeRevision(current.revision):0
      const specId=current?.spec_id??task.row.agent_spec_id
      if(!isUuid(specId))throw new HttpError(404,"agent_run_not_found")
      let body:Body|null=null,sourceCurrent=false
      if(current?.action==="submit"){
        const saved=(await db.query<Body>("SELECT rating,tags,comment FROM agentstudio.agent_feedback_bodies WHERE owner_user_id=$1::uuid AND feedback_id=$2::uuid",[owner,current.feedback_id])).rows[0]
        if(saved){const hash=(await db.query<{hash:string}>("SELECT agentstudio.agent_feedback_statement_sha256($1::uuid,$2::uuid,$3,$4,$5::jsonb,$6) AS hash",[current.spec_id,current.run_id,current.source_sha256,saved.rating,JSON.stringify(saved.tags),saved.comment])).rows[0]?.hash;if(hash===current.statement_sha256)body=saved}
        if(body&&current.remember_lesson)try{await verifyAgentFeedbackLessonSource(db,owner,task,current.source_sha256);sourceCurrent=true}catch(error){if(!(error instanceof HttpError)||![400,404,409].includes(error.status))throw error}
      }
      const rows=(await db.query<{feedback_id:string;revision:number|string;feedback_sha256:string;source_sha256:string;content_sha256:string;fact:string;created_at:string|Date}>("SELECT l.feedback_id,r.revision,r.feedback_sha256,r.source_sha256,l.content_sha256,l.fact,l.created_at FROM agentstudio.agent_feedback_lessons l JOIN agentstudio.agent_feedback_receipts r ON r.owner_user_id=l.owner_user_id AND r.request_id=l.feedback_id AND r.action='submit' JOIN agentstudio.agent_feedback_lesson_results s ON s.owner_user_id=l.owner_user_id AND s.feedback_id=l.feedback_id AND s.decision='stored' AND s.content_sha256=l.content_sha256 WHERE l.owner_user_id=$1::uuid AND r.run_id=$2::uuid ORDER BY r.revision DESC LIMIT 50",[owner,runId])).rows
      const lessons=[]
      for(const row of rows){
        const projected=body&&current?feedbackMemoryLesson(body.rating,task.row.instruction,body.tags,body.comment):null
        const available=sourceCurrent&&current?.feedback_id===row.feedback_id&&current.feedback_sha256===row.feedback_sha256&&row.source_sha256===task.source_sha256&&!!projected&&projected.fact===row.fact&&agentMemoryHash(row.fact)===row.content_sha256
        lessons.push({feedback_id:row.feedback_id,revision:safeRevision(row.revision),feedback_sha256:row.feedback_sha256,source_sha256:row.source_sha256,content_sha256:row.content_sha256,created_at:row.created_at,source_current:available,kind:"lesson" as const,fact:available?row.fact:null,tools_used:available?"":null})
      }
      const active=current?.action==="submit"?{feedback_id:current.feedback_id,revision:safeRevision(current.revision),source_sha256:current.source_sha256,statement_sha256:current.statement_sha256,feedback_sha256:current.feedback_sha256,remember_lesson:current.remember_lesson,created_at:current.created_at,body,lesson_result:await this.lessonResult(db,owner,current.feedback_id)}:null
      return {protocol,run_id:runId,spec_id:specId,revision,source:task.source_sha256&&task.row.agent_spec_id===specId?{status:task.row.status,source_sha256:task.source_sha256}:null,state:!current?"none" as const:current.action==="erase_feedback"?"erased" as const:body?"active" as const:"unconfirmed" as const,current:active,lessons,limit:50}
    })
  }
}
