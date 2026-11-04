const {spawnSync}=require('node:child_process');
const {mkdirSync,writeFileSync}=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
mkdirSync(path.join(root,'.test-tmp'),{recursive:true});
const names=['browser-review','new-requests-browser','schedule-selection-browser','import-missing-browser','import-loading-cancel-browser','bracket-review-browser','responsive-language-check','core-workflows','backup-validation','doubles-browser','draw-creation-matrix','interface-boundaries','structured-imports'];
const results=[];
for(const name of names){
  const result=spawnSync(process.execPath,[path.join(__dirname,'qa',name+'.cjs')],{cwd:root,encoding:'utf8',timeout:180000});
  const entry={name,passed:result.status===0,output:(result.stdout||'')+(result.stderr||''),error:result.error?.message};
  results.push(entry);console.log(`${entry.passed?'PASS':'FAIL'} ${name}`);
  if(!entry.passed)console.error(entry.output,entry.error||'');
}
writeFileSync(path.join(root,'.test-tmp','browser-qa-results.json'),JSON.stringify({date:new Date().toISOString(),results},null,2));
if(results.some(result=>!result.passed))process.exitCode=1;
