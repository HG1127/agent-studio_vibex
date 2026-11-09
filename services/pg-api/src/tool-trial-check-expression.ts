// Optional069 closed CHECK parser. Derived from the exact frozen062 pure
// parser with explicit JSON text extraction and IS TRUE support only.
const failure=():never=>{throw Error("unsafe_toolhub_check_expression")}
type Expr=string|boolean|unknown[]
type Token={kind:"word"|"string"|"number"|"symbol";value:string}
export function normalizeOwnerToolTrialCheckExpression(raw:string):string {
  const tokens:Token[]=[];let at=0
  while(at<raw.length){
    if(/\s/.test(raw[at]!)){at++;continue}
    if(raw.startsWith("--",at)||raw.startsWith("/*",at))return failure()
    const quote=raw[at]
    if(quote==="'"||quote==='"'){
      at++;let value="",closed=false
      while(at<raw.length){const c=raw[at++]!;if(c===quote){if(raw[at]===quote){value+=quote;at++}else{closed=true;break}}else value+=c}
      if(!closed)return failure();tokens.push({kind:quote==="'"?"string":"word",value});continue
    }
    const tail=raw.slice(at),word=/^[A-Za-z_][A-Za-z_0-9$]*/.exec(tail),num=/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(tail),op=/^(::|->>|<=|>=|<>|!=|\|\||[-+*\/=~<>(),.\[\]])/.exec(tail)
    if(word){tokens.push({kind:"word",value:word[0].toLowerCase()});at+=word[0].length}
    else if(num){tokens.push({kind:"number",value:num[0]});at+=num[0].length}
    else if(op){tokens.push({kind:"symbol",value:op[0]});at+=op[0].length}
    else return failure()
    if(tokens.length>2000)return failure()
  }
  let pos=0,depth=0
  const peek=(v:string)=>tokens[pos]?.value===v
  const take=()=>{const token=tokens[pos++];if(!token)return failure();return token}
  const need=(v:string)=>{if(!peek(v))return failure();pos++}
  const node=(v:Expr):unknown[]|undefined=>Array.isArray(v)?v:undefined
  const cast=(v:Expr,type:string):Expr=>{
    const n=node(v)
    if(type.startsWith("pg_catalog."))type=type.slice(11)
    if(n?.[0]==="str"&&["text","character varying"].includes(type))return v
    if(n?.[0]==="str"&&["bigint","integer","smallint","numeric","int8","int4","int2"].includes(type)&&/^-?\d+$/.test(String(n[1])))return ["num",BigInt(String(n[1])).toString()]
    if(n?.[0]==="array"&&["text[]","integer[]","bigint[]","smallint[]","int4[]","int8[]"].includes(type))return v
    if(n?.[0]==="str"&&["text[]","integer[]","bigint[]"].includes(type)){
      const text=String(n[1]);if(!/^\{[A-Za-z0-9_,]*\}$/.test(text))return failure()
      return ["array",...(text.slice(1,-1)?text.slice(1,-1).split(",").map(x=>type==="text[]"?["str",x]:["num",BigInt(x).toString()]):[])]
    }
    return ["cast",v,type]
  }
  const combine=(operator:string,left:Expr,right:Expr):Expr=>{
    if(operator==="!=")operator="<>"
    const r=node(right)
    if(r?.[0]==="fn"&&r[1]==="any"&&Array.isArray(r[2])&&r[2].length===1)return ["any",operator,left,r[2][0]]
    if(operator==="and"||operator==="or")return [operator,...(node(left)?.[0]===operator?(left as unknown[]).slice(1):[left]),...(node(right)?.[0]===operator?(right as unknown[]).slice(1):[right])]
    return [operator,left,right]
  }
  const expression=(minimum=0):Expr=>{
    if(++depth>100)return failure()
    let left:Expr;const token=take()
    if(token.value==="("){left=expression();need(")")}
    else if(token.kind==="string")left=["str",token.value]
    else if(token.kind==="number"){if(!/^\d+$/.test(token.value))return failure();left=["num",BigInt(token.value).toString()]}
    else if(token.value==="not")left=["not",expression(25)]
    else if(token.value==="-")left=["neg",expression(60)]
    else if(token.value==="true"||token.value==="false")left=token.value==="true"
    else if(token.value==="null")left=["null"]
    else if(token.value==="array"){
      need("[");const values:Expr[]=[];if(!peek("]")){for(;;){values.push(expression());if(!peek(","))break;pos++}}need("]");left=["array",...values]
    }else if(token.kind==="word"){
      let name=token.value
      while(peek(".")){pos++;const next=take();if(next.kind!=="word")return failure();name+="."+next.value}
      if(name.startsWith("pg_catalog."))name=name.slice(11)
      if(peek("(")){pos++;const args:Expr[]=[];if(!peek(")")){for(;;){args.push(expression());if(!peek(","))break;pos++}}need(")");left=["fn",name,args]}
      else left=["col",name]
    }else return failure()
    for(;;){
      if(peek("::")){
        if(70<minimum)break;pos++;let type=take();if(type.kind!=="word")return failure();let name=type.value
        while(peek(".")){pos++;type=take();if(type.kind!=="word")return failure();name+="."+type.value}
        if(peek("[")){pos++;need("]");name+="[]"}left=cast(left,name);continue
      }
      const op=tokens[pos]?.value
      const precedence=op==="->>"?35:op==="or"?10:op==="and"?20:["=","<>","!=","<",">","<=",">=","~","is","in","between"].includes(op??"")?30:["+","-","||"].includes(op??"")?40:["*","/"].includes(op??"")?50:-1
      if(precedence<minimum||precedence<0)break;pos++
      if(op==="is"){
        const negative=peek("not");if(negative)pos++
        if(peek("null")){pos++;left=[negative?"notnull":"isnull",left]}
        else if(peek("true")){pos++;left=[negative?"nottrue":"istrue",left]}
        else if(peek("distinct")){pos++;need("from");left=[negative?"notdistinct":"distinct",left,expression(31)]}
        else return failure()
      }else if(op==="between"){
        const lower=expression(31);need("and");const upper=expression(31);left=combine("and",[">=",left,lower],["<=",left,upper])
      }else if(op==="in"){
        need("(");const values:Expr[]=[];for(;;){values.push(expression());if(!peek(","))break;pos++}need(")");left=["any","=",left,["array",...values]]
      }else left=combine(op!,left,expression(precedence+1))
    }
    depth--;return left
  }
  if(peek("check"))pos++
  const value=expression();if(pos!==tokens.length)return failure();return JSON.stringify(value)
}
