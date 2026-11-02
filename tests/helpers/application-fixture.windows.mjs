import fs from 'node:fs/promises'
import path from 'node:path'
import {execFile,spawn} from 'node:child_process'
import {promisify} from 'node:util'
export async function createApplicationFixture(base,{autoStart=true,startupDelayMs=0}={}){
 if(!Number.isInteger(startupDelayMs)||startupDelayMs<0||startupDelayMs>10000)throw Error('invalid_fixture_delay')
 await fs.mkdir(base,{recursive:true});const run=await fs.mkdtemp(path.join(base,'run-')),exe=path.join(run,'ApplicationFixture.exe'),receipt=path.join(run,'receipt.txt')
const code=String.raw`using System;using System.IO;using System.Windows.Forms;using System.Drawing;
public class ApplicationFixture { [STAThread] public static void Main(string[] args){Application.EnableVisualStyles();File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"fixture.pid"),System.Diagnostics.Process.GetCurrentProcess().Id.ToString());var f=new Form();f.Text="Application acceptance fixture";f.Size=new Size(620,420);f.StartPosition=FormStartPosition.CenterScreen;
var input=new TextBox();input.Name="fixture-editor";input.AccessibleName="Fixture editor";input.Location=new Point(30,40);input.Width=500;f.Controls.Add(input);
var button=new Button();button.Text="Save test receipt";button.AccessibleName="Save test receipt";button.Location=new Point(30,100);button.Width=200;int count=0;button.Click+=(s,e)=>{count++;File.WriteAllText(args.Length>0?args[0]:Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"receipt.txt"),input.Text+"\n"+count);};f.Controls.Add(button);
var password=new TextBox();password.UseSystemPasswordChar=true;password.AccessibleName="Protected field";password.Location=new Point(30,160);f.Controls.Add(password);Application.Run(f);}}
`
const script=String.raw`$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Windows.Forms,System.Drawing;$code=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:STUDIO_FIXTURE_CODE));Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms,System.Drawing -OutputAssembly $env:STUDIO_FIXTURE_EXE -OutputType WindowsApplication`
const ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe')
await promisify(execFile)(ps,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,env:{...process.env,STUDIO_FIXTURE_CODE:Buffer.from(code.replace('Application.EnableVisualStyles();','System.Threading.Thread.Sleep('+startupDelayMs+');Application.EnableVisualStyles();')).toString('base64'),STUDIO_FIXTURE_EXE:exe},timeout:30000})
const children=[];
const launch=(file,args,options)=>{if(file!==exe)throw Error('unexpected_fixture_executable');const c=spawn(file,args,options);children.push(c);return c}
const child=autoStart?launch(exe,[receipt],{shell:false,windowsHide:false,stdio:'ignore'}):null;
const cleanupScript=String.raw`$p=Get-Process -Id ([int]$env:STUDIO_FIXTURE_PID) -ErrorAction SilentlyContinue;if($p -and $p.MainModule.FileName -eq $env:STUDIO_FIXTURE_EXE){Stop-Process -Id $p.Id -Force}`;
return {run,exe,receipt,child,launch,close:async()=>{for(const c of children){if(c.exitCode!==null||c.signalCode!==null)continue;c.ref();c.kill();await new Promise(r=>{if(c.exitCode!==null||c.signalCode!==null)r();else c.once('exit',r)})}const pid=await fs.readFile(path.join(run,'fixture.pid'),'utf8').catch(()=>null);if(pid&&/^\d+$/.test(pid))await promisify(execFile)(ps,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(cleanupScript,'utf16le').toString('base64')],{windowsHide:true,env:{...process.env,STUDIO_FIXTURE_PID:pid,STUDIO_FIXTURE_EXE:exe},timeout:10000}).catch(()=>{})}}
}
