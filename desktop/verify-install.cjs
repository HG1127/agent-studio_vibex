'use strict'
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto')
async function verify(){
  const root=fs.realpathSync(path.resolve(process.argv[2]))
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'.studio-files.json'),'utf8'))
  const failures=[]
  for(const entry of manifest.files){
    try{
      const file=path.resolve(root,entry.path),real=fs.realpathSync(file)
      const owned=path.toNamespacedPath(root).toLowerCase()+path.sep
      if(!path.toNamespacedPath(real).toLowerCase().startsWith(owned)||fs.statSync(file).size!==entry.bytes)throw Error('path_or_size')
      const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk)
      if(hash.digest('hex')!==entry.sha256)throw Error('digest')
    }catch{failures.push(entry.path)}
  }
  fs.writeFileSync(path.join(root,'install-verification.json'),JSON.stringify({version:manifest.version,files:manifest.files.length,failed:failures},null,2))
  if(failures.length)throw Error('invalid_files:'+failures.length+':'+failures.slice(0,3).join(','))
  console.log('INSTALL_FILES_VERIFIED '+manifest.files.length)
}
verify().catch(error=>{console.error(String(error.message));process.exitCode=1})
