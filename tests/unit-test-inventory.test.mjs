import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {EventEmitter} from 'node:events'
import {discoverUnitTests,runUnitTests} from '../ops/run-unit-tests.mjs'
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-unit-inventory-'));await fs.mkdir(path.join(root,'tests'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root}
test('new root unit tests automatically enter the default inventory',async t=>{const root=await fixture(t);await fs.writeFile(path.join(root,'tests/new-regression.test.mjs'),'');await fs.writeFile(path.join(root,'tests/real-browser.integration.mjs'),'');assert.deepEqual(await discoverUnitTests(root),['tests/new-regression.test.mjs']);await fs.writeFile(path.join(root,'tests/another.test.mjs'),'');assert.equal((await discoverUnitTests(root)).length,2)})
test('a failed batch cannot become a green full-suite result; remaining batches still execute',async t=>{const root=await fixture(t);for(const name of ['a','b','c'])await fs.writeFile(path.join(root,'tests',name+'.test.mjs'),'');let started=0;const report=await runUnitTests(root,{batchSize:1,write:()=>{},spawnChild:(exe,args,options)=>{assert.equal(options.shell,false);assert.equal(args.length,3);const child=new EventEmitter();child.kill=()=>{};const code=++started===2?1:0;queueMicrotask(()=>child.emit('close',code,null));return child}});assert.equal(started,3);assert.equal(report.status,'FAIL');assert.equal(report.failures.length,1)})
test('the runner refuses an empty inventory and notices tests added mid-run',async t=>{const root=await fixture(t);await assert.rejects(discoverUnitTests(root),/inventory_empty/);await fs.writeFile(path.join(root,'tests/a.test.mjs'),'');const report=await runUnitTests(root,{write:()=>{},spawnChild:()=>{const child=new EventEmitter();child.kill=()=>{};void fs.writeFile(path.join(root,'tests/new.test.mjs'),'').then(()=>child.emit('close',0,null));return child}});assert.equal(report.status,'FAIL');assert.equal(report.inventoryChanged,true)})
