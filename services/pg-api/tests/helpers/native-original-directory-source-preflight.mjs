// Exact source/clean-head preflight, after the same closed CI purpose guard.
import {requireOriginalDirectoryCi} from './native-original-directory-policy.mjs'
import {originalDirectoryUiSourceReady} from './native-original-directory-ui-source.mjs'
export async function assertOriginalDirectoryReviewedSources(env=process.env){
 requireOriginalDirectoryCi(env)
 const [fs,path,url,crypto,child,{nativeOriginalDirectoryReviewedSources:sources}]=await Promise.all([import('node:fs'),import('node:path'),import('node:url'),import('node:crypto'),import('node:child_process'),import('./native-original-directory-reviewed-sources.mjs')])
 const root=path.resolve(url.fileURLToPath(new URL('../../../../',import.meta.url)))
 if(!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??''))throw Error('original_directory_exact_head_required')
 const git=args=>child.execFileSync('git',args,{cwd:root,env:{...env,GIT_OPTIONAL_LOCKS:'0'},encoding:'utf8',windowsHide:true,maxBuffer:65536}).trim()
 if(git(['rev-parse','HEAD'])!==env.GITHUB_SHA||git(['status','--porcelain','--untracked-files=normal'])!=='')throw Error('original_directory_clean_source_required')
 for(const[p,expected]of Object.entries(sources)){
  if(!/^[A-Za-z0-9_./-]+$/.test(p)||p.split('/').some(v=>!v||v==='.'||v==='..')||!/^[a-f0-9]{64}$/.test(expected))throw Error('original_directory_invalid_reviewed_source')
  let current=root;for(const part of p.split('/')){if(fs.lstatSync(current).isSymbolicLink())throw Error('original_directory_source_symlink');current=path.join(current,part)}
  const stat=fs.lstatSync(current);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>16*1024*1024||fs.realpathSync(current)!==current||crypto.createHash('sha256').update(fs.readFileSync(current)).digest('hex')!==expected)throw Error('original_directory_reviewed_source_changed')
 }
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8'),page=fs.readFileSync(path.join(root,'src/pages/ToolHub/ToolHubPage.tsx'),'utf8'),hook=fs.readFileSync(path.join(root,'src/pages/ToolHub/useToolHub.ts'),'utf8'),pgHook=fs.readFileSync(path.join(root,'src/pages/ToolHub/usePgOriginalToolHub.ts'),'utf8'),entry=fs.readFileSync(path.join(root,'src/pages/ToolHub/index.tsx'),'utf8')
 if(!originalDirectoryUiSourceReady(index,page,hook,pgHook,entry,env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED))throw Error('original_directory_requires_canonical_shell_and_reviewed_A_PG_adapter')
 return Object.freeze({source_files:Object.keys(sources).length,actual_original_entry:true,production_GO:false})
}
if(process.argv[1]&&import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href){if(process.argv[2]!=='--check')throw Error('original_directory_preflight_check_required');await assertOriginalDirectoryReviewedSources()}
