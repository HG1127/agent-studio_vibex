const byId=id=>document.getElementById(id)
let busy=false,current
function render(state){current=state;byId('current').textContent='当前版本 '+state.currentVersion;byId('status').textContent=state.message;byId('notes').textContent=state.notes||'';byId('progress').value=state.progress||0;byId('progress').hidden=state.phase!=='downloading';byId('check').disabled=busy||['checking','downloading'].includes(state.phase);byId('save').disabled=byId('check').disabled;byId('download').hidden=state.phase!=='available';byId('download').disabled=busy;byId('install').hidden=state.phase!=='ready';byId('install').disabled=busy;if(state.feed)byId('feed').value=state.feed}
async function request(action,input){busy=true;if(current)render(current);try{render(await window.desktopUpdates.request(action,input))}catch(error){byId('status').textContent=error.message.replace(/^Error invoking remote method '[^']+': Error: /,'')}finally{busy=false;if(current){byId('check').disabled=['checking','downloading'].includes(current.phase);byId('save').disabled=byId('check').disabled;byId('download').disabled=false;byId('install').disabled=false}}}
window.desktopUpdates.onState(render)
byId('check').onclick=()=>request('check');byId('download').onclick=()=>request('download');byId('install').onclick=()=>request('install');byId('save').onclick=()=>request('feed',byId('feed').value)
void request('state')
