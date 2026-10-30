import type {Identity} from './contracts.ts'
import {HttpError} from './contracts.ts'
import type {ModelConnectionRepository} from './model-connection-repository.ts'
import {withActor} from './repository.ts'
import {assertOriginalUiEmployee} from './native-original-ui-preconditions.ts'
import {inspectOptionalModelConfigReceipt075,verifyModelConfigReceiptSchema075} from './model-config-receipt-schema075.ts'
import {submitModelConfigOnActor,readModelConfigReceiptOnActor} from './model-config-receipt-ledger.ts'
import {modelConfigReceiptProtocol} from '../../../shared/model-config-receipt-contract.ts'
const installedPermits=new WeakSet<object>()
class ModelConfigReceiptComponent{
 readonly protocol=modelConfigReceiptProtocol
 readonly writes:boolean
 private readonly models:ModelConnectionRepository
 constructor(models:ModelConnectionRepository,permit:object,writes:boolean){if(!installedPermits.has(permit))throw Error('model_config_receipt075_audited_installation_required');this.models=models;this.writes=writes}
 submit(identity:Identity,raw:unknown,expected:string){if(!this.writes)throw new HttpError(405,'model_config_receipt_writes_disabled');return withActor(this.models.pool,identity,async(db,actor)=>{assertOriginalUiEmployee(actor,expected);await verifyModelConfigReceiptSchema075(db);return submitModelConfigOnActor(db,actor,this.models,raw,expected)})}
 get(identity:Identity,requestId:string,expected:string){return withActor(this.models.pool,identity,async(db,actor)=>{assertOriginalUiEmployee(actor,expected);await verifyModelConfigReceiptSchema075(db);return readModelConfigReceiptOnActor(db,actor,this.models,requestId,expected)})}
}
/** No installation, schema writes or provider activity. Disabled by default;
 * an installed/audited075 remains queryable when fresh writes are switched off. */
export async function prepareModelConfigReceipts075(options:{models:ModelConnectionRepository;configurationWrites:boolean;env:NodeJS.ProcessEnv}){
 const flag=options.env.AGENT_STUDIO_PG18_MODEL_CONFIG_RECEIPTS_ENABLED;if(flag!==undefined&&flag!=='false'&&flag!=='true')throw Error('invalid_model_config_receipt075_flag')
 const state=await inspectOptionalModelConfigReceipt075(options.models.pool)
 if(state==='absent'){if(flag==='true')throw Error('model_config_receipt075_installation_required');return null}
 const permit={};installedPermits.add(permit);return new ModelConfigReceiptComponent(options.models,permit,options.configurationWrites===true&&flag==='true')
}
export type PreparedModelConfigReceipts075=NonNullable<Awaited<ReturnType<typeof prepareModelConfigReceipts075>>>
