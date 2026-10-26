import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const names=['src/rules.mjs','src/spirit-sequence.mjs','src/match.mjs','src/plus-miracle.mjs','src/verified-basic-cards.mjs','src/catalog-audit.mjs'];
let all='';
for (const name of names){
  let s=fs.readFileSync(path.join(root,name),'utf8');
  s=s.replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*$/gm,'');
  if(/^import\s/m.test(s))throw new Error('Unexpected import '+name);
  s=s.replace(/\bexport\s+(?=(const|function|class)\b)/g,'');
  if(/\bexport\s/m.test(s))throw new Error('Unexpected export '+name);
  all+='\n// '+name+'\n'+s;
}
if(all.includes('</script'))throw new Error('Script delimiter');
const tpl=fs.readFileSync(path.join(root,'demo/template.html'),'utf8');
const out=tpl.replace('/*__ENGINE__*/',all);
fs.writeFileSync(path.join(root,'demo/standalone.html'),out,'utf8');
