const {chromium}=require(process.env.RALLYDESK_PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:process.env.RALLYDESK_BROWSER_EXECUTABLE,headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/?demo',{waitUntil:'networkidle'});
 const backup=await page.evaluate(()=>JSON.parse(localStorage.getItem('rallydesk-demo-v1')));
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 const invalid=[{...backup,players:[{id:'incomplete',name:'Incomplete'}]},{...backup,players:[backup.players[0],backup.players[0]]},{...backup,matches:[{...backup.matches[0],playerOneId:'missing'}]},{...backup,matches:[{...backup.matches[0],events:[null]}]},{...backup,referees:[null]},{...backup,tournaments:[{...backup.tournaments[0],categories:[{id:'bad'}]}]}];
 for(const workspace of invalid){
  await page.locator('input[type=file]').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({workspace}))});
  await page.getByText('That file does not contain a valid Rallydesk workspace backup.').waitFor();
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('rallydesk-demo-v1'))),backup);
 }
 await page.locator('input[type=file]').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({workspace:backup}))});
 await page.getByRole('button',{name:'Restore workspace',exact:true}).click();await page.getByText('Backup restored to this browser.').waitFor();assert.deepEqual(errors,[]);
 console.log(JSON.stringify({invalidBackupsRejected:invalid.length,existingDataPreserved:true,validRestore:true,errors}));
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
