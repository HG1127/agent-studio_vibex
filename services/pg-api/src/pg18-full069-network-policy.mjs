import {createHash} from 'node:crypto'

// iptables-save chain counters describe traffic, not packet policy. Normalize
// only this exact declaration field; preserve every other byte and line order.
const chain=/^(:[A-Za-z0-9_-]+ (?:ACCEPT|DROP|-) )\[(?:0|[1-9][0-9]*):(?:0|[1-9][0-9]*)\]$/
export function full069NetworkPolicyDigest(snapshot){
 if(typeof snapshot!=='string'||Buffer.byteLength(snapshot)>2097152||snapshot.includes('\0'))throw Error('full069_network_policy_snapshot_refused')
 const policy=snapshot.split('\n').map(line=>line.replace(chain,'$1[0:0]')).join('\n')
 return createHash('sha256').update(policy).digest('hex')
}
