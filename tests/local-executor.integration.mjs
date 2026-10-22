import test from "node:test"
import assert from "node:assert/strict"
import * as fs from "node:fs/promises"
import fsSync from "node:fs"
import os from "node:os"
import path from "node:path"
import { createServer } from "node:http"
import { randomBytes, createHash } from "node:crypto"
import ExcelJS from "exceljs"
import { createLocalExecutor, validateLocalExecutorConfig } from "../ops/local-executor.mjs"

function makePdf(text) {
  const cleaned=text.replace(/[()\\]/g,"")
  const stream="BT /F1 14 Tf 72 740 Td ("+cleaned+") Tj ET\n"
  const objects=[
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length "+Buffer.byteLength(stream)+" >>\nstream\n"+stream+"endstream",
  ]
  let document="%PDF-1.4\n"
  const offsets=[0]
  for(let i=0;i<objects.length;i++){
    offsets.push(Buffer.byteLength(document))
    document+=(i+1)+" 0 obj\n"+objects[i]+"\nendobj\n"
  }
  const xref=Buffer.byteLength(document)
  document+="xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n"
  for(const value of offsets.slice(1))document+=String(value).padStart(10,"0")+" 00000 n \n"
  document+="trailer\n<< /Size "+(objects.length+1)+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n"
  return Buffer.from(document)
}
async function listen(server) {
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
  return "http://127.0.0.1:"+server.address().port
}
function chromeExecutable() {
  const candidates=[
    process.env.AGENT_STUDIO_LOCAL_EXECUTOR_CHROME_BIN,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES,"Google","Chrome","Application","chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"],"Microsoft","Edge","Application","msedge.exe"),
    "/tmp/agentstudio-test-bin/chrome-linux64/chrome",
  ]
  return candidates.find(candidate=>candidate&&fsSync.existsSync(candidate))
}
const hash=data=>createHash("sha256").update(data).digest("hex")

test("Real local executor: isolated Chromium, source-page PDF, actual XLSX, approval-gated export and negative access controls", {timeout:90_000},async()=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),"agentstudio-real-executor-"))
  const outside=await fs.mkdtemp(path.join(os.tmpdir(),"agentstudio-outside-"))
  const browserRequests=[]
  const secondaryRequests=[]
  let unauthorizedWrites=0,websocketUpgrades=0,approvedSubmissions=0
  let approvedName=""
  const site=createServer(async(req,res)=>{
    browserRequests.push(req.url)
    if(req.method==="POST" && req.url==="/submit"){
      let body="";for await (const chunk of req)body+=chunk.toString()
      approvedName=new URLSearchParams(body).get("name")||""
      approvedSubmissions++
      res.writeHead(303,{location:"/result?name="+encodeURIComponent(approvedName)})
      res.end();return
    }
    if(req.method==="POST"){unauthorizedWrites++;res.end("NO_SIDE_EFFECTS_ALLOWED");return}
    if(req.url==="/form"){
      res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"})
      res.end('<!doctype html><title>Registered Pilot Form</title><form method="POST" action="/submit"><input id="name" name="name"/><button id="submit" type="submit">Approve local form</button></form><script>fetch("/mutate",{method:"POST"}).catch(()=>{})</script>');return
    }
    if(req.url.startsWith("/result?")){
      res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"})
      res.end('<!doctype html><title>Registered Action Result</title><main>Approved local form: '+approvedName+'</main>');return
    }
    if(req.url==="/issuer"){
      res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"})
      res.end('<!doctype html><title>Real Issuer Fixture</title><main><h1>Issuer revenue 120</h1><p>Risk R1</p></main><img src="'+secondaryOrigin+'/pixel"/><script>document.body.insertAdjacentHTML("beforeend","<p id=dynamic>Document loaded with Chromium</p>");fetch("/mutate",{method:"POST"}).catch(()=>{});try{new WebSocket("ws://"+location.host+"/ws")}catch(e){}</script>')
    }else if(req.url==="/redirect"){
      res.writeHead(302,{location:"https://example.com/"})
      res.end()
    }else {res.writeHead(404);res.end("not-found")}
  })
  site.on("upgrade",(req,socket)=>{websocketUpgrades++;socket.destroy()})
  const origin=await listen(site)
  const secondarySite=createServer((req,res)=>{secondaryRequests.push(req.url);res.end("secondary origin")})
  const secondaryOrigin=await listen(secondarySite)
  const token=randomBytes(32).toString("hex")
  let pilot=null,writer=null,actor=null
  try {
    assert.throws(()=>validateLocalExecutorConfig({enabled:false,token,workspace,allowedOrigins:[origin]}),/local_executor_disabled/)
    assert.throws(()=>validateLocalExecutorConfig({enabled:true,token:"too-short",workspace,allowedOrigins:[origin]}),/token/)
    assert.throws(()=>validateLocalExecutorConfig({enabled:true,token,workspace,allowedOrigins:["https://example.com"]}),/loopback/)    assert.throws(()=>validateLocalExecutorConfig({enabled:true,token,workspace,allowedOrigins:[origin]}),/explicit_path_allowlist_required/)
    assert.throws(()=>validateLocalExecutorConfig({enabled:true,token,workspace,allowedOrigins:[origin],
      allowedPaths:[{origin,paths:["/*"]}]}),/invalid_allowed_path/)
    const chrome=chromeExecutable()
    assert.ok(chrome,"Set AGENT_STUDIO_LOCAL_EXECUTOR_CHROME_BIN to a real isolated Chromium/Chrome executable")
    await fs.writeFile(path.join(workspace,"issuer.pdf"),makePdf("Issuer note 7 confirms liabilities 30"))
    const wb=new ExcelJS.Workbook()
    const sheet=wb.addWorksheet("Financials")
    sheet.getCell("A2").value=120
    sheet.getCell("B4").value=30
    sheet.getCell("C1").value={formula:"A2-B4",result:90}
    await wb.xlsx.writeFile(path.join(workspace,"issuer.xlsx"))
    await fs.writeFile(path.join(outside,"private.pdf"),makePdf("Do not read"))
    let symlinkCreated=false
    try{await fs.symlink(path.join(outside,"private.pdf"),path.join(workspace,"outside.pdf"));symlinkCreated=true}catch{}
    const allowedOrigins=[origin,secondaryOrigin]
    const allowedPaths=[
      {origin,paths:["/issuer","/redirect","/form","/submit","/result"]},
      {origin:secondaryOrigin,paths:["/pixel"]},
    ]
    pilot=await createLocalExecutor({enabled:true,token,workspace,allowedOrigins,allowedPaths,chromeExecutable:chrome})
    const rpc=async(method,params,originURL=pilot.origin,auth=token)=>{
      const response=await fetch(originURL+"/mcp",{method:"POST",headers:{
        "Content-Type":"application/json",Authorization:"Bearer "+auth},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})})
      return {httpStatus:response.status,json:await response.json()}
    }
    const health=await fetch(pilot.origin+"/health")
    assert.equal(health.status,200)
    assert.equal((await rpc("tools/list",{},pilot.origin,"wrong")).httpStatus,401)
    const init=await rpc("initialize",{})
    assert.equal(init.json.result.protocolVersion,"2024-11-05")
    const listing=(await rpc("tools/list",{})).json.result.tools
    assert.deepEqual(listing.map(item=>item.name),
      ["browser_read_page","document_pdf_extract","spreadsheet_analyze"])
    assert.ok(listing.every(tool=>tool.annotations.readOnlyHint===true))

    const [browser, parallelBrowser] = await Promise.all([
      rpc("tools/call",{name:"browser_read_page",arguments:{url:origin+"/issuer"}}),
      rpc("tools/call",{name:"browser_read_page",arguments:{url:origin+"/issuer"}}),
    ])
    assert.equal(parallelBrowser.json.result.isError,false,"Concurrent real browser calls share one launched browser")
    assert.equal(browser.httpStatus,200)
    assert.equal(browser.json.result.isError,false,JSON.stringify(browser.json))
    const page=JSON.parse(browser.json.result.content[0].text)
    assert.equal(page.title,"Real Issuer Fixture")
    assert.match(page.text,/revenue 120/)
    assert.match(page.text,/Chromium/)
    assert.equal(page.final_url,origin+"/issuer")
    assert.equal(page.isolated_context,true)
    assert.equal(unauthorizedWrites,0,"Browser reading must prevent page scripts from POSTing to allowlisted origins")
    assert.equal(websocketUpgrades,0,"Browser reading must prevent WebSocket side effects even on allowlisted origins")
    assert.ok(page.blocked_requests>=1,"Read-only action must report rejected non-GET resources")
    assert.deepEqual(secondaryRequests,[],"A page cannot fetch even an allowlisted path on another origin")
    for(const bad of ["http://127.0.0.1:6/admin","file:///etc/passwd","https://example.com/","http://user:pw@127.0.0.1:5/"]){
      const response=await rpc("tools/call",{name:"browser_read_page",arguments:{url:bad}})
      assert.equal(response.json.result.isError,true,bad)
    }
    const redirected=await rpc("tools/call",{name:"browser_read_page",arguments:{url:origin+"/redirect"}})
    assert.equal(redirected.json.result.isError,true,"Cross-origin redirect must be blocked")
    assert.ok(browserRequests.includes("/issuer"))
    assert.ok(browserRequests.includes("/redirect"))

    const doc=await rpc("tools/call",{name:"document_pdf_extract",arguments:{input_path:"issuer.pdf"}})
    assert.equal(doc.json.result.isError,false,JSON.stringify(doc.json))
    const parsed=JSON.parse(doc.json.result.content[0].text)
    assert.equal(parsed.total_pages,1)
    assert.equal(parsed.pages[0].page,1)
    assert.match(parsed.pages[0].text,/liabilities 30/)
    assert.equal(parsed.source_sha256,hash(await fs.readFile(path.join(workspace,"issuer.pdf"))))
    for(const bad of ["../private.pdf","C:\\Users\\Documents\\secrets.pdf","/etc/passwd.pdf","outside/../../private.pdf",...(symlinkCreated?["outside.pdf"]:[])]){
      const response=await rpc("tools/call",{name:"document_pdf_extract",arguments:{input_path:bad}})
      assert.equal(response.json.result.isError,true,"File isolation: "+bad)
    }
    const pdfPages=await rpc("tools/call",{name:"document_pdf_extract",arguments:{input_path:"issuer.pdf",pages:[2]}})
    assert.equal(pdfPages.json.result.isError,true,"Nonexistent page should be rejected")

    const sheetAnalysis=await rpc("tools/call",{name:"spreadsheet_analyze",arguments:{
      input_path:"issuer.xlsx",sheet:"Financials",left_cell:"A2",right_cell:"B4",
    }})
    assert.equal(sheetAnalysis.json.result.isError,false,JSON.stringify(sheetAnalysis.json))
    const calculation=JSON.parse(sheetAnalysis.json.result.content[0].text)
    assert.equal(calculation.result,90)
    assert.equal(calculation.provenance,"real_xlsx_numeric_cells")
    assert.deepEqual(calculation.cells,[{ref:"A2",value:120},{ref:"B4",value:30}])
    assert.equal(calculation.source_sha256,hash(await fs.readFile(path.join(workspace,"issuer.xlsx"))))
    const formula=await rpc("tools/call",{name:"spreadsheet_analyze",arguments:{
      input_path:"issuer.xlsx",sheet:"Financials",left_cell:"C1",right_cell:"B4",
    }})
    assert.equal(formula.json.result.isError,true,"A cached formula result must not be misrepresented as verified calculation")
    assert.match(formula.json.result.content[0].text,/non_numeric_spreadsheet_cell/)

    const defaultWrite=await rpc("tools/call",{name:"spreadsheet_export_report",arguments:{
      output_name:"results.xlsx",title:"Verified",rows:[{label:"net",value:90}],
    }})
    assert.equal(defaultWrite.httpStatus,400,"Read-only bridge does not offer write capability")
    assert.deepEqual(await fs.readdir(workspace),["issuer.pdf","issuer.xlsx",...(symlinkCreated?["outside.pdf"]:[])].sort())

    // Registered browser actions are a separate, explicitly authorized
    // write surface. The model supplies values only, never selectors or URLs.
    const registeredActions=[{id:"submit_local_test",url:origin+"/form",steps:[
      {kind:"fill",selector:"#name",arg_key:"name"},
      {kind:"click",selector:"#submit"},
    ],write_paths:["/submit"]}]
    assert.throws(()=>validateLocalExecutorConfig({
      enabled:true,token,workspace,allowedOrigins:[origin],allowedPaths:[{origin,paths:["/issuer","/redirect","/form","/submit","/result"]}],registeredActions,
    }),/browser_actions_not_enabled/)
    assert.throws(()=>validateLocalExecutorConfig({
      enabled:true,token,workspace,allowedOrigins:[origin],allowedPaths:[{origin,paths:["/issuer","/redirect","/form","/submit","/result"]}],enableBrowserActions:true,
      registeredActions:[{...registeredActions[0],url:"http://127.0.0.1:9/form"}],
    }),/origin_not_authorized/)
    actor=await createLocalExecutor({
      enabled:true,token,workspace,allowedOrigins:[origin],allowedPaths:[{origin,paths:["/issuer","/redirect","/form","/submit","/result"]}],chromeExecutable:chrome,
      enableBrowserActions:true,registeredActions,
    })
    const allowedTools=(await rpc("tools/list",{},actor.origin)).json.result.tools
    assert.equal(allowedTools.some(tool=>tool.name==="spreadsheet_export_report"),false)
    const browserAction=allowedTools.find(tool=>tool.name==="browser_registered_action")
    assert.equal(browserAction.annotations.readOnlyHint,false)
    assert.equal(browserAction.annotations.destructiveHint,true)
    const actionCall=(input)=>rpc("tools/call",{name:"browser_registered_action",arguments:input},actor.origin)
    const unknownAction=await actionCall({action_id:"arbitrary_not_registered",arguments:{name:"bad"}})
    assert.equal(unknownAction.json.result.isError,true)
    const badArguments=await actionCall({action_id:"submit_local_test",arguments:{name:"valid",url:"https://example.com"}})
    assert.equal(badArguments.json.result.isError,true)
    const actionResult=await actionCall({action_id:"submit_local_test",arguments:{name:"approved"}})
    assert.equal(actionResult.json.result.isError,false,JSON.stringify(actionResult.json))
    const action=JSON.parse(actionResult.json.result.content[0].text)
    assert.equal(action.action_id,"submit_local_test")
    assert.equal(action.steps_completed,2)
    assert.match(action.text,/Approved local form: approved/)
    assert.equal(action.final_url,origin+"/result?name=approved")
    assert.equal(action.write_possible,true)
    assert.equal(approvedSubmissions,1,"Exactly one operator-approved form submission")
    assert.equal(unauthorizedWrites,0,"Unregistered browser POST attempts are still blocked")

    writer=await createLocalExecutor({enabled:true,token,workspace,allowedOrigins:[origin],
      allowedPaths:[{origin,paths:["/issuer","/redirect","/form","/submit","/result"]}],
      chromeExecutable:chrome,enableWrites:true})
    const exportCall=(data)=>rpc("tools/call",{name:"spreadsheet_export_report",arguments:data},writer.origin)
    const exportResult=await exportCall({output_name:"results.xlsx",title:"Verified Investor Snapshot",rows:[
      {label:"revenue",value:120},{label:"liabilities",value:30},{label:"net",value:90},
    ]})
    assert.equal(exportResult.json.result.isError,false,JSON.stringify(exportResult.json))
    const artifact=JSON.parse(exportResult.json.result.content[0].text)
    assert.equal(artifact.output_path,"artifacts/results.xlsx")
    const bytes=await fs.readFile(path.join(workspace,"artifacts","results.xlsx"))
    assert.equal(artifact.sha256,hash(bytes))
    const reopened=new ExcelJS.Workbook()
    await reopened.xlsx.load(bytes)
    assert.equal(reopened.getWorksheet("Verified Report").getCell("B4").value,90)
    const duplicated=await exportCall({output_name:"results.xlsx",title:"Try overwriting",rows:[{label:"net",value:-1}]})
    assert.equal(duplicated.json.result.isError,true)
    assert.match(duplicated.json.result.content[0].text,/report_already_exists/)
    const badName=await exportCall({output_name:"../escape.xlsx",title:"Bad",rows:[{label:"net",value:90}]})
    assert.equal(badName.json.result.isError,true)
    assert.equal(hash(await fs.readFile(path.join(workspace,"artifacts","results.xlsx"))),artifact.sha256)
    assert.ok(writer.audit.some(item=>item.tool==="spreadsheet_export_report"&&item.success))
    assert.ok(writer.audit.some(item=>item.tool==="spreadsheet_export_report"&&!item.success))
    assert.equal(JSON.stringify(writer.audit).includes(token),false)
  }finally{
    if(writer)await writer.close()
    if(actor)await actor.close()
    if(pilot)await pilot.close()
    await new Promise(resolve=>site.close(resolve))
    await new Promise(resolve=>secondarySite.close(resolve))
    await fs.rm(workspace,{recursive:true,force:true})
    await fs.rm(outside,{recursive:true,force:true})
  }
})
