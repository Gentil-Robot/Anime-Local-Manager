'use strict';
// Read the historical snapshot format as DATA. No supplied SQL is executed.
const columns=['malId','title','titleEn','titleRomaji','synonyms','genres','episodes','score','type','studios','imageUrl','synopsis','startDate','endDate','rank','popularity','members','rating','duration'];
const names=new Map(columns.map(name=>[name.toLowerCase(),name]));
const invalid=()=>{throw Error('ALM_METADATA_SQL_FORMAT: only metadata INSERT VALUES literals are accepted');};
function* statements(text){
 let quote=false,line=false,comment=false,start=0,parts=[];
 for(let i=0;i<text.length;i++){
  const c=text[i],next=text[i+1];
  if(line){if(c==='\n'){line=false;start=i;}continue;}
  if(comment){if(c==='*'&&next==='/'){comment=false;i++;start=i+1;}continue;}
  if(quote){if(c==="'"){if(next==="'")i++;else quote=false;}continue;}
  if(c==='-'&&next==='-'){parts.push(text.slice(start,i),' ');line=true;i++;continue;}
  if(c==='/'&&next==='*'){parts.push(text.slice(start,i),' ');comment=true;i++;continue;}
  if(c==="'")quote=true;
  if(c===';'){parts.push(text.slice(start,i));const statement=parts.join('').trim();if(statement)yield statement;parts=[];start=i+1;}
 }
 if(quote||comment)invalid();
 if(!line)parts.push(text.slice(start));const tail=parts.join('').trim();if(tail)yield tail;
}
function* parseValues(source,keys){
 let pos=0;
 const ws=()=>{while(/\s/.test(source[pos]||'')&&pos<source.length)pos++;};
 const take=c=>{ws();if(source[pos++]!==c)invalid();};
 function value(){
  ws();if(source[pos]==="'"){
   pos++;let start=pos,size=0;const parts=[];let closed=false;
   while(pos<source.length){const c=source[pos++];if(c==="'"){if(source[pos]==="'"){const part=source.slice(start,pos-1);parts.push(part,"'");size+=part.length+1;pos++;start=pos;}else{parts.push(source.slice(start,pos-1));closed=true;break;}}if(size+pos-start>1024*1024)invalid();}
   if(!closed)invalid();return parts.join('');
  }
  const match=/^(NULL\b|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/i.exec(source.slice(pos));
  if(!match)invalid();pos+=match[0].length;if(/^null$/i.test(match[0]))return null;
  const result=Number(match[0]);if(!Number.isFinite(result))invalid();return result;
 }
 do{
  take('(');const row={};
  for(let i=0;i<keys.length;i++){if(i)take(',');row[keys[i]]=value();}
  take(')');
  if(!Number.isSafeInteger(Number(row.malId))||Number(row.malId)<1||typeof row.title!=='string'||!row.title.trim())invalid();
  yield row;ws();if(pos===source.length)break;take(',');ws();if(pos===source.length)invalid();
 }while(pos<source.length);
 ws();if(pos!==source.length)invalid();
}
function* readMetadataSqlRows(input){
 const text=String(input||'').replace(/^\uFEFF/,'');
 if(!text.trim()||Buffer.byteLength(text,'utf8')>256*1024*1024)invalid();
 let count=0;
 for(const statement of statements(text)){
  // These historical declarations are discarded, never sent to SQLite.
  if(/^(?:BEGIN(?:\s+TRANSACTION)?|COMMIT|END(?:\s+TRANSACTION)?)$/i.test(statement))continue;
  if(/^PRAGMA\s+foreign_keys\s*=\s*(?:ON|OFF|0|1)$/i.test(statement))continue;
  if(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:metadata|metadata_sync)\s*\([\s\S]*\)$/i.test(statement))continue;
  if(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?\w+\s+ON\s+metadata\s*\([\s\S]*\)$/i.test(statement))continue;
  const insert=/^INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+metadata\s*\(([^)]+)\)\s*VALUES\s*([\s\S]+)$/i.exec(statement);
  if(!insert)invalid();
  const keys=insert[1].split(',').map(key=>names.get(key.trim().replace(/^"|"$/g,'').toLowerCase()));
  if(keys.some(key=>!key)||new Set(keys).size!==keys.length||!keys.includes('malId')||!keys.includes('title'))invalid();
  for(const row of parseValues(insert[2],keys)){if(++count>100000)invalid();yield row;}
 }
 if(!count)invalid();
}
const metadataSqlRows=input=>Array.from(readMetadataSqlRows(input));
module.exports={metadataSqlRows,readMetadataSqlRows};
