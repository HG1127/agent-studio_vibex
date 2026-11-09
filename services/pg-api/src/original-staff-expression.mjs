const bad=()=>{throw Error('original_staff_expression_unconfirmed')}
/** Small closed expression reader. Unlike text/parenthesis stripping this
 * preserves boolean precedence, call arguments and every operator/value. */
export function originalStaffExpression(source){
 if(typeof source!=='string'||source.length>32768)bad()
 const tokens=[];let offset=0
 const token=/\s+|'(?:[^']|'')*'|"(?:[^"]|"")*"|::|!~|>=|<=|<>|!=|[=<>~(),.\[\]+-]|[0-9]+|[A-Za-z_][A-Za-z0-9_]*/y
 while(offset<source.length){token.lastIndex=offset;const found=token.exec(source);if(!found)bad();offset=token.lastIndex;if(!/^\s+$/.test(found[0]))tokens.push(found[0]);if(tokens.length>10000)bad()}
 let cursor=0
 const peek=()=>tokens[cursor]?.toLowerCase(),take=value=>{if(peek()===value){cursor++;return true}return false},need=value=>{if(!take(value))bad()}
 const join=(op,a,b)=>[op,...(a[0]===op?a.slice(1):[a]),...(b[0]===op?b.slice(1):[b])]
 function primary(){
  let value,t=tokens[cursor++];if(t===undefined)bad()
  if(t.toLowerCase()==='interval'){const raw=tokens[cursor++];if(raw!=="'24 hours'"&&raw!=="'24:00:00'")bad();value=['interval','86400']}
  else if(t==='('){value=expression();need(')')}
  else if(t[0]==="'")value=['string',t.slice(1,-1).replaceAll("''", "'")]
  else if(/^[0-9]+$/.test(t)){if(!Number.isSafeInteger(Number(t)))bad();value=['number',String(Number(t))]}
  else if(t==='-'||t==='+'){const child=primary();if(child[0]!=='number')bad();value=['number',String((t==='-'?-1:1)*Number(child[1]))]}
  else{
   let name=t[0]==='"'?t.slice(1,-1).replaceAll('""','"'):t.toLowerCase();if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))bad()
   if(take('.')){if(name!=='pg_catalog')bad();const next=tokens[cursor++];if(!next||!/^[a-z_][a-z0-9_]*$/.test(next))bad();name=next}
   if(name==='array'&&take('[')){const items=[];if(!take(']')){do{items.push(expression())}while(take(','));need(']')}value=['array',...items]}
   else if(take('(')){const args=[];if(!take(')')){do{args.push(expression())}while(take(','));need(')')}value=['call',name,args]}
   else value=['name',name]
  }
  while(take('::')){
   let type=tokens[cursor++]?.toLowerCase();if(type==='pg_catalog'){need('.');type=tokens[cursor++]?.toLowerCase()}
   const array=take('[');if(array)need(']')
   if(type==='text'&&!array&&value[0]==='string')continue
   if(['integer','int4','bigint','int8','numeric'].includes(type)&&!array&&(value[0]==='number'||value[0]==='string'&&/^-?[0-9]+$/.test(value[1]))){const n=Number(value[1]);if(!Number.isSafeInteger(n))bad();value=['number',String(n)];continue}
   if(type==='text'&&array&&value[0]==='array'&&value.slice(1).every(v=>v[0]==='string'))continue
   if(type==='interval'&&!array&&value[0]==='string'&&['24 hours','24:00:00'].includes(value[1])){value=['interval','86400'];continue}
   // Any other cast remains semantic and must match a static authored cast.
   value=['cast',type+(array?'[]':''),value]
  }
  return value
 }
 function scalar(){let value=primary();while(peek()==='+'||peek()==='-'){const op=tokens[cursor++];value=[op,value,primary()]}return value}
 function comparison(){
  let left=scalar()
  if(take('between')){const low=primary();need('and');const high=primary();return join('and',['>=',left,low],['<=',left,high])}
  if(take('in')){need('(');const items=[];do{items.push(expression())}while(take(','));need(')');return['in',left,items]}
  if(take('is')){const negated=take('not');need('null');left=[negated?'is-not-null':'is-null',left]}
  const op=peek();if(['=','<>','!=','>','<','>=','<=','~','!~'].includes(op)){cursor++;const right=scalar();if(op==='='&&right[0]==='call'&&right[1]==='any'&&right[2].length===1&&right[2][0][0]==='array')return['in',left,right[2][0].slice(1)];return[op==='!='?'<>':op,left,right]}
  return left
 }
 function and(){let value=comparison();while(take('and'))value=join('and',value,comparison());return value}
 function expression(){let value=and();while(take('or'))value=join('or',value,and());return value}
 const value=expression();if(cursor!==tokens.length)bad();return JSON.stringify(value)
}
