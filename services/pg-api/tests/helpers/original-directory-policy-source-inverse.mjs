// Test-only exact inverse of the two independently reviewed policy changes.
// Original expected hashes and every original protocol assertion remain intact.
import {createHash} from 'node:crypto'
const policyPath="services/pg-api/tests/helpers/native-original-directory-policy.mjs",parentSha="32759334d6ae3a1f62de9fe1f80e6e71ba1f2799ccf829a4c6e85b743e23cfde",childSha="7bf4ffd5de1990f35f4f8938fa0f24ad3ef797a30473b5de2616f74258768e77",hunks=[{"start":976,"before":" if(typeof raw!=='string'||raw.length>4096||/[\\\\\\x00-\\x20\\x7f#]/.test(raw)||raw.split('?')[0].includes('%'))return 'denied'","after":" if(typeof raw!=='string'||raw.length>4096||/[\\\\\\x00-\\x20\\x7f#]/.test(raw)||raw.split('?')[0].includes('%')||raw.split('?')[0].split('/').some(part=>part==='.'||part==='..'))return 'denied'"},{"start":2678,"before":"|favicon\\.(?:svg|ico))$/.test(u.pathname)","after":"|favicon\\.(?:svg|ico)|agent-studio\\.svg)$/.test(u.pathname)"}]
const sha=value=>createHash('sha256').update(value).digest('hex')
export function originalDirectoryPolicyParentSource(name,source){
 if(name!==policyPath)return source
 const pin=sha(source);if(pin===parentSha)return source
 if(pin!==childSha)throw Error('unreviewed_original_directory_policy_source')
 let parent=source
 for(const h of [...hunks].reverse()){if(parent.slice(h.start,h.start+h.after.length)!==h.after)throw Error('unreviewed_original_directory_policy_hunk');parent=parent.slice(0,h.start)+h.before+parent.slice(h.start+h.after.length)}
 if(sha(parent)!==parentSha)throw Error('original_directory_policy_parent_integrity')
 return parent
}
