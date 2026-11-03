import {renderReport} from './report-renderer.mjs'
process.once('disconnect',()=>process.exit(1))
process.once('message',async input=>{try{const file=await renderReport(input);process.send?.({ok:true,file},()=>process.exit(0))}catch(error){process.send?.({ok:false,error:typeof error?.code==='string'?error.code:'report_render_failed'},()=>process.exit(0))}})
