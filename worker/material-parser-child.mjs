import {parseMaterial} from './material-parser.mjs'
process.once('message',async input=>{
  try{const parsed=await parseMaterial(input);process.send?.({ok:true,parsed},()=>process.exit(0))}
  catch(error){process.send?.({ok:false,error:typeof error?.code==='string'?error.code:'material_parse_failed'},()=>process.exit(0))}
})
