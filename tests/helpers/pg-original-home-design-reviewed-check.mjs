import {requireOriginalHomeDesignBrowserCi} from './pg-original-home-design-browser-guard.mjs'
import {originalLoginReviewedSources} from './pg-original-login-reviewed-sources.mjs'
import {originalHomeDesignPath} from './pg-original-home-design-browser-policy.mjs'
// Reuses the existing fixed original-UI source map. Root must extend/reseal its
// final closure; this helper never learns hashes from the runtime checkout.
export async function verifyOriginalHomeDesignReviewedSources(env=process.env){
 const permit=requireOriginalHomeDesignBrowserCi(env)
 const [fs,path,url,crypto,child,{default:assert}]=await Promise.all([import('node:fs'),import('node:path'),import('node:url'),import('node:crypto'),import('node:child_process'),import('node:assert/strict')])
 const repo=fs.realpathSync(url.fileURLToPath(new URL('../../',import.meta.url)))
 const required=['index.html','src/main.tsx','src/App.tsx','src/pages/Home/useHome.ts','src/pages/Home/HomePage.tsx','src/lib/originalHomeDesign.ts','shared/original-home-design-metadata.ts',
  'src/components/home/CreateComposer.tsx','src/components/home/SpecEditorCard.tsx','services/pg-api/src/agent-design-http.ts','services/pg-api/src/agent-design-ledger.ts',
  'tests/helpers/pg-original-home-design-browser-guard.mjs','tests/helpers/pg-original-home-design-browser-policy.mjs','tests/helpers/pg-original-home-design-artifacts.mjs',
  'tests/helpers/pg-original-home-design-reviewed-check.mjs','tests/helpers/pg-original-home-design-backend-fixture.mjs','tests/helpers/pg-original-home-design-browser-fixture.mjs',
  'tests/pg-original-home-design-genuine.config.mjs','tests/pg-original-home-design-genuine.spec.mjs','tests/pg-original-home-design-browser-policy.test.mjs',
  'db/postgres/migrations/pg_v9_073_monitor_inbox.sql']
 for(const file of required)assert.match(originalLoginReviewedSources[file]??'',/^[a-f0-9]{64}$/,'Root final reviewed source closure is required: '+file)
 const check=()=>{
  assert.equal(child.execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8',maxBuffer:4096}).trim(),permit.head)
  assert.equal(child.execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:repo,encoding:'utf8',maxBuffer:65536}).trim(),'','original Home design requires clean exact-head source')
  for(const[file,expected]of Object.entries(originalLoginReviewedSources)){
   assert.equal(originalHomeDesignPath('/'+file),'/'+file);assert.match(expected,/^[a-f0-9]{64}$/)
   let at=repo;for(const part of file.split('/')){assert(!fs.lstatSync(at).isSymbolicLink());at=path.join(at,part)}
   const stat=fs.lstatSync(at),real=fs.realpathSync(at);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=16*1024*1024&&real.startsWith(repo+path.sep))
   assert.equal(crypto.createHash('sha256').update(fs.readFileSync(real)).digest('hex'),expected,'fixed original Home design source changed: '+file)
  }
 }
 check()
 return{repo,check,sources:Object.entries(originalLoginReviewedSources).map(([file,sha256])=>({file,sha256}))}
}
