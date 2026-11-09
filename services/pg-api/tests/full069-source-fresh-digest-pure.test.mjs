// Source/AST and closed DATA only. Never import or start an application module.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {createHash,hash as digestBytes} from 'node:crypto'
import ts from 'typescript'

const names=['pg18-full069-worker-live-sources.mjs','pg18-complete-companion-sources.mjs','pg18-complete-plan-workflow-sources.mjs','pg18-full069-final-sources.mjs']
function helper(name,hooks={}){
 const source=fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8'),tree=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),expressions=[]
 assert.equal(tree.parseDiagnostics.length,0)
 const visit=node=>{if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='sha')expressions.push(node.initializer.getText(tree));ts.forEachChild(node,visit)};visit(tree);assert.equal(expressions.length,1)
 return vm.runInNewContext('('+expressions[0]+')',{Buffer,createHash,digestBytes,...hooks},{timeout:1000})
}
const old=value=>createHash('sha256').update(value).digest('hex')
function outcome(fn,value){try{return {ok:true,value:fn(value)}}catch(error){return {ok:false,errorClass:error.constructor.name,errorCode:Object.getOwnPropertyDescriptor(error,'code')?.value??null}}}

test('source digests retain full-buffer and primitive-string results',()=>{
 const allBytes=Buffer.from(Array.from({length:256},(_,i)=>i)),parent=Buffer.concat([Buffer.from('prefix'),allBytes,Buffer.from('suffix')]),values=[Buffer.alloc(0),allBytes,parent.subarray(6,262),'','员工审批 😀',String.fromCharCode(0,0xd800,0xdc00,0xdfff),JSON.stringify({sources:[{path:'shared/example.ts',sha256:'a'.repeat(64)}]})]
 for(const name of names){const sha=helper(name);for(const value of values)assert.equal(sha(value),old(value),name)}
})
test('each digest invocation observes mutations at every byte and every manifest change',()=>{
 for(const name of names){const sha=helper(name),value=Buffer.alloc(513,0x61),initial=sha(value);assert.equal(initial,old(value));for(let offset=0;offset<value.length;offset++){value[offset]^=0xff;assert.equal(sha(value),old(value));assert.notEqual(sha(value),initial);value[offset]^=0xff}assert.equal(sha(value),initial);const manifest={sources:[{path:'shared/example.ts',sha256:'a'.repeat(64)}]};let before=sha(JSON.stringify(manifest));manifest.sources[0].sha256='b'.repeat(64);assert.notEqual(sha(JSON.stringify(manifest)),before);assert.equal(sha(JSON.stringify(manifest)),old(JSON.stringify(manifest)))}
})
test('one-shot paths consume the original complete input on every call',()=>{
 for(const name of names){const seen=[],allocations=[],sha=helper(name,{digestBytes:(...args)=>{seen.push(args);return digestBytes(...args)},createHash:(...args)=>{allocations.push(args);return createHash(...args)}}),buffer=Buffer.from('fresh bytes'),string='fresh 员工 😀';for(let i=0;i<3;i++){assert.equal(sha(buffer),old(buffer));assert.equal(sha(string),old(string));buffer[i]^=1}assert.equal(allocations.length,0);assert.equal(seen.length,6);for(let i=0;i<seen.length;i++){assert.equal(seen[i][0],'sha256');assert.equal(seen[i][1],i%2?string:buffer);assert.equal(seen[i][2],'hex')}}
})
test('non-fast-path data and invalid input keep the streaming result and error class/code',()=>{
 const bytes=new Uint8Array([0,1,127,128,255]),values=[bytes,new Uint16Array([0,256,65535]),new DataView(bytes.buffer,1,3),null,undefined,1,true,{},[],Symbol('closed'),()=>{},new String('closed'),new ArrayBuffer(4),new Proxy(Buffer.from('x'),{})]
 for(const name of names){const sha=helper(name);for(const value of values)assert.deepEqual(outcome(sha,value),outcome(old,value),name)}
})
test('native and fallback failures propagate the same object without retry',()=>{
 for(const name of names){const sentinel=Object.freeze({closed:'digest failure'});let native=0,fallback=0;const sha=helper(name,{digestBytes:()=>{native++;throw sentinel},createHash:()=>{fallback++;throw sentinel}});for(const value of [Buffer.from('closed'),'closed',new Uint8Array([1]),null]){let caught;try{sha(value)}catch(error){caught=error}assert.equal(caught,sentinel)}assert.equal(native,2);assert.equal(fallback,2)}
})
