// Pure extracted parser functions and DATA only; no runtime/Pool/driver/SQL.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {isUtf8} from 'node:buffer'
import ts from 'typescript'
const sha=b=>createHash('sha256').update(b).digest('hex'),fixtureBytes=fs.readFileSync(new URL('./fixtures/pg18-runtime-json-pre-scan.txt',import.meta.url),'utf8'),fixture=JSON.parse(fixtureBytes)
function declaration(text,name){const t=ts.createSourceFile('runtime.mjs',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(t.parseDiagnostics.length,0);const n=t.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(n,name);return n.getText(t)}
function tokens(text){const scanner=ts.createScanner(ts.ScriptTarget.Latest,true,ts.LanguageVariant.Standard,text),result=[];while(scanner.scan()!==ts.SyntaxKind.EndOfFileToken)result.push(scanner.getTokenText());return JSON.stringify(result)}
function extract(text){const sentinel=Object.freeze({refused:true}),chunks=['assertUtf8Bytes','utf8','json'].map(n=>declaration(text,n)),parse=Function('isUtf8','fail',chunks.join('\n')+';return json')(isUtf8,()=>{throw sentinel});return {parse,sentinel}}
function result(api,raw){try{return {ok:true,value:api.parse(raw)}}catch(error){if(error!==api.sentinel)throw error;return {ok:false}}}
for(const path of ['worker-heartbeat-activation-control-runtime.mjs','pg18-complete-operator-runtime.mjs']){
 const p={path},newText=fs.readFileSync(new URL('../src/'+path,import.meta.url),'utf8'),old=extract(fixture[path]),next=extract(newText),same=raw=>assert.deepEqual(result(next,raw),result(old,raw))
 test(p.path+': original pre-change parser reference remains pinned',()=>{assert.equal(sha(fixtureBytes),'fe8be661de4361d8062056c1fb3c5ac74878c3e6a98003c840de4b45f34901b8');for(const name of ['assertUtf8Bytes','utf8'])assert.equal(declaration(newText,name),declaration(fixture[path],name))})
 test(p.path+': all UTF16 code units retain exact accepted whitespace set',()=>{
  for(let code=0;code<=0xffff;code++){
   const char=String.fromCharCode(code),raw=char+'[1]'+char
   same(raw)
   // A quote makes this a complete string literal "[1]", not whitespace.
   if(code!==34)assert.equal(result(next,raw).ok,[9,10,13,32].includes(code))
  }
 })
 test(p.path+': number grammar, cursor, safe integer and minus zero retained',()=>{
  for(const sign of ['', '-','+'])for(const integer of ['0','00','01','1','12','9007199254740991','9007199254740992','-1',''])for(const decimal of ['','.0','.1','.','..0'])for(const exponent of ['','e0','E+1','e-1','e','e+','e309','e-999'])for(const tail of ['',',2',',true',',false',',null',',{}',',[]'])same('['+sign+integer+decimal+exponent+tail+']')
  for(const raw of ['-0','-0.0','0e-1','1e-1','1.0','9007199254740991','9007199254740992','-9007199254740991','-9007199254740992','1e309','1e-999','-1e-999'])same(raw)
 })
 test(p.path+': literals, duplicates, forbidden keys, trailing tokens and controls retained',()=>{
  const words=['true','false','null','True','FALSE','Null','tru','falsee','nullx','undefined','NaN','Infinity','',',',':','{}','[]','""','"\\u0000"','"\\ud800"']
  for(const word of words)for(const lead of ['',' ','\r\n\t'])for(const tail of ['',' ',']','{}','true'])same(lead+word+tail)
  for(const key of ['__proto__','constructor','prototype','ordinary','toString']){
   same('{"'+key+'":1}');same('{"'+key+'":1,"'+key+'":2}')
  }
  for(const raw of ['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{"x":[1,true,false,null,{},[]]}','{"x":"a\\\"b\\\\c"}','[1,]','{"x":1,}','[01]','[1 true]','[nullfalse]'])same(raw)
  const parsed=next.parse('{"a":1}');assert.deepEqual(Object.getOwnPropertyDescriptor(parsed,'a'),{value:1,enumerable:true,configurable:false,writable:false})
 })
 test(p.path+': original depth, node and 2MiB byte limits retained',()=>{
  for(const n of [31,32,33,34])same('['.repeat(n)+'0'+']'.repeat(n))
  for(const n of [32766,32767,32768])same('['+'0,'.repeat(n-1)+'0]')
  for(const n of [2*1024*1024-2,2*1024*1024-1,2*1024*1024])same('"'+'a'.repeat(n)+'"')
 })
 test(p.path+': byte decoding, unpaired surrogates, BOM and NUL retain refusal',()=>{
  for(let b=0;b<256;b++)same(Buffer.from([b]))
  for(const bytes of [[0xc0,0xaf],[0xed,0xa0,0x80],[0xf4,0x90,0x80,0x80],[0xef,0xbb,0xbf,0x31],[0x22,0,0x22],[0xe2,0x82,0xac],[0x22,0xe2,0x82,0xac,0x22]])same(Buffer.from(bytes))
  for(const raw of [undefined,null,1,true,{},new Uint8Array([91,49,93]),'"\ud800"','"\udfff"','"é"','"🙂"'])same(raw)
 })
 test(p.path+': escape parity, escaped delimiters and malformed strings retained',()=>{
  for(let n=0;n<18;n++)for(const suffix of ['','x','"','\\','\\"','\\u0022','\\u005c','\\ud800','\\u0000','\n','\t']){
   const value='"'+'x'.repeat(n)+'\\'.repeat(n)+suffix+'"'
   for(const raw of [value,'['+value+']','{"key":'+value+'}',value+' true',value.slice(0,-1)])same(raw)
  }
  for(const raw of ['"\\"','"\\\\"','"\\\\\\"','"a"b"','"a\\"b"','"a\\\\"b"','"\\u12"','"\\uZZZZ"','"\\x20"','"\\v"'])same(raw)
 })
 test(p.path+': deterministic nested JSON corpus has identical values and descriptors',()=>{
  let seed=0x146;const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n},make=depth=>{if(depth>4)return rand(10000);switch(rand(6)){case 0:return null;case 1:return rand(2)===0;case 2:return rand(100000)-50000;case 3:return ['x','a b','é','🙂','\t\n"\\'][rand(5)];case 4:return Array.from({length:rand(6)},()=>make(depth+1));default:return Object.fromEntries(Array.from({length:rand(6)},(_,i)=>['k'+i,make(depth+1)]))}}
  for(let i=0;i<1200;i++){const raw=JSON.stringify(make(0),null,i%2?2:0);same(raw);if(raw.length>1)same(raw.slice(0,rand(raw.length)))}
 })
}
