// Keep HTML, CSS, the entire module graph and the offline shell on one revision.
import {readFile,writeFile,readdir} from 'node:fs/promises';
const version=process.argv[2];
if(!version||!/^[a-zA-Z0-9.-]+$/.test(version))throw Error('Use: npm run release:client -- 20261103.1');
const docs=new URL('../docs/',import.meta.url);
for(const entry of await readdir(docs)){
 if(!/\.(?:js|mjs|css|html)$/.test(entry))continue;
 const path=new URL(entry,docs);let value=await readFile(path,'utf8');
 if(/\.(?:js|mjs)$/.test(entry))value=value.replace(/(from\s*['"]\.\/[^'"?]+\.mjs)(?:\?v=[^'"]+)?(['"])/g,`$1?v=${version}$2`);
 if(entry==='boot.js'||entry==='sw.js')value=value.replace(/const VERSION='[^']+';/,`const VERSION='${version}';`);
 if(entry==='index.html')value=value.replace(/((?:src|href)=['"](?:boot\.js|style\.css))(?:\?v=[^'"]+)?(['"])/g,`$1?v=${version}$2`);
 if(entry==='style.css')value=value.replace(/(url\(['"]\.\/(?:tokens|base)\.css)(?:\?v=[^'"]+)?(['"]\))/g,`$1?v=${version}$2`);
 await writeFile(path,value);
}
