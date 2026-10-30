// A retained editor context is usable only in its original bound lifetime.
// Inactivity may keep that context privately; an active missing record cannot.
export type NativeJourneyAgentCache<T>={binding:object;agent:T}|null
export function resolveNativeJourneyAgentCache<T>(previous:NativeJourneyAgentCache<T>,binding:object|undefined,active:boolean,view:{active:boolean;agent:T|null}){
 if(!binding)return {cache:null,agent:null}
 let cache=previous?.binding===binding?previous:null
 if(active&&view.active)cache=view.agent?{binding,agent:view.agent}:null
 else if(view.agent)cache={binding,agent:view.agent}
 // On the first render back, wait for this controller's active snapshot.
 // Never display the private inactive cache as an already refreshed record.
 return {cache,agent:active&&!view.active?null:cache?.agent??null}
}
