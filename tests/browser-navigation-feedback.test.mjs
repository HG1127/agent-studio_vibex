import test from 'node:test'
import assert from 'node:assert/strict'
import {browserNavigationHint,looksLikeDefaultSite} from '../src/lib/browserNavigationFeedback.ts'

test('navigation feedback distinguishes DNS, connection, TLS, timeout and policy failures',()=>{
 assert.match(browserNavigationHint('net::ERR_NAME_NOT_RESOLVED'),/DNS \/ hosts/)
 assert.match(browserNavigationHint('net::ERR_CONNECTION_REFUSED'),/拒绝连接/)
 assert.match(browserNavigationHint('net::ERR_CERT_AUTHORITY_INVALID'),/TLS/)
 assert.match(browserNavigationHint('Navigation timeout of 20000 ms exceeded'),/超时/)
 assert.match(browserNavigationHint('blockedbyclient'),/授权或跨域/)
})
test('unknown navigation failure is never described as success and does not auto-retry',()=>{
 const message=browserNavigationHint('Target page closed')
 assert.match(message,/未能返回可核验/)
 assert.match(message,/不会自动重试/)
})
test('default hosting placeholder is distinct from a navigation failure',()=>{
 assert.equal(looksLikeDefaultSite('恭喜，站点创建成功！这是默认index.html'),true)
 assert.equal(looksLikeDefaultSite('Local computer test — 研究报告'),false)
})
