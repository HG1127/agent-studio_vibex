const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events')
test('managed permission reviews accept only a matching private IPC reply and default to denial on cancellation',async()=>{
 const {confirmManaged}=await import('../../local-executor/managed-confirmation.mjs')
 const previous=process.env.STUDIO_LOCAL_EMBEDDED;process.env.STUDIO_LOCAL_EMBEDDED='1'
 try{
  const channel=new EventEmitter();channel.connected=true;const sent=[];channel.send=(m,callback)=>{sent.push(m);callback?.()}
  const pending=confirmManaged({message:'Isolated test permission review'},undefined,{channel,timeoutMs:5000})
  assert.equal(sent[0].type,'studio-review');let resolved=false;void pending.then(()=>resolved=true)
  channel.emit('message',{type:'studio-review-result',requestId:'forged',ok:true});await Promise.resolve();assert.equal(resolved,false)
  channel.emit('message',{type:'studio-review-result',requestId:sent[0].requestId,ok:true});assert.equal(await pending,true);assert.equal(channel.listenerCount('message'),0)
  const abort=new AbortController(),cancelled=confirmManaged({message:'Must cancel'},abort.signal,{channel,timeoutMs:5000});abort.abort();await assert.rejects(cancelled,{name:'AbortError'})
  assert.equal(channel.listenerCount('message'),0)
  const timeout=confirmManaged({message:'Must timeout'},undefined,{channel,timeoutMs:15});await assert.rejects(timeout,/timeout/)
 }finally{if(previous===undefined)delete process.env.STUDIO_LOCAL_EMBEDDED;else process.env.STUDIO_LOCAL_EMBEDDED=previous}
})
