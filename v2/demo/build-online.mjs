/**
 * V2 online iPad trial: create a dependency-free single HTML file.
 * The Firebase compat SDK is loaded at runtime from gstatic; all game logic
 * is embedded. This is a development fixture, not full original card rules.
 *
 * node v2/demo/build-online.mjs
 * node v2/demo/build-online.mjs --check
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MODULES} from './bundle-modules.mjs';

const ROOT=path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
export const ONLINE_MODULES=[...MODULES,
 'v2/local-room-host-fixture.mjs','v2/firebase-two-seat-transport-fixture.mjs'];
const IMPORT=/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm;
const EXPORT=/^export\s+(?:async\s+)?(?:const|function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;

export function buildOnlineHTML(){
 const parts=[],built=new Map();
 for(const name of ONLINE_MODULES){
  const source=fs.readFileSync(path.join(ROOT,name),'utf8');
  const id='__online_module_'+built.size;
  let bindings='';
  let converted=source.replace(IMPORT,(_,spec,relative)=>{
   const dependency=path.posix.normalize(
    path.posix.join(path.posix.dirname(name),relative));
   if(!built.has(dependency))throw Error('Missing dependency: '+name+' -> '+dependency);
   if(!/^\s*[A-Za-z0-9_$,\s]+\s*$/.test(spec))
    throw Error('Unsupported import in '+name);
   bindings+='const {'+spec+'} = '+built.get(dependency)+';\n';
   return '';
  });
  if(/^\s*import\s/m.test(converted))throw Error('Unhandled import in '+name);
  const names=[...converted.matchAll(EXPORT)].map(x=>x[1]);
  if(!names.length||new Set(names).size!==names.length)
   throw Error('Unsupported or duplicate exports in '+name);
  converted=converted.replace(/\bexport\s+(?=(?:async\s+)?(?:const|function|class)\b)/g,'');
  if(/\bexport\s/.test(converted))throw Error('Unsupported export in '+name);
  parts.push('const '+id+' = (() => {\n"use strict";\n'+bindings+
   '\n'+converted+'\nreturn {'+names.join(',')+'};\n})();');
  built.set(name,id);
 }
 const template=fs.readFileSync(
  path.join(ROOT,'v2/demo/firebase-online-lab.html'),'utf8');
 const entry=template.match(/<script type="module">([\s\S]*?)<\/script>/);
 if(!entry)throw Error('Online HTML module entrypoint not found');
 let bindings='';
 const entryPath='v2/demo/firebase-online-lab.html';
 let script=entry[1].replace(IMPORT,(_,spec,relative)=>{
  const dependency=path.posix.normalize(path.posix.join(
   path.posix.dirname(entryPath),relative));
  if(!built.has(dependency))throw Error('Missing online entry import: '+dependency);
  if(!/^\s*[A-Za-z0-9_$,\s]+\s*$/.test(spec))
   throw Error('Unsupported online entry import');
  bindings+='const {'+spec+'} = '+built.get(dependency)+';\n';
  return '';
 });
 if(/^\s*import\s/m.test(script))throw Error('Unhandled online entry import');
 const bundle=parts.join('\n\n')+'\n\n(()=>{\n"use strict";\n'+bindings+script+'\n})();';
 if(bundle.toLowerCase().includes('</script'))
  throw Error('Unexpected script closing marker in JavaScript bundle');
 return template.replace(entry[0],'<script>\n'+bundle+'\n</script>');
}
const target=path.join(ROOT,'v2/demo/firebase-online-standalone.html');
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 const generated=buildOnlineHTML();
 if(process.argv.includes('--check')){
  if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==generated){
   console.error('Online single-file bundle stale: node v2/demo/build-online.mjs');
   process.exitCode=1;
  }else console.log('Online single-file bundle is up to date');
 }else{
  fs.writeFileSync(target,generated,'utf8');
  console.log('Built '+target+' ('+generated.length+' chars)');
 }
}
