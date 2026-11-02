import test from 'node:test'
import assert from 'node:assert/strict'
import {openDesktopSettings,openDesktopUpdates} from '../src/lib/desktopConnectionBridge.ts'

test('the main update entry opens the native update window without installing or requiring a computer session',async()=>{
 let opened=0
 await openDesktopUpdates({openUpdates:async()=>{opened++;return {ok:true}}})
 assert.equal(opened,1)
 await assert.rejects(openDesktopUpdates(null),/Agent Studio → 版本更新/)
 await assert.rejects(openDesktopUpdates({}),/尚不支持/)
 await assert.rejects(openDesktopUpdates({openUpdates:async()=>{throw Error('window-unavailable')}}),/window-unavailable/)
})
test('server settings use a separate fixed native action with a legacy menu fallback',async()=>{
 let opened=0;await openDesktopSettings({openSettings:async()=>{opened++;return {ok:true}}});assert.equal(opened,1)
 await assert.rejects(openDesktopSettings({}),/Agent Studio → 服务器设置/)
})
