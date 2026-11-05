const {chromium}=require(process.env.RALLYDESK_PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.RALLYDESK_BROWSER_EXECUTABLE,headless:true});
 const results=[];
 try{
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:1000}});
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto((process.env.RALLYDESK_BASE_URL||'http://127.0.0.1:5174')+'/?demo',{waitUntil:'networkidle'});
   for(const name of ['Overview','Matches','Tournaments','Players','Referees','Statistics','Exports & recovery','Settings','Club guide','About Rallydesk']){
    const menu=page.getByRole('button',{name:'Open navigation',exact:true});
    if(await menu.isVisible())await menu.click();
    await page.locator('#rallydesk-sidebar').getByRole('button',{name,exact:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} overflow at ${width}`);
    assert.ok(await page.locator('.page-wrap').innerText());
   }
   assert.deepEqual(errors,[]);results.push({width,pages:10,errors});
   await page.screenshot({path:`.test-tmp/production-about-${width}.png`});
   await context.close();
  }
  fs.writeFileSync('.test-tmp/production-smoke.json',JSON.stringify({at:new Date().toISOString(),results},null,2));
  console.log(JSON.stringify(results));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
