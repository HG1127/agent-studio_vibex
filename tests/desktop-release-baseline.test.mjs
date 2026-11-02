import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {execFileSync} from 'node:child_process'
import {verifyDesktopReleaseBaseline} from '../ops/verify-desktop-release-baseline.mjs'
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'desktop-baseline-'))
 assert.ok(root.startsWith(path.resolve(os.tmpdir())+path.sep))
 t.after(()=>fs.rm(root,{recursive:true,force:true}))
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:'pipe',windowsHide:true}).trim()
 git('init');git('config','user.name','Baseline Test');git('config','user.email','baseline@example.invalid');git('config','commit.gpgsign','false')
 await fs.writeFile(path.join(root,'seed'),'seed');git('add','.');git('commit','-m','seed');const ancestor=git('rev-parse','HEAD')
 await fs.mkdir(path.join(root,'desktop'))
 const write=async(file,data)=>fs.writeFile(path.join(root,file),JSON.stringify(data))
 const baseline={minimumDesktopVersion:'0.1.0-preview.12',branch:'codex/desktop-release',requiredAncestors:[ancestor],requiredFiles:['desktop/build-info.json']}
 await write('desktop/release-baseline.json',baseline);await write('desktop/build-info.json',{version:'0.1.0-preview.12'});await write('desktop/package.json',{version:'0.1.0-preview.12'});git('add','.');git('commit','-m','release')
 return {root,git,write,baseline,ancestor}
}
test('desktop release accepts a real Git ancestor and matching unified versions',async t=>{
 const f=await fixture(t);assert.equal((await verifyDesktopReleaseBaseline(f.root)).status,'PASS')
})
test('desktop release refuses a baseline commit from an unmerged branch',async t=>{
 const f=await fixture(t),release=f.git('rev-parse','HEAD');f.git('checkout','--detach',f.ancestor);await fs.writeFile(path.join(f.root,'other'),'unmerged');f.git('add','.');f.git('commit','-m','other');const other=f.git('rev-parse','HEAD');f.git('checkout','--detach',release)
 await f.write('desktop/release-baseline.json',{...f.baseline,requiredAncestors:[other]});await assert.rejects(verifyDesktopReleaseBaseline(f.root),/缺少提交/)
})
test('desktop release refuses a version rollback or mismatched package version',async t=>{
 const f=await fixture(t);await f.write('desktop/build-info.json',{version:'0.1.0-preview.11'});await assert.rejects(verifyDesktopReleaseBaseline(f.root),/版本/)
 await f.write('desktop/package.json',{version:'0.1.0-preview.11'});await assert.rejects(verifyDesktopReleaseBaseline(f.root),/版本/)
})
