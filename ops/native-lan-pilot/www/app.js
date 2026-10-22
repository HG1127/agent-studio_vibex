"use strict";
// Isolated same-origin HTTPS read-only Native PG18 pilot portal.
// Never stores or logs passwords, cookies, JWTs, or database credentials.
(() => {
  const byId = id => document.getElementById(id);
  const view = {
    loading: byId("loading"), login: byId("login-panel"),
    workspace: byId("workspace"),message:byId("message"),
    submit:byId("login-submit"), email:byId("email"),password:byId("password"),
    form:byId("login-form"),name:byId("display-name"),
    userEmail:byId("identity-email"),role:byId("role-label"),
    logout:byId("logout"),refresh:byId("refresh"),results:byId("results"),
    counts:{
      agents:byId("count-agents"),workflows:byId("count-workflows"),
      kbs:byId("count-kbs")
    }
  };
  const routes={
    agents:"/api/v2/agent-specs?limit=30",
    workflows:"/api/v2/workflows?limit=30",
    kbs:"/api/v2/knowledge-bases?limit=30"
  };
  let state={profile:null,kind:"agents",lists:{agents:[],workflows:[],kbs:[]}};
  let sessionEpoch=0;
  function message(value,error=false){
    view.message.textContent=value;
    view.message.hidden=!value;
    view.message.classList.toggle("error",error);
  }
  function visible(element,show){element.hidden=!show}
  const failureMessage=(status)=>{
    if(status===401)return "会话已过期或登录信息不正确。";
    if(status===403)return "请求被权限或安全来源策略拒绝。";
    if(status===429)return "尝试次数较多，请稍后再试。";
    return "服务器尚不可用或拒绝了请求（HTTP "+status+"）。";
  };
  async function api(url,method="GET",body=null){
    // Never transmit an employee password over plain HTTP, including if
    // the form is activated programmatically on an insecure origin.
    if(location.protocol!=="https:")throw Error("https_required")
    const response=await fetch(url,{
      method,
      credentials:"same-origin",
      redirect:"error",
      referrerPolicy:"no-referrer",
      cache:"no-store",
      headers:{
        "Accept":"application/json",
        ...(method!=="GET"?{"Content-Type":"application/json","X-AgentStudio-Request":"1"}:{})
      },
      ...(body?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)throw Object.assign(new Error(failureMessage(response.status)),
      {status:response.status});
    return response.json();
  }
  function clearPrivateRecords(){
    state.lists={agents:[],workflows:[],kbs:[]};
    for(const label of Object.values(view.counts))label.textContent="—";
    view.results.replaceChildren();
  }
  function signedOut(){
    sessionEpoch++;
    state.profile=null;
    view.password.value="";
    clearPrivateRecords();
    visible(view.loading,false);
    visible(view.login,true);
    visible(view.workspace,false);
  }
  function renderList(){
    const records=state.lists[state.kind];
    view.results.replaceChildren();
    if(!Array.isArray(records)||!records.length){
      const row=document.createElement("li");
      const label=document.createElement("p");
      label.textContent="暂无个人配置数据（不代表其他员工没有数据）";
      row.append(label);view.results.append(row);return;
    }
    for(const item of records){
      const row=document.createElement("li");
      const title=document.createElement("strong");
      const detail=document.createElement("p");
      title.textContent=typeof item.name==="string"?item.name:"未命名配置";
      detail.textContent="修订版本："+String(item.revision??"—");
      row.append(title,detail);view.results.append(row);
    }
  }
  async function refresh(){
    const expectedEpoch=sessionEpoch;
    view.refresh.disabled=true;
    try{
      const loaded=await Promise.all([
        api(routes.agents),api(routes.workflows),api(routes.kbs)
      ]);
      if(expectedEpoch!==sessionEpoch)return;
      for(const [i,kind] of ["agents","workflows","kbs"].entries()){
        const data=loaded[i];
        state.lists[kind]=Array.isArray(data.items)?data.items:[];
        view.counts[kind].textContent=String(state.lists[kind].length);
      }
      renderList();message("");
    }catch(error){
      message("读取个人配置失败："+String(error.message||"连接失败"),true);
      if(expectedEpoch!==sessionEpoch)return;
      if(error.status===401)signedOut();
    }finally{view.refresh.disabled=false}
  }
  async function signedIn(profile){
    sessionEpoch++;
    clearPrivateRecords();
    state.profile=profile;
    view.name.textContent=String(profile.display_name||"员工");
    view.userEmail.textContent=String(profile.email||"");
    view.role.textContent=profile.is_admin?"管理员":"员工";
    view.password.value="";
    visible(view.loading,false);
    visible(view.login,false);
    visible(view.workspace,true);
    await refresh();
  }
  view.form.addEventListener("submit",async event=>{
    event.preventDefault();
    if(view.submit.disabled)return;
    view.submit.disabled=true;message("");
    try{
      const email=view.email.value.trim(),password=view.password.value;
      await api("/api/native-auth/login","POST",{email,password});
      const session=await api("/api/native-auth/me");
      await signedIn(session.user);
    }catch(error){
      view.password.value="";
      message(String(error.message||"登录请求失败"),true);
    }finally{view.submit.disabled=false}
  });
  view.logout.addEventListener("click",async()=>{
    view.logout.disabled=true;
    try{
      await api("/api/native-auth/logout","POST",{});
      signedOut();message("已退出登录");
    }catch(error){message("退出失败："+String(error.message||"服务器不可用"),true)}
    finally{view.logout.disabled=false}
  });
  view.refresh.addEventListener("click",refresh);
  for(const button of document.querySelectorAll(".tab")){
    button.addEventListener("click",()=>{
      for(const other of document.querySelectorAll(".tab"))
        other.classList.toggle("selected",other===button);
      state.kind=button.dataset.kind||"agents";
      renderList();
    });
  }
  if(location.protocol!=="https:"){
    visible(view.loading,false);
    message("安全保护：未建立 HTTPS 可信连接，本页面禁止员工登录。",true);
    return;
  }
  api("/api/native-auth/me")
    .then(session=>signedIn(session.user))
    .catch(error=>{
      signedOut();
      if(error.status!==401)
        message("当前未连接独立认证服务："+String(error.message||"连接失败"),true);
    });
})();
