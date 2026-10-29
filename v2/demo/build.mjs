/**
 * V2 offline bundle builder (zero npm dependencies).
 *
 * NOT a general-purpose JS bundler. It accepts only the intentionally limited
 * named-import and declaration-export syntax of the listed lab modules and
 * fails closed if source syntax evolves. Modules remain isolated in closures.
 *
 * Usage:
 *   node v2/demo/build.mjs          regenerate standalone.html
 *   node v2/demo/build.mjs --check  verify checked-in output is up to date
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
export const MODULES=[
 'src/rules.mjs','src/verified-basic-cards.mjs',
 'v2/foundation.mjs','v2/redirect-route.mjs','v2/legacy-adapter.mjs',
 'v2/trade-payment.mjs','v2/hand-overflow.mjs','v2/trade-buy.mjs',
 'v2/trade-exchange.mjs','v2/zero-hp-recovery.mjs',
 'v2/trade-self-sale.mjs','v2/dream-candidate-audit.mjs',
 'v2/dream-appearance.mjs',
 'v2/staging-room.mjs','v2/effect-runner.mjs','v2/trade-buy-settlement.mjs',
 'v2/trade-sale.mjs','v2/trade-reflection.mjs','v2/trade-lethal-review.mjs',
 'v2/staged-sale.mjs',
 'v2/staged-buy.mjs',
 'v2/ordered-attack.mjs',
 'v2/basic-resolution.mjs','v2/wall-resolution.mjs',
 'v2/redirect-resolution.mjs','v2/miracle-resolution.mjs',
 'v2/room-transition.mjs','v2/lab-controller.mjs','v2/lab-ui.mjs'
];
const IMPORT=/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm;
const EXPORT=/^export\s+(?:const|function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;
function makeOutput(){
 const parts=[],built=new Map();
 for(const name of MODULES){
   const file=path.join(root,name);
   const source=fs.readFileSync(file,'utf8');
   const id='__v2_module_'+built.size;
   let bindings='';
   let converted=source.replace(IMPORT,(_,spec,relative)=>{
     const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(name),relative));
     if(!built.has(dependency))throw new Error('Dependency not built: '+name+' -> '+dependency);
     if(!/^\s*[A-Za-z0-9_$,\s]+\s*$/.test(spec))throw new Error('Unsupported named import in '+name);
     bindings+='const {'+spec+'} = '+built.get(dependency)+';\n';
     return '';
   });
   if(/^\s*import\s/m.test(converted))throw new Error('Unexpected import in '+name);
   const names=[...converted.matchAll(EXPORT)].map(x=>x[1]);
   if(!names.length)throw new Error('No supported exports in '+name);
   if(new Set(names).size!==names.length)throw new Error('Duplicate exported name in '+name);
   converted=converted.replace(/\bexport\s+(?=(?:const|function|class)\b)/g,'');
   if(/\bexport\s/.test(converted))throw new Error('Unsupported export in '+name);
   parts.push('const '+id+' = (() => {\n"use strict";\n'+bindings+'\n'+converted+
     '\nreturn {'+names.join(',')+'};\n})();');
   built.set(name,id);
 }
 const entry=built.get('v2/lab-ui.mjs');
 // Stable test fixture hooks: adding engine modules must never shift the
 // browser tap tests onto another numbered closure.
 parts.push('const __v2_lab_test_controller = '+built.get('v2/lab-controller.mjs')+';');
 parts.push('const __v2_lab_test_ui = '+entry+';');
 parts.push('__v2_lab_test_ui.mountV2Lab(document.getElementById("v2-root"));');
 const javascript=parts.join('\n\n');
 if(javascript.toLowerCase().includes('</script'))throw new Error('Script delimiter in generated JS');
 const template=fs.readFileSync(path.join(root,'v2/demo/template.html'),'utf8');
 const marker='/*__V2_BUNDLE__*/';
 if(template.split(marker).length!==2)throw new Error('Expected one script marker');
 return template.replace(marker,javascript);
}
const generated=makeOutput();
const output=path.join(root,'v2/demo/standalone.html');
if(process.argv.includes('--check')){
 if(!fs.existsSync(output)||fs.readFileSync(output,'utf8')!==generated){
   process.stderr.write('V2 demo HTML is missing or stale. Run node v2/demo/build.mjs\n');
   process.exitCode=1;
 } else process.stdout.write('V2 demo bundle is up to date\n');
} else {
 fs.writeFileSync(output,generated,'utf8');
 process.stdout.write('Built '+output+' ('+generated.length+' UTF-16 chars)\n');
}
