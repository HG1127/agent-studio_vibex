export async function verifyQuality089Release({make}){
 const names=[],ok=(n,v)=>{if(!v)throw Error(n);names.push(n)},eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b)),rejects=async(n,fn)=>{let denied=false;try{await fn()}catch{denied=true}ok(n,denied)}
 for(const [name,options]of Object.entries({passed:{},failedRules:{rulesPass:false},deniedACL:{knowledge:false},badMachine:{machine:false},wrongSource:{sourceMatches:false},badVerdict:{malformedVerdict:true},badRequirement:{malformedRequirement:true}})){
  const h=make(options);let saved=false;try{await h.repo.change(h.identity,h.spec,h.publish,h.employee);saved=true}catch{}
  eq('original publish respects '+name,saved,name==='passed');eq('publish RPC call count '+name,h.counts.publish,name==='passed'?1:0)
  if(name==='passed')ok('configured rules require original Native predicate even with untested ack',h.counts.checkpoint>0&&h.counts.knowledge>0&&h.counts.qualityRun>0)
  if(name==='deniedACL')eq('ACL denial cannot be overridden by rule verdict',h.counts.qualityRun,0)
 }
 const absent=make({qualityPresent:false});await absent.repo.change(absent.identity,absent.spec,absent.publish,absent.employee);eq('default absent optional profile keeps old untested flow',absent.counts.publish,1);eq('absent profile no quality RPC',absent.counts.qualityRun+absent.counts.requirement,0)
 const missing=make({missing:true});await rejects('acceptance denied when quality missing before run admission',()=>missing.repo.change(missing.identity,missing.spec,missing.acceptance,missing.employee));eq('missing quality enqueues no Native run',missing.counts.admit,0)
 const accepted=make();await accepted.repo.change(accepted.identity,accepted.spec,accepted.acceptance,accepted.employee);eq('configured quality preserves original explicit run admission',accepted.counts.admit,1);ok('quality checked before Native admission',accepted.order.indexOf('qualityRead')<accepted.order.indexOf('admit'))
 const restored=make();await restored.repo.change(restored.identity,restored.spec,restored.restore,restored.employee);ok('restore stages full quality before original execution-spec update',restored.order.indexOf('restoreStage')>restored.order.indexOf('restorePrepare')&&restored.order.indexOf('restoreStage')<restored.order.indexOf('restoreUpdate'));ok('restore receipt remains original same transaction path',restored.order.indexOf('restoreFinish')>restored.order.indexOf('restoreUpdate'))
 const caller=make();await rejects('client cannot supply a fake quality decision',()=>caller.repo.change(caller.identity,caller.spec,{...caller.publish,requires_native_test:false},caller.employee));eq('caller quality flag produces no publish write',caller.counts.publish,0)
 return{passed:names.length,names}
}
