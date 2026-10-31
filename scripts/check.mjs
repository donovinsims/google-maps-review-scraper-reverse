import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const files=[];
function visit(dir,exclude=''){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory()){if(file!==exclude)visit(file,exclude);}else if(/\.(js|mjs)$/.test(file))files.push(file);}}
visit('src');
visit('scripts',path.join('scripts','archive'));
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
console.log(`Syntax checked ${files.length} source files`);
const test=spawnSync('npm',['test'],{stdio:'inherit'});process.exitCode=test.status??1;
