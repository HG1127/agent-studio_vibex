import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash,createPrivateKey,createPublicKey,sign,randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const require=createRequire(import.meta.url),{safeUrl,compare,verifyManifest}=require('../desktop/update-core.cjs')
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
export async function publishDesktopUpdate({installer,baseUrl,output,key,notes='',releaseVersion}){
 const info=JSON.parse(await fs.readFile(path.join(root,'desktop/build-info.json'),'utf8'));releaseVersion||=info.version
 const trust=JSON.parse(await fs.readFile(path.join(root,'desktop/update-trust.json'),'utf8'))
 const privateKey=createPrivateKey(key),publicKey=createPublicKey(privateKey)
 if(!publicKey.export({type:'spki',format:'der'}).equals(createPublicKey(trust.publicKey).export({type:'spki',format:'der'})))throw Error('发布私钥与桌面版内置公钥不匹配')
 const bytes=await fs.readFile(installer),name='AgentStudio-Setup-'+releaseVersion+'-win-x64.exe'
 const base=new URL(safeUrl(baseUrl.endsWith('/')?baseUrl:baseUrl+'/'));if(base.search)throw Error('更新根地址不能包含查询参数')
 const metadata={schema:1,channel:'stable',platform:'win32-x64',version:releaseVersion,minimumVersion:'0.1.0-preview.10',url:new URL(releaseVersion+'/'+name,base).href,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),notes,publishedAt:new Date().toISOString()}
 const payload=Buffer.from(JSON.stringify(metadata)),envelope={payload:payload.toString('base64'),signature:sign(null,payload,privateKey).toString('base64')};verifyManifest(envelope,trust.publicKey)
 try{const latest=verifyManifest(JSON.parse(await fs.readFile(path.resolve(output,'stable/latest.json'),'utf8')),trust.publicKey);if(compare(releaseVersion,latest.version)<0)throw Error('不能将更新频道回退到较旧版本')}catch(error){if(error.code!=='ENOENT')throw error}
 const directory=path.resolve(output,releaseVersion);await fs.mkdir(directory,{recursive:true});const target=path.join(directory,name)
 try{const old=await fs.readFile(target);if(createHash('sha256').update(old).digest('hex')!==metadata.sha256)throw Error('同一版本已发布不同内容，请提升版本号')}catch(e){if(e.code!=='ENOENT')throw e}
 const temporary=target+'.'+randomUUID()+'.pending';await fs.writeFile(temporary,bytes,{flag:'wx'});await fs.rename(temporary,target)
 const stable=path.join(path.resolve(output),'stable');await fs.mkdir(stable,{recursive:true});const pending=path.join(stable,'latest-'+randomUUID()+'.pending');await fs.writeFile(pending,JSON.stringify(envelope,null,2));await fs.rename(pending,path.join(stable,'latest.json'))
 return {version:releaseVersion,installer:target,manifest:path.join(stable,'latest.json'),url:new URL('stable/latest.json',base).href,sha256:metadata.sha256}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options={};for(const arg of process.argv.slice(2)){const m=/^--(installer|base-url|output|key-file|notes-file)=(.+)$/.exec(arg);if(!m||options[m[1]])throw Error('参数格式错误或重复');options[m[1]]=m[2]}
 for(const name of ['installer','base-url','output'])if(!options[name])throw Error('缺少 --'+name)
 const key=options['key-file']?await fs.readFile(options['key-file'],'utf8'):process.env.DESKTOP_UPDATE_PRIVATE_KEY;if(!key)throw Error('请配置 DESKTOP_UPDATE_PRIVATE_KEY 或 --key-file，不能临时生成另一套密钥')
 const result=await publishDesktopUpdate({installer:options.installer,baseUrl:options['base-url'],output:options.output,key,notes:options['notes-file']?await fs.readFile(options['notes-file'],'utf8'):''});console.log('DESKTOP_UPDATE_PUBLISHED '+JSON.stringify(result))
}
